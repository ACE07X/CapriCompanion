# Changelog

## Unreleased - audit and hardening pass

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
