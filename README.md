# Capri Local Companion

A local-first Windows desktop companion inspired by Capri from *Cyberpunk: Edgerunners 2*. It runs Qwen3.5 4B through Ollama, uses offline speech tools, keeps chat and approved memories on this PC, and offers permission-gated screen and desktop actions.

**Repository visibility:** public. Original CapriCompanion source code is copyright © 2026 ACE07X and licensed under MIT; bundled Capri sprites have separate noncommercial terms. See [`LICENSE`](LICENSE), [`CAPRI_ASSET_LICENSE.md`](CAPRI_ASSET_LICENSE.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the boundaries.

## What is included

- **Faster local chat:** Qwen3.5 4B uses a four-message recent context, a 2,048-token context window, and a 64-token reply cap for ordinary chat (144 for requests that need detail). Ordinary replies stream as they are generated, and only relevant PC-action definitions are sent to the model. The model stays loaded while Capri is open and unloads on exit; the first reply after launch still has to load it.
- **Stop controls:** press **Esc** (or the STOP VOICE button) to silence Capri mid-sentence; Esc also closes dialogs and discards an in-progress recording. Opening the microphone stops her voice automatically.
- **Offline voice:** Vosk transcribes locally; Kokoro-ONNX uses the playful `af_sky` preset by default and runs on CPU with a four-thread limit. Text appears while the reply streams, then local voice generation starts. Bracketed visual cues are removed from speech, and optional sound effects are synthesized locally. The voice is an original preset, not a clone of the anime actor.
- **Animated avatar:** Capri's original 240-pixel sprite cells use their proper frame counts. She stays anchored while her pose changes for thinking, speaking, glitches, waking, and sleeping; brief glitches add anime-style scanline and color-split flickers. You can select a local image; it stays in `.capri-data\avatar.webp`.
- **Edgerunners color pass:** The dark interface uses neon yellow, hot pink, red, and green for focus, alerts, success, and avatar effects.
- **User-controlled memory:** chat history is stored locally (up to 300 messages) and relevant older exchanges can be recalled. Say “remember I like…” to save a harmless hobby, preference, or project detail after approval. Edit or clear notes in the app. To fit her 2K context window, Capri reads roughly the most recent 900 characters of memory (about 15 short notes).
- **Permission-first PC tools:** ask Capri to look at your screen and she shows an approval card before capturing one image of the primary display. The image goes only to the local vision model and is not saved. Ask to list names or read a text file in Documents, Downloads, or Desktop; each request gets its own approval card. File access is read-only, non-recursive for listings, limited to common text/code files, and blocks hidden, system, credential-like, oversized, binary, and out-of-folder paths. A read sends a bounded excerpt only to local Ollama for a one-turn summary; source text and file listings are not saved to chat history. A read-only Command Prompt helper supports a limited set of Windows checks; the exact command and folder appear for approval before it runs. Other bounded actions can open allowlisted apps/folders, check Defender/firewall, save notes, and send media keys.
- **Spotify controls:** the buttons and voice/chat actions use Windows media keys. They work with the active Windows media player, such as Spotify; Capri cannot see which player or song is active. Spotify itself still needs its usual internet connection. The replay button sends Previous, which may restart the current track depending on where it is in the song.
- **Cybersecurity helper:** defensive guidance for systems the user owns or is authorized to assess. Live vulnerability feeds and current threat intelligence require the internet and are unavailable in offline mode.

## Setup

The expected PC has an RTX 4060 with 8 GB VRAM and an Intel Core i5-12400F. Qwen3.5 4B is about 3.3–4.0 GB on disk. A warm short-reply check showed text in 0.48 seconds and finished in 0.80 seconds; this is one local measurement. A cold request took about 90 seconds to show its first text while Ollama loaded the model. The first run downloads the model and speech assets; after that, chat, screen analysis, and voice work offline.

1. Double-click `setup_local_model.bat` (it runs `setup_local_model.ps1`). The script asks before installing or downloading anything, and verifies the voice-model downloads against pinned SHA-256 checksums.
2. Run `run_capri.bat`.
3. If the local model was installed while Capri was open, click the refresh button beside the model selector.

Setup uses Python 3.13, Pillow for one-time screen capture, Ollama for Windows, `qwen3.5:4b`, Vosk, and Kokoro-82M ONNX voice files. The voice model is Apache-2.0 and its ONNX runtime is MIT-licensed. The Capri sprite artwork is from [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) under PolyForm Noncommercial 1.0.0; the required notice is in `CAPRI_ASSET_LICENSE.md`.

## Local data and privacy

The app opens in its own Windows desktop window using WebView2. Its API binds to `127.0.0.1` only. Chat and approved screen images go only to the local Ollama service. A screenshot exists only in memory for that request; it is not added to chat history or written to disk. Microphone audio is used for local transcription and is not saved. Chats, memory, the custom avatar, models, and webview profile stay under `.capri-data`, which Git ignores.

The 4B model reserves GPU memory while it is loaded. Capri keeps it warm while the desktop app is open and unloads it when you exit. Sound effects are optional and can be switched off with the SFX control.

## Security model

Capri can touch your PC, so the limits are enforced by the server and not only by the interface:

- **Approvals are enforced server-side.** When the model proposes an action, the server stores it and issues a one-time approval ID. `/api/execute-tool` runs *only* that stored action, once, within 15 minutes; the name and arguments in the request are ignored. A page, script, or other local process therefore cannot run arbitrary actions or supply its own arguments; at most it can trigger an action the model itself proposed, and every action the model can propose is limited to the bounded, allowlisted set below. (The approval card is a UI safeguard on a loopback server: a program already running as you on this PC could still start a chat and approve what the model proposes, so keep the PC itself trusted.) A failed run can be retried from the same card.
- **Commands are validated before an approval card is even shown.** One command from a fixed read-only allowlist; no chaining, redirection, variables, or `^` escapes; `ipconfig` is limited to `/all`, `/allcompartments`, and `/displaydns` (so no `/release`, `/renew`, or `/flushdns`); `tasklist`, `systeminfo`, and `driverquery` cannot target another computer; network (UNC) paths are rejected so a command can never send your Windows credentials to a remote share.
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
- `run_capri.bat` — starts Capri after setup.
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

The tests cover command validation, tool selection, context budgeting, the approval flow, request-origin checks, avatar upload validation, memory/history storage, streaming chat, and model unloading. GitHub Actions runs them on every push, and also parses `setup_local_model.ps1` on a Windows runner.

Set `CAPRI_DEBUG=1` to print server tracebacks to the console while troubleshooting (conversation text is never logged). Set `CAPRI_MODEL` to change the default model name.

## License

Original CapriCompanion source code is copyright © 2026 ACE07X and licensed under MIT. The MIT license does not apply to the bundled third-party Capri artwork, which remains under its separate noncommercial terms in `CAPRI_ASSET_LICENSE.md`. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for third-party boundaries.
