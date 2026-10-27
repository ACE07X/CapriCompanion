# Capri Local Companion

A local-first Windows desktop companion inspired by Capri from *Cyberpunk: Edgerunners 2*. It runs Qwen3.5 4B through Ollama, uses offline speech tools, keeps chat and approved memories on this PC, and offers permission-gated screen and desktop actions.

**Repository visibility:** public. Original CapriCompanion source code is copyright © 2026 ACE07X and licensed under MIT; bundled Capri sprites have separate noncommercial terms. See [`LICENSE`](LICENSE), [`CAPRI_ASSET_LICENSE.md`](CAPRI_ASSET_LICENSE.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the boundaries.

For a Claude-ready inventory of every tracked file, animation and desktop feature references, model/voice rankings, and separate licensing rules, see [`CLAUDE_BUILD_REFERENCE.md`](CLAUDE_BUILD_REFERENCE.md).

## What is included

- **Desktop app with Capri's face:** setup adds a **Capri** icon to your Desktop and Start menu. It opens her own window (no console) with her face on the taskbar, and she starts and stops her private Ollama service herself.
- **She roams your desktop:** Capri floats along your taskbar, sits on top of the window you are using, peeks in from screen edges, and glitch-teleports around. Double-click her to chat, drag her anywhere, right-click for options. **Ctrl+Alt+C** shows or hides the chat.
- **Optional online search:** switch **ONLINE** on and she can search the web (DuckDuckGo, Wikipedia fallback, or your own SearXNG/Brave key) and show her sources. Off by default; only your search words leave the PC.
- **Optional power mode:** switch **POWER** on (per session) and she can propose any normal-user Command Prompt or PowerShell command. Every command still needs your approval, and wipe, security-change, download-and-run, and admin commands stay blocked.
- **Music:** she can tell you which Spotify song is playing, open Spotify on a search for what you want to hear, skip, pause, and change the volume.
- **Netrunner-deck interface:** a cyberpunk redesign with HUD frames, scanlines, glitch titles, live CPU/RAM/disk/battery meters, and a holo-tank avatar stage.
- **More functions:** exact calculator, PC stats, timers with an alarm, volume up/down/mute, lock-PC, clipboard explain, and open-website, on top of screen help, file reads, media keys, notes, and memory. Read-only helpers run straight away; anything that changes your PC still needs approval.
- **Faster local chat:** Qwen3.5 4B uses a six-message recent context, a 2,048-token context window (opt in to 4,096 with `CAPRI_NUM_CTX=4096`), and a 100-token reply cap for ordinary chat (300 for requests that need detail); a reply that hits the cap ends on its last full sentence. Ordinary replies stream as they are generated, and only relevant PC-action definitions are sent to the model. The model stays loaded while Capri is open and unloads on exit; the first reply after launch still has to load it.
- **Stop controls:** press **Esc** (or the STOP VOICE button) to silence Capri mid-sentence; Esc also closes dialogs and discards an in-progress recording. Opening the microphone stops her voice automatically.
- **Offline voice:** Vosk transcribes locally; Kokoro-ONNX runs on CPU with a four-thread limit. The default **Capri** voice is an original blend of Kokoro's `af_sky`, `af_nicole`, and `af_bella` styles lifted about a semitone, with an optional VOICE FX "digital construct" filter. Speech is synthesized sentence by sentence, so she starts talking after the first sentence. Bracketed visual cues are removed from speech, and optional sound effects are synthesized locally. The voice is an original preset, not a clone of the anime actor.
- **Animated avatar:** Capri's original 240-pixel sprite cells use their proper frame counts. She stays anchored while her pose changes for thinking, speaking, glitches, waking, and sleeping; brief glitches add anime-style scanline and color-split flickers. You can select a local image; it stays in `.capri-data\avatar.webp`.
- **Edgerunners color pass:** The dark interface uses neon yellow, hot pink, red, and green for focus, alerts, success, and avatar effects.
- **User-controlled memory:** chat history is stored locally (up to 300 messages) and relevant older exchanges can be recalled. Say “remember I like…” to save a harmless hobby, preference, or project detail after approval. Edit or clear notes in the app. To fit her 2K context window, Capri reads roughly the most recent 900 characters of memory (about 15 short notes).
- **Permission-first PC tools:** ask Capri to look at your screen and she shows an approval card before capturing one image of the primary display. The image goes only to the local vision model and is not saved. Ask to list names or read a text file in Documents, Downloads, or Desktop; each request gets its own approval card. File access is read-only, non-recursive for listings, limited to common text/code files, and blocks hidden, system, credential-like, oversized, binary, and out-of-folder paths. A read sends a bounded excerpt only to local Ollama for a one-turn summary; source text and file listings are not saved to chat history. A read-only Command Prompt helper supports a limited set of Windows checks; the exact command and folder appear for approval before it runs. Other bounded actions can open allowlisted apps/folders, check Defender/firewall, save notes, and send media keys.
- **Spotify controls:** the buttons and voice/chat actions use Windows media keys. They work with the active Windows media player, such as Spotify; Capri cannot see which player or song is active. Spotify itself still needs its usual internet connection. The replay button sends Previous, which may restart the current track depending on where it is in the song.
- **Cybersecurity helper:** defensive guidance for systems the user owns or is authorized to assess. Live vulnerability feeds and current threat intelligence require the internet and are unavailable in offline mode.

## Setup

The expected PC has an RTX 4060 with 8 GB VRAM and an Intel Core i5-12400F. Qwen3.5 4B is about 3.3–4.0 GB on disk. A warm short-reply check showed text in 0.48 seconds and finished in 0.80 seconds; this is one local measurement. A cold request took about 90 seconds to show its first text while Ollama loaded the model. The first run downloads the model and speech assets; after that, chat, screen analysis, and voice work offline.

1. Double-click `setup_local_model.bat` (it runs `setup_local_model.ps1`). The script asks before installing or downloading anything, verifies the voice-model downloads against pinned SHA-256 checksums, and adds the **Capri** desktop icon.
2. Double-click the **Capri** icon (or run `run_capri.bat` to see a console for troubleshooting). If the icon is missing, run `install_desktop_shortcut.bat`.
3. If the local model was installed while Capri was open, click the refresh button beside the model selector.

Setup uses Python 3.13, Pillow for one-time screen capture, Ollama for Windows, `qwen3.5:4b`, Vosk, and Kokoro-82M ONNX voice files. The voice model is Apache-2.0 and its ONNX runtime is MIT-licensed. The Capri sprite artwork is from [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) under PolyForm Noncommercial 1.0.0; the required notice is in `CAPRI_ASSET_LICENSE.md`.

## Local data and privacy

The app opens in its own Windows desktop window using WebView2. Its API binds to `127.0.0.1` only. Chat and approved screen images go only to the local Ollama service. A screenshot exists only in memory for that request; it is not added to chat history or written to disk. Microphone audio is used for local transcription and is not saved. Chats, memory, the custom avatar, models, and webview profile stay under `.capri-data`, which Git ignores.

The 4B model reserves GPU memory while it is loaded. Capri keeps it warm while the desktop app is open and unloads it when you exit. Sound effects are optional and can be switched off with the SFX control.

## Security model

Capri can touch your PC, so the limits are enforced by the server and not only by the interface:

- **Only her own window can talk to her.** Each launch creates a secret key that is passed to the window in the URL fragment (never sent over HTTP, printed, or logged). Every `/api/` request must present it, so other programs, other Windows users, and web pages cannot use Capri's API even though they can reach `127.0.0.1`.
- **Encrypted at rest.** Memory and chat history are encrypted with Windows DPAPI for your Windows account; copying `.capri-data` to another account or PC does not reveal them. API keys, tokens, private keys, passwords written as `password: …`, and card numbers are removed before anything is saved. The browser profile no longer holds a plaintext chat copy.

- **Approvals are enforced server-side.** When the model proposes an action, the server stores it and issues a one-time approval ID. `/api/execute-tool` runs *only* that stored action, once, within 15 minutes; the name and arguments in the request are ignored. A page, script, or other local process therefore cannot run arbitrary actions or supply its own arguments; at most it can trigger an action the model itself proposed, and every action the model can propose is limited to the bounded, allowlisted set below. (The per-launch key blocks ordinary local programs, but malware already running as your Windows account can read process memory, so keep the PC itself trusted.) A failed run can be retried from the same card.
- **Commands are validated before an approval card is even shown.** One command from a fixed read-only allowlist; no chaining, redirection, variables, or `^` escapes; `dir`, `tree`, `where`, and `cd` stay inside the chosen folder (no drive letters, absolute paths, `..`, hidden-file or recursive-search switches); `netstat` refresh intervals are refused and a timed-out command's whole process tree is stopped; `ipconfig` is limited to `/all`, `/allcompartments`, and `/displaydns` (so no `/release`, `/renew`, or `/flushdns`); `tasklist`, `systeminfo`, and `driverquery` cannot target another computer; network (UNC) paths are rejected so a command can never send your Windows credentials to a remote share.
- **File access stays narrow.** Capri can list one folder at a time or read one specifically named file under Documents, Downloads, or Desktop; it does not recursively search. Reads are UTF-8 only, at most 2 MB from disk and 4,000 characters into the local app. Hidden/system/reparse-point entries, sensitive-looking names, unsupported extensions, and paths that escape the chosen folder are refused. The file excerpt is untrusted data: the summary request receives no saved memory, recalled chats, or PC-action tools, and the excerpt itself is not saved.
- **No look-alike programs.** Commands run with `NoDefaultCurrentDirectoryInExePath` set and through full `System32` paths, so a file named `whoami.exe` dropped in Downloads is not launched.
- **Loopback only.** The server binds to `127.0.0.1`, checks the `Host`, `Origin`, and `Sec-Fetch-Site` headers (blocking DNS-rebinding and cross-site requests), and sends a strict Content-Security-Policy.
- **Screenshots are minimal.** A screenshot request sends the model neither your saved memory nor older chats, so text that appears on screen cannot be used to coax personal notes out of the prompt.

## Local cybersecurity limits

Capri can explain security concepts, offer defensive hardening, interpret pasted logs, run a read-only Defender/firewall check, and use a small read-only command allowlist. Commands run as the normal user, never as administrator, and require one-time approval. She cannot use the internet in offline mode, run arbitrary scripts, exploit code, or scan external targets.

## Roadmap and inspiration

The current version has a native window, local memory and recall, approval-gated screen vision, read-only command checks, synchronized speech, sound cues, and additional avatar reactions. See [`ROADMAP.md`](ROADMAP.md) for current status and next steps.

1. **Desktop package:** add a tray icon, hide/show hotkey, and installer.
2. **More useful vision:** add user-approved window selection and optional screen OCR while keeping images temporary.
3. **Voice quality:** tune timing and expressive local presets further, with interrupt controls.
4. **Memory tools:** add archive search and per-project note views with export and erase controls.

I used public Capri desktop projects as feature references. [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) provides the animated sprites used here and informed Capri's character prompt and reactions. [mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop) informed the new cursor-aware movement and pose-based success/error beats. Its MIT license covers its source code, but explicitly excludes its Capri artwork; no code or artwork from that project is included here. [solas2529/local-ollama-agent](https://github.com/solas2529/local-ollama-agent) was reviewed for local model/file-tool design; Capri's bounded file tools use its general least-access ideas, with original implementation and no copied source. [TheAgencyMGE/capri-companion](https://github.com/TheAgencyMGE/capri-companion) is another useful reference for permission-first desktop tools. These are unofficial fan projects; the anime character and original designs remain owned by their rights holders. The official [Edgerunners 2 character page](https://www.cyberpunk.net/en/edgerunners2) does not list Capri or provide her avatar art. The offline voice engine is [Kokoro-ONNX](https://github.com/thewh1teagle/kokoro-onnx) with [Apache-licensed Kokoro-82M weights](https://huggingface.co/hexgrad/Kokoro-82M), not an anime actor voice model. See [`AI_PROJECT_RESEARCH.md`](AI_PROJECT_RESEARCH.md) for reviewed projects and license boundaries.

## Main files

- `companion.py` — local desktop window, Ollama connection, memory, safe tools, Vosk, and Kokoro TTS.
- `web/` — animated companion interface.
- `setup_local_model.ps1` — confirmation-gated first-time installation and downloads.
- `run_capri.bat` — starts Capri after setup with a console (the desktop icon starts her without one).
- `install_desktop_shortcut.bat` — (re)creates the Capri desktop and Start-menu icons.
- `CAPRI_ASSET_LICENSE.md` — required license terms and attribution for the noncommercial fan sprites.
- `THIRD_PARTY_NOTICES.md` — explains which terms apply to art and code, including projects used as references.
- `AI_PROJECT_RESEARCH.md` — GitHub projects reviewed for useful, license-compatible features.
- `ROADMAP.md` — current capabilities and planned improvements.
- `PROJECT_FILES.md` — a guide to every tracked file and local-only data folder.

## Model and voice references

- [Qwen3.5 4B in Ollama](https://ollama.com/library/qwen3.5) — local model details and size.
- [Ollama Windows download](https://ollama.com/download/windows) — model runtime.
- [Vosk offline speech recognition](https://alphacephei.com/vosk/) — speech-to-text engine and model catalog.
- [Kokoro-ONNX](https://github.com/thewh1teagle/kokoro-onnx) — MIT-licensed ONNX inference engine.
- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M) — Apache-2.0 model weights and voice preset details.

## Development and tests

No third-party packages are needed to run the tests, and they work on any OS (no GPU, Ollama, or Windows required). A tiny fake Ollama server stands in for the model.

```
python -m unittest discover -s tests -v
pip install ruff && ruff check .
node --check web/app.js
```

The tests cover command and file sandboxes, tool selection and auto-run tools, the calculator, timers, secret redaction, context budgeting, the approval flow, the launch key and request-origin checks, avatar upload validation, encrypted memory/history storage, streaming chat, and model unloading. GitHub Actions runs them on Linux and Windows on every push, and parses the PowerShell scripts.

Set `CAPRI_DEBUG=1` to print server tracebacks to the console while troubleshooting (conversation text is never logged). Set `CAPRI_MODEL` to change the default model name, and `CAPRI_NUM_CTX=4096` to try a larger context after checking VRAM and latency. `CAPRI_BROWSER_MODE=1` opens Capri in your browser instead of her own window.

## License

Original CapriCompanion source code is copyright © 2026 ACE07X and licensed under MIT. The MIT license does not apply to the bundled third-party Capri artwork, which remains under its separate noncommercial terms in `CAPRI_ASSET_LICENSE.md`. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for third-party boundaries.
