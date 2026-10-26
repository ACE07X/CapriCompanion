# Capri Companion — Project Guide

This is the handoff reference for the local Windows desktop companion. It records what the project does, how its pieces fit together, what is included in the repository, what stays on the PC, and how to run or extend it.

## Project at a glance

Capri is a local-first desktop companion inspired by Capri from Cyberpunk: Edgerunners 2. The app uses Qwen3.5 4B through Ollama for chat, Vosk for offline speech recognition, Kokoro-ONNX for offline speech output, and an animated Capri sprite from the open-source Capri desktop project.

The app is a hobby project, not an official Cyberpunk product. The bundled fan artwork has a noncommercial license and required attribution. The companion source code does not currently declare a general reuse license. Keep the license notice with the artwork and check the terms before sharing or adapting the project.

## Run it

1. Use Windows with an NVIDIA driver, Python, and Ollama installed.
2. Open the project folder and run setup_local_model.ps1 once. It explains the one-time downloads and asks before installing or downloading anything.
3. Start Capri with run_capri.bat.
4. The first model reply after launching may take longer while Ollama loads Qwen. The model remains loaded while Capri is open and is unloaded when the app exits.

The setup script stores the Ollama model, Vosk model, Kokoro model, voice data, chat history, memory, custom avatar, and WebView profile in the ignored .capri-data folder. Python packages are installed under the ignored .venv folder. Those folders are specific to this PC and are not part of the source upload.

## How the app works

- run_capri.bat starts Ollama on 127.0.0.1:11435 using the project-local model directory, then launches companion.py.
- companion.py starts a small HTTP server bound only to 127.0.0.1 and opens the native Windows window using pywebview.
- web/index.html, web/styles.css, and web/app.js make up the interface. The chat sends requests only to the local server.
- Ordinary replies stream from Ollama to the chat as text is generated. Replies use the last four messages, a 2,048-token context window, and a 64-token output cap by default. Requests for a guide, code, plan, comparison, or detailed explanation can use up to 144 output tokens.
- Only PC-action definitions relevant to the current request are passed to the model. A requested action still appears in an approval card before it runs.
- Voice recognition runs locally with Vosk. Voice replies use Kokoro-ONNX and the Sky preset on the CPU. The text is displayed while it streams; speech generation starts after the answer is ready, so offline voice rendering no longer blocks the text.
- The local sprite sheets drive idle, blink, glitch, grin, mouth, sleep, and wake animations. The avatar stays anchored; glitches use clipped flicker, scanlines, and color splits.
- Memory notes and chat history are stored locally and can be edited or cleared in the app. Memory is saved only after an explicit request and approval.
- A screen image is captured only after the user asks and approves it. It is sent only to the local vision-capable model and is not saved.

## Local actions and safety limits

The app can propose a small set of actions: inspect one approved screenshot, run a fixed read-only Command Prompt allowlist, check Defender and Firewall status, open selected apps or folders, save notes, remember approved non-sensitive preferences, and send media keys to the active Windows player.

Actions require an approval card. Commands run as the normal user with a short timeout. The command helper rejects command chaining, redirects, and commands outside its allowlist. Capri cannot see which Spotify song is playing; the media buttons send Windows media keys to whichever player is active. Replay sends Previous, so Spotify may move to the prior track depending on playback position.

The cybersecurity guidance is defensive and permission-based. The app is not a remote-access tool, does not monitor the desktop continuously, and has no live threat-intelligence feed in offline mode.

## Performance and PC use

- The selected model is Qwen3.5 4B, quantized as Q4_K_M. The local model file is about 3.3 GB.
- On this PC the RTX 4060 has 8 GB of VRAM. A local Ollama check showed Qwen using the GPU; memory usage can vary with other apps and the selected context.
- Ollama keeps the model resident while Capri is open so later messages do not pay the full model-load cost. Closing Capri unloads it. The model does not generate text while idle.
- Shorter replies and a smaller recent context reduce work. Streaming lets the user see text before the entire answer is complete. The first reply after a fresh launch can still be slow because the model has to load.
- Kokoro uses the CPU with a four-thread limit so it does not compete for the GPU while generating speech.
- Turning off spoken replies avoids local speech synthesis. Closing Capri frees the model's reserved GPU memory.

## Verification notes

- A warm local chat request on this PC showed its first text in 0.48 seconds and finished in 0.80 seconds. This is one short-reply measurement, not a guarantee for every prompt.
- A cold request during setup took about 90 seconds before the first text because Ollama had to load the model. The cold-start delay is still present; later replies are much faster while the model stays loaded.
- Ollama reported Qwen3.5 4B fully on the RTX 4060, using about 3.1 GB for the loaded model in that check. Other apps and display use also consume GPU memory.
- The edited Python file passed Python bytecode compilation, the interface JavaScript passed Node syntax checking, and Git reported no whitespace errors in the changes.
- The measured chat request used a short synthetic prompt and did not save a conversation or change local memory.

## Components and dependencies

- **Python standard library:** local HTTP server, Ollama requests, memory/history storage, Windows media controls, approval-gated actions, and screen capture.
- **Ollama:** local model runtime. The setup targets Qwen3.5 4B from the Ollama model library.
- **Vosk:** offline English speech recognition.
- **Kokoro-ONNX:** offline speech synthesis with the Sky voice preset. This is a synthetic preset, not a clone of Capri's anime voice actor.
- **pywebview:** native Windows desktop window, using WebView2.
- **Pillow:** validation and scaling for approved screen captures and custom avatar images.
- **HTML, CSS, and JavaScript:** app interface, streamed conversation, voice controls, local memory UI, sprite animation, Spotify media keys, and action approval cards.

Pinned Python packages are listed in requirements.txt. The setup script downloads the local model and voice assets; their binaries are intentionally not stored in Git.

## Repository file map

- .gitignore — excludes local user data, model/voice downloads, temporary setup files, virtual environments, and caches.
- README.md — concise overview, setup, features, privacy notes, and official model/engine references.
- PROJECT_GUIDE.md — this full handoff and technical reference.
- PROJECT_FILES.md — short inventory of tracked files and ignored local-only folders.
- ROADMAP.md — available features, planned work, and guardrails.
- CAPRI_ASSET_LICENSE.md — required attribution and PolyForm Noncommercial terms for the bundled Capri fan artwork.
- companion.py — local server, local-model integration, memory and chat archive, offline speech, screen capture, Windows tools, and streamed replies.
- requirements.txt — pinned Python dependencies.
- setup_local_model.ps1 — confirmation-gated setup for Ollama, Qwen, Vosk, and Kokoro assets.
- run_capri.bat — starts the local model service and desktop app.
- web/index.html — desktop companion layout and accessible controls.
- web/styles.css — neon yellow, hot-pink, red, and green visual theme, responsive layout, and avatar effects.
- web/app.js — chat streaming, audio playback, local history, memory controls, avatar animation, and approval UI.
- web/capri.png — default avatar artwork.
- web/sprites/ — the idle, blink, blink_glitch, glitch, grin, mouth, sleep, and wake sprite sheets.

## Data that is not uploaded

The repository excludes .capri-data, .venv, .setup-temp, Python caches, and logs. In particular, the upload does not contain chat history, local memory notes, user-selected avatars, microphone recordings, the WebView profile, local AI model weights, or downloaded Vosk/Kokoro files.

Do not add those local folders to Git. They can contain private conversations, personal preferences, or large licensed model files.

## Art and model references

- The Capri desktop sprite source is https://github.com/lachydotmcg/capri-desktop. Preserve the required notice and the bundled CAPRI_ASSET_LICENSE.md.
- The sprite artwork is covered by PolyForm Noncommercial 1.0.0. It may be used for personal hobby purposes under those terms; commercial use is not granted.
- Qwen3.5 4B model listing: https://ollama.com/library/qwen3.5
- Ollama for Windows: https://ollama.com/download/windows
- Vosk: https://alphacephei.com/vosk/
- Kokoro-ONNX: https://github.com/thewh1teagle/kokoro-onnx
- Kokoro model card and weight license details: https://huggingface.co/hexgrad/Kokoro-82M

## Work recorded in this project

- Built a local Windows companion window with Qwen3.5 4B, chat history, editable approval-gated memory, offline speech, screen capture approval, defensive local checks, and Spotify media-key controls.
- Added the original Capri sprite sheets, state-based avatar poses, mouth animation, brief scanline/color-split glitches, and an anchored avatar layout.
- Tuned chat for lower latency by shortening recent context, limiting normal reply length, providing only relevant action definitions, streaming ordinary text, and letting speech render without delaying the on-screen answer.
- Updated the interface to use a dark Edgerunners palette of neon yellow, hot pink, red, and green.
- Added this reference guide and maintained the roadmap, file inventory, and asset attribution.

## Known limits and next steps

- The first reply after starting Capri still pays the local model's cold-load cost. Keeping the model preloaded at all times would use GPU memory when the user may not need it, so this project currently loads it on demand.
- Qwen3.5 4B can make mistakes and is less capable than large cloud models. Verify important output.
- Ordinary replies are intentionally short. Detailed requests get a larger token allowance, but code or long documents may need to be produced in follow-up chunks.
- Text appears before voice generation completes; playback follows when the local audio is ready.
- The synthetic Sky voice is not the anime actress's voice. The original anime voice is not included.
- Spotify controls use Windows media keys and cannot report the active track.
- The sprite artwork is noncommercial. The source code currently has no general license for redistribution or commercial reuse.
- Roadmap ideas include a Windows installer/tray control, optional window-scoped screen reading, a searchable archive, project-specific notes, and a speech stop button.
