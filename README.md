# Capri Local Companion

A local-first Windows desktop companion inspired by Capri from *Cyberpunk: Edgerunners 2*. It runs Qwen3.5 4B through Ollama, uses offline speech tools, keeps chat and approved memories on this PC, and offers permission-gated screen and desktop actions.

**Repository status:** private personal project. Capri sprites come from a separate noncommercial project; see [`CAPRI_ASSET_LICENSE.md`](CAPRI_ASSET_LICENSE.md). This repo does not yet grant a general license to the companion source code.

## What is included

- **Faster local chat:** Qwen3.5 4B uses a four-message recent context, a 2,048-token context window, and a 64-token reply cap for ordinary chat (144 for requests that need detail). Ordinary replies stream as they are generated, and only relevant PC-action definitions are sent to the model. The model stays loaded while Capri is open and unloads on exit; the first reply after launch still has to load it.
- **Offline voice:** Vosk transcribes locally; Kokoro-ONNX uses the playful `af_sky` preset by default and runs on CPU with a four-thread limit. Text appears while the reply streams, then local voice generation starts. Bracketed visual cues are removed from speech, and optional sound effects are synthesized locally. The voice is an original preset, not a clone of the anime actor.
- **Animated avatar:** Capri's original 240-pixel sprite cells use their proper frame counts. She stays anchored while her pose changes for thinking, speaking, glitches, waking, and sleeping; brief glitches add anime-style scanline and color-split flickers. You can select a local image; it stays in `.capri-data\avatar.webp`.
- **Edgerunners color pass:** The dark interface uses neon yellow, hot pink, red, and green for focus, alerts, success, and avatar effects.
- **User-controlled memory:** chat history is stored locally (up to 300 messages) and relevant older exchanges can be recalled. Say “remember I like…” to save a harmless hobby, preference, or project detail after approval. Edit or clear notes in the app.
- **Permission-first PC tools:** ask Capri to look at your screen and she shows an approval card before capturing one image of the primary display. The image goes only to the local vision model and is not saved. A read-only Command Prompt helper supports a limited set of Windows checks; the exact command and folder appear for approval before it runs. Other bounded actions can open allowlisted apps/folders, check Defender/firewall, save notes, and send media keys.
- **Spotify controls:** the buttons and voice/chat actions use Windows media keys. They work with the active Windows media player, such as Spotify; Capri cannot see which player or song is active. Spotify itself still needs its usual internet connection. The replay button sends Previous, which may restart the current track depending on where it is in the song.
- **Cybersecurity helper:** defensive guidance for systems the user owns or is authorized to assess. Live vulnerability feeds and current threat intelligence require the internet and are unavailable in offline mode.

## Setup

The expected PC has an RTX 4060 with 8 GB VRAM and an Intel Core i5-12400F. Qwen3.5 4B is about 3.3–4.0 GB on disk. A warm short-reply check showed text in 0.48 seconds and finished in 0.80 seconds; this is one local measurement. A cold request took about 90 seconds to show its first text while Ollama loaded the model. The first run downloads the model and speech assets; after that, chat, screen analysis, and voice work offline.

1. Run `setup_local_model.ps1` from this folder. The script asks before installing or downloading anything.
2. Run `run_capri.bat`.
3. If the local model was installed while Capri was open, click the refresh button beside the model selector.

Setup uses Python 3.13, Pillow for one-time screen capture, Ollama for Windows, `qwen3.5:4b`, Vosk, and Kokoro-82M ONNX voice files. The voice model is Apache-2.0 and its ONNX runtime is MIT-licensed. The Capri sprite artwork is from [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) under PolyForm Noncommercial 1.0.0; the required notice is in `CAPRI_ASSET_LICENSE.md`.

## Local data and privacy

The app opens in its own Windows desktop window using WebView2. Its API binds to `127.0.0.1` only. Chat and approved screen images go only to the local Ollama service. A screenshot exists only in memory for that request; it is not added to chat history or written to disk. Microphone audio is used for local transcription and is not saved. Chats, memory, the custom avatar, models, and webview profile stay under `.capri-data`, which Git ignores.

The 4B model reserves GPU memory while it is loaded. Capri keeps it warm while the desktop app is open and unloads it when you exit. Sound effects are optional and can be switched off with the SFX control.

## Local cybersecurity limits

Capri can explain security concepts, offer defensive hardening, interpret pasted logs, run a read-only Defender/firewall check, and use a small read-only command allowlist. Commands run as the normal user, never as administrator, and require one-time approval. She cannot use the internet in offline mode, run arbitrary scripts, exploit code, or scan external targets.

## Roadmap and inspiration

The current version has a native window, local memory and recall, approval-gated screen vision, read-only command checks, synchronized speech, sound cues, and additional avatar reactions. See [`ROADMAP.md`](ROADMAP.md) for current status and next steps.

1. **Desktop package:** add a tray icon, hide/show hotkey, and installer.
2. **More useful vision:** add user-approved window selection and optional screen OCR while keeping images temporary.
3. **Voice quality:** tune timing and expressive local presets further, with interrupt controls.
4. **Memory tools:** add archive search and per-project note views with export and erase controls.

I used public Capri desktop projects as feature references. [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) provides the animated sprites used here and informed Capri's character prompt and reactions. [TheAgencyMGE/capri-companion](https://github.com/TheAgencyMGE/capri-companion) is another useful reference for permission-first desktop tools. These are unofficial fan projects; the anime character and original designs remain owned by their rights holders. The official [Edgerunners 2 character page](https://www.cyberpunk.net/en/edgerunners2) does not list Capri or provide her avatar art. The offline voice engine is [Kokoro-ONNX](https://github.com/thewh1teagle/kokoro-onnx) with [Apache-licensed Kokoro-82M weights](https://huggingface.co/hexgrad/Kokoro-82M), not an anime actor voice model.

## Main files

- `companion.py` — local desktop window, Ollama connection, memory, safe tools, Vosk, and Kokoro TTS.
- `web/` — animated companion interface.
- `setup_local_model.ps1` — confirmation-gated first-time installation and downloads.
- `run_capri.bat` — starts Capri after setup.
- `CAPRI_ASSET_LICENSE.md` — required license terms and attribution for the noncommercial fan sprites.
- `ROADMAP.md` — current capabilities and planned improvements.
- `PROJECT_FILES.md` — a guide to every tracked file and local-only data folder.

## Model and voice references

- [Qwen3.5 4B in Ollama](https://ollama.com/library/qwen3.5) — local model details and size.
- [Ollama Windows download](https://ollama.com/download/windows) — model runtime.
- [Vosk offline speech recognition](https://alphacephei.com/vosk/) — speech-to-text engine and model catalog.
- [Kokoro-ONNX](https://github.com/thewh1teagle/kokoro-onnx) — MIT-licensed ONNX inference engine.
- [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M) — Apache-2.0 model weights and voice preset details.
