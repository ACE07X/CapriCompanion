"""Tests for the local Capri server.

Run from the project folder with:  python -m unittest discover -s tests -v

No third-party packages, GPU, Ollama, or Windows are required. A tiny fake Ollama server stands in
for the model, and all local data is redirected into a temporary folder.
"""

from __future__ import annotations

import http.client
import io
import json
import shutil
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import companion  # noqa: E402


class FakeOllama(BaseHTTPRequestHandler):
    """Minimal stand-in for Ollama's /api/tags, /api/chat, and /api/generate."""

    models = ["qwen3.5:4b"]
    received: list[dict] = []
    tool_call: dict | None = None  # when set, /api/chat answers with this tool call

    def log_message(self, *_args) -> None:
        return

    def _reply(self, value: dict) -> None:
        data = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        self._reply({"models": [{"name": name} for name in self.models] + [{"name": "x:cloud"}]})

    def do_POST(self) -> None:  # noqa: N802
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOllama.received.append({"path": self.path, **body})
        if self.path == "/api/generate":
            self._reply({"done": True})
            return
        if FakeOllama.tool_call:
            self._reply({"message": {"role": "assistant", "content": "", "tool_calls": [{"function": FakeOllama.tool_call}]}})
            return
        if body.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()
            for part in ("Hel", "lo ", "choom"):
                self.wfile.write((json.dumps({"message": {"role": "assistant", "content": part}}) + "\n").encode())
            self.wfile.write((json.dumps({"done": True}) + "\n").encode())
            return
        self._reply({"message": {"role": "assistant", "content": "Hello choom"}})


def serve(handler, port: int = 0) -> tuple[ThreadingHTTPServer, threading.Thread]:
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
    thread.start()
    return server, thread


class ValidateCommandTests(unittest.TestCase):
    def test_accepts_simple_read_only_commands(self) -> None:
        for command in ("whoami", "hostname", "ver", "ipconfig", "ipconfig /all", "tasklist", "systeminfo", "dir /w", "tree", "vol", "netstat -ano", "  whoami  "):
            with self.subTest(command=command):
                self.assertEqual(companion.validate_command(command), command.strip())

    def test_rejects_chaining_redirection_and_variables(self) -> None:
        for command in ("whoami & calc", "dir | more", "dir; dir", "dir > x.txt", "dir < x", "echo %PATH%", "dir `x`", "whoami\ncalc", "dir ^& calc", "dir !x"):
            with self.subTest(command=command), self.assertRaises(ValueError):
                companion.validate_command(command)

    def test_rejects_commands_outside_allowlist(self) -> None:
        for command in ("del file.txt", "powershell -c 1", "calc", "format c:", "net user", "dir.exe", "dir/w", "reg query HKLM"):
            with self.subTest(command=command), self.assertRaises(ValueError):
                companion.validate_command(command)

    def test_ipconfig_cannot_change_network_state(self) -> None:
        for command in ("ipconfig /release", "ipconfig /renew", "ipconfig /flushdns", "ipconfig /registerdns", "ipconfig /RELEASE6", "ipconfig /all /renew"):
            with self.subTest(command=command), self.assertRaises(ValueError):
                companion.validate_command(command)

    def test_remote_targets_are_blocked(self) -> None:
        for command in ("systeminfo /s otherpc", "tasklist /S otherpc /U bob", "driverquery /s host", "tasklist /p secret", "dir \\\\attacker\\share", "dir //attacker/share"):
            with self.subTest(command=command), self.assertRaises(ValueError):
                companion.validate_command(command)

    def test_local_switches_that_look_similar_still_work(self) -> None:
        # /si (signed drivers) and dir /s (recurse) are local and must not be caught by the remote-flag check.
        self.assertEqual(companion.validate_command("driverquery /si"), "driverquery /si")
        self.assertEqual(companion.validate_command("dir /s"), "dir /s")

    def test_rejects_bad_types_and_lengths(self) -> None:
        for value in (None, 5, "", "   ", "dir " + "a" * 1300):
            with self.subTest(value=value[:10] if isinstance(value, str) else value), self.assertRaises(ValueError):
                companion.validate_command(value)


class ToolSelectionTests(unittest.TestCase):
    def names(self, text: str, image=None) -> set[str]:
        return {tool["function"]["name"] for tool in companion._tools_for_request([{"role": "user", "content": text}], image)}

    def test_matches_explicit_requests_only(self) -> None:
        self.assertEqual(self.names("hey what's up"), set())
        self.assertIn("see_screen", self.names("can you look at my screen?"))
        self.assertIn("open_app", self.names("please open spotify"))
        self.assertIn("control_media", self.names("skip this song"))
        self.assertIn("remember_user_detail", self.names("remember that I like synthwave"))
        self.assertIn("run_command", self.names("run the command ipconfig"))
        self.assertIn("check_windows_security", self.names("is my firewall on?"))

    def test_no_tools_while_analysing_a_screenshot(self) -> None:
        self.assertEqual(self.names("look at my screen", image="abc"), set())


class FitContextTests(unittest.TestCase):
    def test_long_memory_keeps_most_recent_whole_lines(self) -> None:
        memory = "\n".join(f"- fact number {i:03d} " + "x" * 30 for i in range(200))
        trimmed, _, _ = companion.fit_context(memory, "", [{"role": "user", "content": "hi"}])
        self.assertLessEqual(len(trimmed), companion.MEMORY_PROMPT_CHARS)
        self.assertTrue(trimmed.endswith("fact number 199 " + "x" * 30))
        self.assertTrue(all(line.startswith("- fact") for line in trimmed.splitlines()))

    def test_single_oversized_memory_line_is_trimmed_not_dropped(self) -> None:
        trimmed, _, _ = companion.fit_context("- " + "x" * 5000, "", [{"role": "user", "content": "hi"}])
        self.assertEqual(len(trimmed), companion.MEMORY_PROMPT_CHARS)

    def test_total_stays_within_budget_and_newest_message_survives(self) -> None:
        chat = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"msg{i} " + "y" * 1400} for i in range(4)]
        chat.append({"role": "user", "content": "newest " + "z" * 400})
        memory, recalled, kept = companion.fit_context("- likes jazz", "User: old\nCapri: older", chat)
        total = len(memory) + len(recalled) + sum(len(m["content"]) for m in kept)
        self.assertLessEqual(total, companion.CONTEXT_CHAR_BUDGET)
        self.assertTrue(kept[-1]["content"].startswith("newest"))
        self.assertEqual(memory, "- likes jazz")

    def test_recalled_excerpts_are_dropped_first(self) -> None:
        chat = [{"role": "user", "content": "q" * 985}]
        memory, recalled, _ = companion.fit_context("- likes jazz", "old stuff", chat, budget=1000)
        self.assertEqual(recalled, "")
        self.assertEqual(memory, "- likes jazz")  # memory outranks recalled excerpts

    def test_oversized_newest_message_is_capped(self) -> None:
        _, _, kept = companion.fit_context("", "", [{"role": "user", "content": "a" * 3000}])
        self.assertEqual(len(kept[0]["content"]), companion.NEWEST_MESSAGE_CHARS)

    def test_does_not_start_with_a_dangling_assistant_turn(self) -> None:
        chat = [{"role": "user", "content": "u" * 1500}, {"role": "assistant", "content": "a" * 1400}, {"role": "user", "content": "now"}]
        _, _, kept = companion.fit_context("", "", chat, budget=1600)
        self.assertEqual(kept[0]["role"], "user")


class ApprovalTests(unittest.TestCase):
    def test_action_can_be_taken_once(self) -> None:
        approval_id = companion.register_pending_action("open_app", {"app": "notepad"})
        entry = companion.take_pending_action(approval_id)
        self.assertEqual((entry["name"], entry["arguments"]), ("open_app", {"app": "notepad"}))
        with self.assertRaises(ValueError):
            companion.take_pending_action(approval_id)

    def test_unknown_and_non_string_ids_are_rejected(self) -> None:
        for value in ("nope", None, 12, ["x"], {"a": 1}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                companion.take_pending_action(value)

    def test_expired_action_is_rejected(self) -> None:
        approval_id = companion.register_pending_action("open_app", {"app": "notepad"})
        companion._pending_actions[approval_id]["expires"] = time.monotonic() - 1
        with self.assertRaises(ValueError):
            companion.take_pending_action(approval_id)

    def test_restore_allows_retry(self) -> None:
        approval_id = companion.register_pending_action("open_app", {"app": "notepad"})
        entry = companion.take_pending_action(approval_id)
        companion.restore_pending_action(approval_id, entry)
        self.assertEqual(companion.take_pending_action(approval_id)["name"], "open_app")

    def test_pending_table_is_bounded(self) -> None:
        for _ in range(100):
            companion.register_pending_action("open_app", {"app": "notepad"})
        self.assertLessEqual(len(companion._pending_actions), 32)


class TextHelperTests(unittest.TestCase):
    def test_spoken_line_drops_stage_cues_markdown_and_code(self) -> None:
        text = "[grins] Hey *choom*, try `this`:\n```\nrm -rf\n```\ndone"
        spoken = companion.clean_spoken_line(text)
        self.assertNotIn("grins", spoken)
        self.assertNotIn("rm -rf", spoken)
        self.assertIn("code omitted", spoken)
        self.assertNotIn("*", spoken)

    def test_message_validation(self) -> None:
        raw = [{"role": "system", "content": "x"}, {"role": "user", "content": "  "}, {"role": "user", "content": 5}, "junk", {"role": "user", "content": "ok"}]
        self.assertEqual(companion._valid_chat_messages(raw), [{"role": "user", "content": "ok"}])
        self.assertEqual(companion._valid_chat_messages("nope"), [])

    def test_sensitive_pattern(self) -> None:
        for text in ("my password is hunter2", "API key: abc", "here is my credit card", "otp 123"):
            self.assertTrue(companion.SENSITIVE_MEMORY_PATTERN.search(text), text)
        self.assertFalse(companion.SENSITIVE_MEMORY_PATTERN.search("I like synthwave and tinkering with mods"))


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="capri-test-"))
        cls.saved = {name: getattr(companion, name) for name in ("LOCAL_DATA", "MEMORY_PATH", "HISTORY_PATH", "AVATAR_PATH", "OLLAMA")}
        companion.LOCAL_DATA = cls.tmp
        companion.MEMORY_PATH = cls.tmp / "memory.txt"
        companion.HISTORY_PATH = cls.tmp / "chat_history.json"
        companion.AVATAR_PATH = cls.tmp / "avatar.webp"
        cls.ollama, _ = serve(FakeOllama)
        companion.OLLAMA = f"http://127.0.0.1:{cls.ollama.server_address[1]}"
        cls.server, _ = serve(companion.Handler)
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.ollama.shutdown()
        for name, value in cls.saved.items():
            setattr(companion, name, value)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self) -> None:
        FakeOllama.received = []
        FakeOllama.tool_call = None
        for path in (companion.MEMORY_PATH, companion.HISTORY_PATH, companion.AVATAR_PATH):
            path.unlink(missing_ok=True)
        shutil.rmtree(self.tmp / "Notes", ignore_errors=True)

    def request(self, method: str, path: str, body=None, headers=None, raw: bool = False):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = dict(headers or {})
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
            headers.setdefault("Content-Type", "application/json")
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response, (data if raw else (json.loads(data) if data and response.getheader("Content-Type", "").startswith("application/json") else data))

    # --- static files and headers
    def test_pages_are_served_with_security_headers(self) -> None:
        for path in ("/", "/assets/app.js", "/assets/styles.css", "/assets/capri.png", "/assets/sprites/idle.png"):
            with self.subTest(path=path):
                response, _ = self.request("GET", path)
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
                self.assertIn("script-src 'self'", response.getheader("Content-Security-Policy"))
                self.assertEqual(response.getheader("Cross-Origin-Resource-Policy"), "same-origin")

    def test_unknown_sprite_and_path_traversal_are_not_served(self) -> None:
        for path in ("/assets/sprites/../../companion.py", "/assets/sprites/nope.png", "/assets/../companion.py", "/companion.py"):
            with self.subTest(path=path):
                response, _ = self.request("GET", path)
                self.assertEqual(response.status, 404)

    # --- request origin checks
    def test_foreign_host_origin_and_cross_site_requests_are_refused(self) -> None:
        for headers in ({"Host": "evil.example"}, {"Host": f"127.0.0.1.evil.example:{self.port}"}, {"Sec-Fetch-Site": "cross-site"}, {"Sec-Fetch-Site": "same-site"}, {"Origin": "http://evil.example"}):
            with self.subTest(headers=headers):
                response, _ = self.request("GET", "/api/memory", headers=headers)
                self.assertEqual(response.status, 403)

    def test_same_origin_request_is_allowed(self) -> None:
        response, _ = self.request("GET", "/api/memory", headers={"Origin": f"http://127.0.0.1:{self.port}", "Sec-Fetch-Site": "same-origin"})
        self.assertEqual(response.status, 200)

    # --- health
    def test_health_lists_local_models_and_hides_cloud_models(self) -> None:
        _, data = self.request("GET", "/api/health")
        self.assertTrue(data["ollama"])
        self.assertEqual(data["models"], ["qwen3.5:4b"])

    # --- memory and history
    def test_memory_round_trip_is_atomic_and_clearable(self) -> None:
        self.request("POST", "/api/memory", {"content": "- likes jazz"})
        _, data = self.request("GET", "/api/memory")
        self.assertEqual(data["content"], "- likes jazz")
        self.assertFalse((self.tmp / "memory.txt.tmp").exists())
        self.request("POST", "/api/memory", {"content": "   "})
        _, data = self.request("GET", "/api/memory")
        self.assertEqual(data["content"], "")

    def test_history_round_trip_filters_junk(self) -> None:
        self.request("POST", "/api/history", {"messages": [{"role": "user", "content": "hi"}, {"role": "system", "content": "no"}, "x"]})
        _, data = self.request("GET", "/api/history")
        self.assertEqual(data["messages"], [{"role": "user", "content": "hi"}])

    def test_json_content_type_is_required(self) -> None:
        response, _ = self.request("POST", "/api/memory", body=b'{"content":"x"}', headers={"Content-Type": "text/plain"})
        self.assertEqual(response.status, 400)

    # --- chat
    def test_plain_chat_and_unknown_model(self) -> None:
        response, data = self.request("POST", "/api/chat", {"model": "qwen3.5:4b", "messages": [{"role": "user", "content": "hello"}]})
        self.assertEqual((response.status, data["reply"]), (200, "Hello choom"))
        response, _ = self.request("POST", "/api/chat", {"model": "other:1b", "messages": [{"role": "user", "content": "hello"}]})
        self.assertEqual(response.status, 400)

    def test_streaming_chat_emits_tokens_then_result(self) -> None:
        _, raw = self.request("POST", "/api/chat", {"model": "qwen3.5:4b", "stream": True, "messages": [{"role": "user", "content": "hello"}]}, raw=True)
        events = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
        self.assertEqual("".join(e["token"] for e in events if "token" in e), "Hello choom")
        self.assertEqual(events[-1]["result"]["reply"], "Hello choom")

    def test_prompt_sent_to_model_fits_the_context_budget(self) -> None:
        self.request("POST", "/api/memory", {"content": "\n".join(f"- fact {i} " + "m" * 60 for i in range(150))})
        chat = [{"role": "user" if i % 2 == 0 else "assistant", "content": "c" * 900} for i in range(3)] + [{"role": "user", "content": "what do you remember about me?"}]
        self.request("POST", "/api/chat", {"model": "qwen3.5:4b", "messages": chat})
        sent = FakeOllama.received[-1]
        self.assertEqual(sent["messages"][0]["content"], companion.SYSTEM_PROMPT)
        self.assertEqual(sent["options"]["num_ctx"], companion.NUM_CTX)
        extra = sum(len(m["content"]) for m in sent["messages"][1:])
        self.assertLessEqual(extra, companion.CONTEXT_CHAR_BUDGET + 400)  # + the two fixed memory/recall labels
        self.assertEqual(sent["messages"][-1]["content"], "what do you remember about me?")

    # --- approvals
    def propose(self, name: str, arguments: dict) -> dict:
        FakeOllama.tool_call = {"name": name, "arguments": arguments}
        _, data = self.request("POST", "/api/chat", {"model": "qwen3.5:4b", "messages": [{"role": "user", "content": "save a note please"}]})
        FakeOllama.tool_call = None
        return data

    def test_execute_requires_a_server_issued_approval(self) -> None:
        for body in ({}, {"approval_id": "forged"}, {"name": "save_note", "arguments": {"title": "t", "content": "c"}}):
            with self.subTest(body=body):
                response, _ = self.request("POST", "/api/execute-tool", body)
                self.assertEqual(response.status, 400)
        self.assertFalse((self.tmp / "Notes").exists())

    def test_approved_action_runs_once_using_the_servers_copy(self) -> None:
        data = self.propose("save_note", {"title": "Plan", "content": "ship it"})
        action = data["pending_action"]
        self.assertTrue(action["approval_id"])
        # The client tries to swap in different arguments; the server must ignore them.
        response, result = self.request("POST", "/api/execute-tool", {"approval_id": action["approval_id"], "name": "open_app", "arguments": {"app": "notepad"}})
        self.assertEqual(response.status, 200, result)
        notes = list((self.tmp / "Notes").glob("*.md"))
        self.assertEqual(len(notes), 1)
        self.assertIn("ship it", notes[0].read_text(encoding="utf-8"))
        response, _ = self.request("POST", "/api/execute-tool", {"approval_id": action["approval_id"]})
        self.assertEqual(response.status, 400)  # already used

    def test_failed_action_can_be_retried(self) -> None:
        data = self.propose("open_app", {"app": "notepad"})  # fails off Windows
        approval_id = data["pending_action"]["approval_id"]
        first, _ = self.request("POST", "/api/execute-tool", {"approval_id": approval_id})
        second, body = self.request("POST", "/api/execute-tool", {"approval_id": approval_id})
        self.assertEqual(first.status, second.status)
        self.assertNotIn("expired", json.dumps(body))

    def test_disallowed_command_never_reaches_an_approval_card(self) -> None:
        data = self.propose("run_command", {"command": "ipconfig /release"})
        self.assertNotIn("pending_action", data)
        self.assertIn("can't run", data["reply"])

    def test_allowed_command_gets_a_normalized_card(self) -> None:
        data = self.propose("run_command", {"command": "  whoami  ", "directory": "home"})
        self.assertEqual(data["pending_action"]["arguments"]["command"], "whoami")

    def test_memory_tool_rejects_secrets_and_duplicates(self) -> None:
        self.assertIn("did not save", companion.execute_tool("remember_user_detail", {"content": "my password is hunter2"}))
        self.assertIn("Saved", companion.execute_tool("remember_user_detail", {"content": "I like synthwave"}))
        self.assertIn("already", companion.execute_tool("remember_user_detail", {"content": "i like synthwave"}))

    # --- avatar
    def test_avatar_rejects_fake_and_accepts_real_webp(self) -> None:
        fake = b"RIFF\x00\x00\x00\x00WEBPnot really an image"
        response, _ = self.request("POST", "/api/avatar", fake, headers={"Content-Type": "image/webp"})
        self.assertEqual(response.status, 400)
        response, _ = self.request("POST", "/api/avatar", b"plain text, definitely not an image", headers={"Content-Type": "image/webp"})
        self.assertEqual(response.status, 400)
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is not installed")
        buffer = io.BytesIO()
        Image.new("RGB", (32, 32), "magenta").save(buffer, format="WEBP")
        response, data = self.request("POST", "/api/avatar", buffer.getvalue(), headers={"Content-Type": "image/webp"})
        self.assertEqual((response.status, data["saved"]), (200, True))
        _, data = self.request("GET", "/api/avatar-status")
        self.assertTrue(data["available"])
        self.request("POST", "/api/avatar", {"reset": True})
        _, data = self.request("GET", "/api/avatar-status")
        self.assertFalse(data["available"])

    # --- shutdown
    def test_unload_model_asks_ollama_to_free_memory_once(self) -> None:
        companion._last_model_used = "qwen3.5:4b"
        companion.unload_model()
        companion.unload_model()  # second call is a no-op
        unloads = [r for r in FakeOllama.received if r["path"] == "/api/generate"]
        self.assertEqual(len(unloads), 1)
        self.assertEqual((unloads[0]["model"], unloads[0]["keep_alive"]), ("qwen3.5:4b", 0))


if __name__ == "__main__":
    unittest.main()

