# Changelog

## Unreleased - roaming Capri, online search, power mode

### Capri roams your desktop
- New transparent, frameless, always-on-top window (`web/pet.html`, `pet.js`, `pet.css`) where Capri floats along the taskbar, glides around, sits on top of the active window, peeks in from screen edges, glitch-teleports, falls when you drop her, and falls asleep when you leave her alone. Speech from the chat appears in her bubble and her mouth moves while she talks.
- Double-click her to open the chat, drag her anywhere, right-click for Open chat / Stay put / Back to my corner / Hide / Quit. The ROAM toggle in the chat turns her on or off (remembered).
- While she roams, the chat window's X button hides the chat instead of quitting; **Ctrl+Alt+C** shows or hides it from anywhere. EXIT or Quit closes everything.
- Original code on the existing Lachy sprites. mochiiwuff/capri-desktop was used as a behaviour reference only: its artwork is excluded from its license and its WebGL rig depends on that artwork, so no code or art was copied.

### New functions
- **ONLINE** toggle (off by default): `web_search` through DuckDuckGo with a Wikipedia fallback, or your own SearXNG (`CAPRI_SEARXNG_URL`) or Brave Search key (`CAPRI_BRAVE_API_KEY`). Results are treated as untrusted text, answered from a compact prompt with no tools, and shown as clickable sources that open in your browser. Queries containing keys, passwords, or card numbers are refused.
- **POWER** toggle (off by default, never remembered, two clicks to enable): `run_command` may propose any normal-user Command Prompt or PowerShell command, shown on a red approval card. A blocklist still refuses wiping, security changes, download-and-run, encoded commands, admin elevation, and network paths. 60-second timeout, whole process tree stopped on timeout.
- **Music:** `now_playing` reads the Spotify song and artist (also shown next to the player buttons); `play_music` opens Spotify on a search; playback and volume keys now run without an approval card.
- **open_website** (approval) opens an http/https address in your browser; `javascript:`, `file:`, and other schemes are refused.
- **read_clipboard** (approval) explains or summarizes the text you just copied, for one reply only.

### Tests
- 76 tests (was 64), including the DuckDuckGo parser, provider fallback, website validation, the power-mode blocklist, mode-aware tool selection, the model being unable to switch power mode on by itself, web answers with sources, and the roaming-window state endpoint.

## Netrunner deck: desktop app, security, voice, and tools

### Desktop app
- Capri face icon (`web/capri.ico`, `web/capri-icon.png`), cut from the existing Lachy idle sprite by `tools/make_icon.py`; it stays under the sprite's PolyForm Noncommercial terms. It appears on the desktop shortcut, the window, and the taskbar (own AppUserModelID, so Windows no longer groups Capri with Python).
- `install_desktop_shortcut.bat`/`.ps1` create Desktop and Start-menu shortcuts that start Capri with `pythonw.exe` (no console). Setup runs it automatically. It uses `GetFolderPath('Desktop')`, so OneDrive-redirected desktops work.
- `companion.py` now starts Capri's private Ollama service itself (in the background, so the window opens at once) and stops it on exit if it started it. `run_capri.bat` no longer waits 20 seconds polling an empty port on every launch; setup no longer waits about 48 seconds.
- Single-instance guard, and startup errors are shown in a dialog because the icon launch has no console.
- Full cyberpunk redesign: notched HUD frames, scanlines, glitch titles, live CPU/RAM/disk/battery meters, holo-tank avatar stage, terminal-style composer, striped approval cards. System fonts only (offline, strict CSP).

### Security and privacy
- **Per-launch token:** every `/api/` request must carry a secret generated at startup and handed to the window in the URL fragment. Other programs, other Windows users, and web pages can no longer drive Capri's API even though loopback is reachable. The token is never printed or logged; a copied link without it shows a locked screen.
- **Encryption at rest:** memory and chat history are sealed with Windows DPAPI (per-user). Older plaintext files still load and are encrypted on their next save.
- **Secret redaction:** API keys and tokens (OpenAI/Anthropic/GitHub/AWS/Slack/Google/JWT), private keys, `password: …` values, and Luhn-valid card numbers are removed before chat history or memory is written. The memory tool refuses facts that contain them.
- The browser no longer keeps a plaintext copy of the chat in `localStorage` (the old copy is deleted on start).
- Command tool: `dir`/`tree`/`where`/`cd` must stay inside the approved folder (no drive letters, absolute paths, `..`, hidden-file `/a` or recursive-search `/r` switches, or sensitive names). `netstat <interval>` is refused (it never ends). On timeout the whole process tree is killed, so an orphaned child can no longer hang the server thread.
- The model can only call tools that were offered for the current request.
- Fixed: `passwords.txt`, `secrets.json`, `credentials.json` and similar plural names were not treated as sensitive by the file tools.
- Command output and security status are shown once and not saved to chat history, matching file listings.
- Socket timeout on the local server.

### Voice
- New default **Capri** voice: an original blend of Kokoro's `af_sky`, `af_nicole`, and `af_bella` styles, lifted about one semitone. It is not a clone of the anime actor.
- Optional **VOICE FX** "digital construct" filter (light chorus and a bright band) in Web Audio.
- Speech starts after the first sentence: replies are synthesized sentence by sentence while earlier pieces play; Stop/Esc cancels the whole queue.
- Speech recognition and synthesis use separate locks, so transcription no longer waits behind a long reply.

### New functions
- Auto-run read-only tools (the model answers with the result): `system_stats` (CPU, RAM, disk, battery, uptime), `calculate` (exact math through a whitelisted AST evaluator, never `eval`), `set_timer` (countdown with alarm, notice, and voice).
- Approval-gated: `lock_pc`, and volume up/down/mute through `control_media` (also as buttons).
- Capri knows the local date and time.

### Model
- Default context stays at the measured 2,048 tokens; `CAPRI_NUM_CTX=4096` opts into larger budgets.
- Replies that hit the token cap end on the last full sentence instead of mid-word; ordinary replies get 100 tokens (was 64), detailed ones 300 (was 144).
- `keep_alive` is 30 minutes instead of forever, so a crash cannot pin the model in VRAM; a clean exit still unloads it at once.
- Ollama is started with flash attention and an 8-bit KV cache (user settings win). The persona prompt is a fixed first message so Ollama can reuse its cached prefix.
- The installed-model list is cached for 15 s instead of fetched on every message. Screenshots are refused with a clear message when the chosen model has no vision support.

### Fixes
- Saving from the Memory dialog deleted everything after 5,000 characters (the editor received only the first 5,000 of up to 15,000). It now gets the whole file and shows which notes fit Capri's prompt.
- The chosen model reset to the default on every launch; the "Bella" voice reset to Sky on every launch.
- A new custom avatar did not appear until restart (cached image).
- A failed screen analysis said the action "did not run" although the screenshot was taken.
- The microphone stayed on if recording failed to start.
- CLEAR MEMORY now needs a second click. EXIT (and closing the page) flushes the pending history save.
- Canned interface lines ("I want to use one local action…", "Left that one alone…") are no longer saved as Capri's words or fed back to the model.
- "Do you remember that movie?" no longer offers the memory tool.
- Approved actions that fail (for example Spotify not installed) report the real error instead of "a local service is not ready".
- The chat no longer jumps to the bottom while you scroll up to read.
- Replies render safe Markdown (code blocks, inline code, bold, lists) without `innerHTML`.
- `test_failed_action_can_be_retried` really opened Notepad on Windows; tool launching is now mocked. CI also runs the unit tests on Windows.

### Tests
- 64 tests (was 42): launch token, offered-tools-only, auto tools, timers, calculator safety, redaction, private storage, memory editor round trip, command sandbox, and a new file-sandbox suite.

## Earlier - audit and hardening pass

### Security
- `/api/execute-tool` now requires a server-issued, one-time approval ID and runs the server's stored copy of the action. Previously any local process could call it directly with arbitrary actions and arguments, because approval existed only in the browser. Now only actions the model proposed, with the arguments the card displayed, can run.
- The command validator is a testable function (`validate_command`). It now rejects `^`, network (UNC) paths, remote-target switches on `tasklist`/`systeminfo`/`driverquery`, and any `ipconfig` option that changes network state (`/release`, `/renew`, `/flushdns`, `/registerdns`, ...). These previously passed the "read-only" allowlist.
- Commands run with `NoDefaultCurrentDirectoryInExePath=1` and full `System32` paths (blocks planting `whoami.exe` and similar in Downloads).
- Disallowed commands are refused with a reason instead of producing an approval card that can never run.
- Avatar uploads are verified as real, bounded-size WebP images rather than just checking the first bytes.
- Screenshot requests no longer include saved memory or recalled chats in the prompt.
- Added `Cross-Origin-Resource-Policy`; the security headers are defined once.
- Setup verifies the Kokoro model and voice-pack downloads against pinned SHA-256 checksums.

### Fixes
- Closing the window with the X button left the model loaded in VRAM (`keep_alive: -1`); it is now unloaded on every exit path.
- The Exit button stopped the server but left the desktop window open; it now closes the window.
- The 30-second background refresh reset the avatar and status line mid-reply and rebuilt the dropdowns (closing any open one). It is now quiet unless the model's availability actually changes.
- Error messages were saved into chat history and sent back to the model as if Capri had said them. They are now shown as system notices only.
- A large memory file (up to 15,000 characters) or long command output could exceed the 2,048-token context and silently push out the persona prompt. Prompt content is now budgeted.
- If speech was interrupted while a screenshot reply was waiting, the reply was never shown.
- Malformed microphone audio returned a generic 500; it is now a clear 400.
- Memory is written atomically.
- Setup text with non-ASCII characters is ASCII now (Windows PowerShell 5.1 displayed it garbled), plus a clear message when Python 3.13 is missing.
- Stale text: "open the folder in your outputs", "3K context" (the real window is 2K), and private/public wording.

### Added
- Esc / STOP VOICE button; opening the mic stops speech; Esc closes dialogs and discards a recording.
- Two-step confirmation on Clear Chat.
- `setup_local_model.bat` (double-click setup), `.gitattributes`, `pyproject.toml`, GitHub Actions CI.
- 42 tests with a fake Ollama server.
- Larger text (7-9px labels raised to 10-11px), visible keyboard focus, honors reduced-motion in the sprite animation, pauses animation when the window is hidden.
- `CAPRI_DEBUG=1` and `CAPRI_MODEL` environment options.
- Cursor-aware avatar lean and short pose-based success/error reactions, implemented in CapriCompanion's own UI code after reviewing mochiiwuff's documented animation direction; no source or art from that project was copied.
- `THIRD_PARTY_NOTICES.md` and explicit ACE07X source attribution, keeping the original code and separately licensed fan sprites distinct.
- Added `LICENSE` with the user's selected MIT terms for original source code; art stays under its existing separate license.
- Added individually approved, read-only file listing for Documents/Downloads/Desktop and bounded UTF-8 text/code previews with sensitive/hidden/system/reparse-path checks. A read preview goes only to local Ollama for a one-turn summary with tools, saved memory, and recalled chats disabled; raw excerpts and listings are not persisted.
- Added `AI_PROJECT_RESEARCH.md` to record relevant local AI/voice projects and the license boundary decisions. File-tool design was informed by `solas2529/local-ollama-agent`, but no source code or artwork from that project was copied.
- Reconfirmed that Mochiiwuff's MIT source license excludes their anime-derived avatar art. No Mochiiwuff artwork was redistributed; existing sprite art remains under Lachy's separate PolyForm Noncommercial license and notice.
