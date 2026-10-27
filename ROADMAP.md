# Roadmap

This is a local-first companion project. The list separates what works now from ideas that remain.

## Available now

- Native Windows window sized for the available display, with a one-click batch launcher.
- Qwen3.5 4B local chat with a four-message context, concise output limits, relevant action definitions, streamed text, and a model kept warm until Capri exits.
- Offline Vosk microphone transcription and Kokoro voice playback, with visual stage cues filtered from speech.
- Local chat archive and user-approved project/hobby memory.
- One-time, user-approved screenshot analysis using the local vision model; images are not saved.
- Read-only Command Prompt checks from a fixed allowlist, each shown for approval.
- Animated Capri idle, blink, grin, glitch, sleep, wake, and speech states, with optional local sound cues.
- Neon yellow, hot-pink, red, and green interface palette, with anchored scanline and color-split glitch effects.
- Approved Windows app/folder actions, Windows media keys, and defensive security guidance.
- Approved, read-only file listing and bounded UTF-8 text previews in Documents, Downloads, or Desktop; the local model receives a one-turn excerpt summary with action tools disabled, and raw file text/listings are not saved to chat history.
- Server-enforced one-time approvals, a hardened read-only command validator, context budgeting for the 2K window, checksum-verified setup downloads, and an automated test suite with CI.

## Planned

1. Package the app as a simple Windows installer with a tray icon and hide/show shortcut.
2. Add optional window selection and better on-screen text reading, always after approval.
3. Stream speech in short synchronized chunks while keeping voice generation local. (A stop control, Esc and a STOP VOICE button, is done.)
4. Add searchable chat archive and separate per-project notes with export and erase controls.
5. Add useful read-only Windows checks and opt-in helpers that continue to show exact actions before running.
6. Replace the deprecated `ScriptProcessorNode` microphone capture with an `AudioWorklet`.
7. Pin `onnxruntime` and `numpy` in `requirements.txt` (they currently arrive through `kokoro-onnx`).
8. Expand file reading only after the bounded preview flow has been exercised on Windows; keep images/PDFs and recursive search behind separate explicit design and approval work.

## Guardrails

- Chats, saved notes, screenshots, voice recordings, and downloaded models stay on the PC and out of GitHub.
- Memory stays visible and user-controlled; Capri does not silently learn personal details.
- Screen capture requires a one-time approval and is not persisted.
- Commands stay on a read-only allowlist, run as the normal user, and require approval.
- Keep the Capri sprite artwork's noncommercial terms and attribution intact.
