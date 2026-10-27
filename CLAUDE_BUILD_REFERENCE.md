# Capri Companion — Claude Build Reference

**Reviewed:** 2026-10-27  
**Primary project:** [ACE07X/CapriCompanion](https://github.com/ACE07X/CapriCompanion)  
**Repository snapshot reviewed:** `main` at `8ff343bd9c5eb07e9effd400169c8d98f526877a`  
**Animation reference:** [mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop)  

This is a handoff document for Claude or another coding assistant. It inventories the files in the two Capri repositories, explains what the current app can do, ranks model and voice options for this PC, and marks what may or may not be reused. Check the current source and upstream licenses again before changing dependencies or redistributing anything; repositories and model tags can change.

## Instructions for a coding assistant

1. Work in `ACE07X/CapriCompanion`; treat its code and tests as the project source of truth. Read `README.md`, `PROJECT_GUIDE.md`, `ROADMAP.md`, `PROJECT_FILES.md`, `CAPRI_ASSET_LICENSE.md`, and `THIRD_PARTY_NOTICES.md` before making changes.
2. Preserve the offline-first design. Do not make a cloud provider, account, API key, or internet connection required. Claude Code is a coding tool; Anthropic's Claude model itself is not an offline model.
3. Target the owner's Windows PC: NVIDIA RTX 4060 with 8 GB VRAM and Intel Core i5-12400F. Keep Qwen3.5 4B Q4_K_M as the starting model and keep the app's current 2,048-token context unless measured tests show a safe improvement. Do not raise context just because a model advertises a huge maximum.
4. Preserve server-enforced, one-time approvals, bounded allowlists, local-only data handling, and the ability to stop voice. Never let a model execute arbitrary shell, read arbitrary paths, or see the screen continuously.
5. Keep chats, memory, screenshots, downloaded weights, voice files, credentials, and per-PC settings out of Git. The model and voice weights are downloaded to `.capri-data`; do not commit them.
6. Do not copy anime frames, character artwork, voice audio, or Mochiiwuff's asset files into this repository. The Mochiiwuff source code is MIT-licensed, but its README and license explicitly exclude its Capri artwork. If code is copied or adapted, preserve its MIT notice and identify the affected files in `THIRD_PARTY_NOTICES.md`.
7. Keep the ACE07X MIT license limited to ACE07X source. Preserve separate notices for third-party source, art, model weights, and individual voice packs. Do not say ACE07X owns CDPR/Netflix/Studio Trigger character rights or a voice actor's performance.
8. Make updates small and reviewable. Explain which files changed, what was checked, and what still needs a real Windows/model/voice check. Do not claim an unrun benchmark or test passed.

## Current Capri snapshot

The public repo contains 31 tracked files. The application is a local-first Windows desktop companion: `run_capri.bat` starts the Python server and native WebView2 window; Ollama runs locally on loopback. Qwen3.5 4B handles chat and approved screen images. Vosk handles offline speech input. Kokoro-ONNX with the `af_sky` preset handles offline speech output on CPU, capped at four threads. The current sprite sheets provide idle, blink, glitch, grin, mouth, sleep, and wake states.

Current bounded features include streamed chat, recent conversation context, locally stored chat history, user-approved memory, one approved screenshot at a time, approved non-recursive listings or bounded text reads in Documents/Downloads/Desktop, a read-only command allowlist, Defender/firewall checks, selected app/folder opening, and Windows media keys for the active player. It does not identify which Spotify song is playing. Cybersecurity guidance is defensive and scoped to systems the user owns or is authorized to assess.

The current guide reports a short warm response first-token measurement of 0.48 seconds and completion in 0.80 seconds on the owner's PC; a cold model load once took about 90 seconds. These are project measurements for the tested prompt, not guarantees. The model stays resident while Capri is open and unloads on exit. Avoid GPU-heavy animation, speech recognition, or vision workloads that compete with it.

## Model choices, ranked for this PC

This ranking is for a responsive, offline Capri on an 8 GB RTX 4060, not a universal benchmark. Run the same prompts through each candidate before changing the default.

| Rank | Model | Fit and strengths | Constraints and license | Recommendation |
|---|---|---|---|---|
| 1 | **Qwen3.5 4B, Q4_K_M** (`qwen3.5:4b`) | Current default; text and image input; Ollama lists the quantized model at about 3.3–4.0 GB on disk. Best balance here for chat, tool proposals, and approved screenshot descriptions. | Qwen's open-weight models are Apache-2.0. The model's advertised context is far beyond Capri's safe 2K setting; keep Capri's smaller context to leave room for Windows, the display, and other apps. | **Keep this as default.** It is not equal to a large hosted Claude model, but it is the strongest current local fit already integrated. [Ollama model page](https://ollama.com/library/qwen3.5) · [Qwen3.5 official model card/license](https://huggingface.co/Qwen/Qwen3.5-4B) |
| 2 | **Gemma 3 4B** (`gemma3:4b`) | Text and image input; Ollama lists about 3.4 GB, 128K model context, and broad language support. Plausible alternative if Qwen has a bug or an English/multilingual prompt performs better. | Governed by Google's Gemma Terms, not Apache/MIT. The terms require use restrictions and a notice when distributing Gemma; review the exact terms before bundling. | **Test as an alternative, not a simultaneous second resident model.** [Ollama model page](https://ollama.com/library/gemma3) · [Gemma terms](https://ai.google.dev/gemma/terms) |
| 3 | **Llama 3.2 3B** (`llama3.2:3b`) | Small footprint: Ollama lists about 2.0 GB. Meta describes the 3B text-only model for instruction following, summarization, and tool use. It is a reasonable low-VRAM chat fallback. | The 3B variant is text-in/text-out, so it cannot replace Capri's image model for screen vision. It uses Meta's Llama 3.2 Community License and acceptable-use policy, not MIT/Apache. | **Use only when lower memory matters more than vision.** [Ollama model page](https://ollama.com/library/llama3.2) · [Meta model card/license](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md) |
| 4 | **Qwen3.5 2B** (`qwen3.5:2b`) | Keeps image input while using a smaller model than 4B; Ollama lists roughly 2.7–3.1 GB. | Likely less dependable for multi-step tool choice and nuanced conversation; its file is not dramatically smaller than Llama 3.2 3B. Apache-2.0 applies to Qwen weights. | **Only test if 4B load is too heavy and vision is still required.** [Ollama model tags](https://ollama.com/library/qwen3.5/tags) |
| Avoid as default | **Qwen3.5 9B** (`qwen3.5:9b`) | More model capacity may help complex answers. | Ollama lists about 6.6–7.6 GB on disk before context/cache and Windows GPU usage. It leaves too little headroom on an 8 GB card and may spill to CPU or cause slowdowns. | **Do not choose for this low-resource goal.** A bigger label does not guarantee better end-to-end user experience. [Ollama model page](https://ollama.com/library/qwen3.5) |

Do not confuse the command `ollama launch claude` with an offline Claude model. Mochiiwuff's README uses that command to run Claude Code against a selected Ollama model; Anthropic's proprietary Claude weights are not what gets downloaded.

## Voice and audio choices, ranked by Capri fit

“Best” here means the best practical fit for this app's offline, low-GPU design. The project has not run a controlled listening test across all voices.

### Spoken output (TTS)

| Rank | Option | What it is good for | Limits / license | Direction |
|---|---|---|---|---|
| 1 | **Kokoro-82M ONNX**, current `af_sky` preset | Compact offline neural speech; already integrated; runs on CPU so it does not compete with Qwen for VRAM. The ONNX community card lists Apache-2.0 and 82M parameters. | Voice presets are synthetic presets, not Capri's anime actor. Tune pacing, text cleanup, short sentence chunks, and stop/cancel synchronization; do not clone an actor or use episode audio. | **Keep it.** Improve expressive delivery and text/audio timing before replacing the model. Try other included Kokoro presets by listening locally. [Model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) |
| 2 | **Piper TTS** | Fast, local neural TTS and a possible low-resource fallback. | The current maintained `OHF-Voice/piper1-gpl` engine is GPL-3.0; each voice model has its own license. Bundling it affects distribution obligations, so preserve Capri's license boundary and review the chosen voice card. It is not automatically a better or more expressive Capri voice. | **Reference/optional experiment only.** Do not bundle until license and voice pack are deliberately selected. [Piper source/license](https://github.com/OHF-Voice/piper1-gpl) |
| 3 | **Windows installed speech voices** | Could serve as an offline fallback if available on that machine, with no separate model download. | Naturalness, installed voices, and expressive controls vary by Windows version and what is installed. | **Fallback only.** Keep Kokoro as the intended voice path. |

### Speech recognition (STT)

| Rank | Option | What it is good for | Resource tradeoff | Direction |
|---|---|---|---|---|
| 1 for low load | **Vosk** (current) | Offline, streaming recognition; small models and bindings; current design keeps recognition local and avoids another GPU model. Vosk API is Apache-2.0. | Some recordings may transcribe less accurately than a larger Whisper model, especially with noise or unusual names. | **Keep as default for responsiveness.** [Vosk API](https://github.com/alphacep/vosk-api) |
| 2 for recognition quality | **whisper.cpp** with a small English model | Offline Whisper recognition; C/C++; supports CPU and NVIDIA GPU inference and quantization. Runtime is MIT. | Adds another model and possible CUDA build. If it uses the RTX 4060 while Qwen is resident, the two workloads can compete for VRAM; benchmark before enabling GPU inference. | **Optional accuracy comparison.** Start with a small CPU/quantized configuration, then measure before replacing Vosk. [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |

No official Capri voice pack or licensed anime actor voice was found in these repos. The safe voice target is an original, playful synthetic voice with tuned pitch, pacing, expressive pauses, and original sound cues—not an exact performer clone.

## Useful GitHub projects and what to borrow

| Project | Useful part | License / boundary | Priority |
|---|---|---|---|
| [mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop) | Animation sequencing, pose/state design, cursor-aware movement, screen-edge peeking, sit/fall/teleport beats, sound cues, status reactions, desktop tray behavior, localization, and hook-driven activity summaries. Its code is MIT. | **Its art is excluded from MIT** in both the README and license. Do not copy `assets/capri/` or `docs/` images. If code is ported, add MIT attribution and enumerate files in `THIRD_PARTY_NOTICES.md`. | Highest reference for animation and product behavior. Reimplement small pieces in Capri's existing architecture; do not replace the app wholesale with Electron. |
| [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) | Source identified in Capri's asset notice for current sprite art. | Current art has separate **PolyForm Noncommercial 1.0.0** terms and a required Lachy copyright notice in `CAPRI_ASSET_LICENSE.md`; it is not ACE07X MIT art. | Already represented in the current art bundle. Keep notices and do not call it ACE07X-owned. |
| [solas2529/local-ollama-agent](https://github.com/solas2529/local-ollama-agent) | Local Ollama, vision, narrow file roots, approval boundaries, and prompt-injection cautions. | Previously reviewed as MIT. Do not transplant its broader shell, Python execution, web, or write tools into Capri. | Good safety/design reference; Capri's current server approvals are stricter. |
| [ollama/ollama](https://github.com/ollama/ollama) | Local model runtime and loopback API already used by Capri. | Runtime license is separate from each downloaded model's license. | Keep; focus on model selection, warm start, bounded context, and unloading on exit. |
| [Kokoro ONNX model](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | Current offline speech synthesis model and alternative voices. | Model card says Apache-2.0; audit code/runtime and every separate voice/data asset independently. | Keep and improve timing/audio quality first. |
| [alphacep/vosk-api](https://github.com/alphacep/vosk-api) | Current offline streaming speech recognition. | API repo Apache-2.0; model downloads have their own details to check. | Keep as low-resource baseline. |
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Optional recognition-quality path with CPU/CUDA/quantized options. | MIT runtime; model terms should still be checked. | Compare only if Vosk recognition is a real problem. |
| [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) | Optional fast local TTS fallback. | GPL-3.0 engine and per-voice licenses; more license work than the existing Kokoro path. | Low priority unless Kokoro fails a local listening test. |
| [AndreyLebedenko/jarvis-local](https://github.com/AndreyLebedenko/jarvis-local) | Ideas for an offline voice/vision workflow and user-visible local journal. | Prior review found a much heavier tested model stack; verify current license, code, and model requirements before reuse. No code/assets imported. | Read for ideas only. |
| [Soumodeep-Ganguly/fully-offline-windows-desktop-voice-agent](https://github.com/Soumodeep-Ganguly/fully-offline-windows-desktop-voice-agent) | Voice pipeline, bounded tool registry, and interruption concepts. | No visible license was found in the earlier review; do not copy or adapt its code unless its license is verified. | Reference only. |

## Enhancement plan for Capri

1. **Voice synchronization and expression.** Make text and audio share sentence boundaries: stream text immediately, synthesize short cleaned sentences as they become complete, queue them in order, and cancel both queue and avatar mouth animation on Stop/Esc. Never speak bracketed stage cues or raw error markers. Add optional sound effects through locally synthesized Web Audio; keep volume/mute and reduced-motion controls. Mochiiwuff's `voice.js` demonstrates procedural cues, but track the MIT notice if code is adapted.
2. **Pose-based animation.** Keep the current sprite files and write a small pose/state controller: idle, attentive, thinking, listening, speaking, success, error, sleep, wake, teleport/glitch. Use anticipation, held poses, short smear/glitch transitions, and modest particles. The Mochiiwuff `acting.js`, `sprite.js`, `fx.js`, and `lines.js` files are code references; their character images and extracted frames remain excluded.
3. **Make reactions useful.** Give the avatar clear states for “model loading,” “listening,” “working,” “needs approval,” “speaking,” and “error.” Do not let background polling reset a reply or close an open menu. Use a reduced-motion setting and let the user disable sounds/effects.
4. **Improve local memory.** Preserve user edit/erase control. Replace the very small prompt excerpt with structured, user-approved notes grouped by project/hobby and a local search view. Keep raw chats on the PC, avoid storing secrets, and add export/erase controls. Keep retrieved text within a fixed token budget so the persona/system rules cannot be pushed out.
5. **Add vision carefully.** Keep explicit user request + one-time approval. Next useful feature: let the user choose a window or crop, then send one temporary image to local Qwen. Do not add continuous surveillance, screen recording, OCR of hidden windows, or remote upload.
6. **Grow desktop actions safely.** Add only user-requested, allowlisted actions one at a time. Every action must be normalized and validated on the server and tied to one server-issued, one-time approval. Keep file access read-only and inside Documents/Downloads/Desktop. Music buttons remain active-player media keys unless a later Spotify API integration has separately authorized credentials and a transparent privacy design.
7. **Model performance.** Retain the current 4B Q4 model as default; measure cold start, warm first-token latency, VRAM, and task success with the same prompt set before switching. Keep the model warm while open, short recent history, short default replies, and the exit unload. Avoid 9B on the 8 GB GPU if it competes with Windows or slows the app.
8. **Cybersecurity.** Keep help defensive and local. Use only read-only checks, explain limitations, and require approval for every PC action. Do not add arbitrary PowerShell, remote scans, credential access, persistence, stealth, or exploit execution.

## ACE07X/CapriCompanion complete tracked-file map

All 31 files currently listed on the public `main` tree are covered below. Model weights and per-PC data are intentionally absent.

| Path | Current use |
|---|---|
| `.gitattributes` | Enforces line endings for Windows launch/setup scripts and source files. |
| `.github/workflows/ci.yml` | CI checks lint, unit tests, JavaScript syntax, text constraints, and PowerShell parsing. |
| `.gitignore` | Keeps local models, voice data, chats, memory, avatars, environments, and temporary files out of Git. |
| `AI_PROJECT_RESEARCH.md` | Earlier research notes about local-agent projects and reuse boundaries. |
| `CAPRI_ASSET_LICENSE.md` | Required Lachy attribution and separate PolyForm Noncommercial terms for the existing art. |
| `CHANGELOG.md` | Records implementation changes. |
| `LICENSE` | MIT license for original CapriCompanion code, copyright ACE07X; not a license for third-party images or models. |
| `PROJECT_FILES.md` | Short inventory of project files and local-only data. |
| `PROJECT_GUIDE.md` | Architecture, setup, privacy, capabilities, limitations, performance, and handoff guide. |
| `README.md` | User-facing overview, features, setup, model, privacy, security, and roadmap links. |
| `ROADMAP.md` | Current state, next features, and guardrails. |
| `THIRD_PARTY_NOTICES.md` | Separate rights and attribution for art, upstream references, and any later reused source. |
| `companion.py` | Python loopback server; Ollama chat/streaming, bounded context, tools, approval IDs, screenshots, file reads/listings, commands, memory/history, media keys, Vosk, and Kokoro. |
| `pyproject.toml` | Python project and Ruff lint configuration. |
| `requirements.txt` | Python runtime dependencies. |
| `run_capri.bat` | Starts local Ollama configuration and launches the Windows desktop app. |
| `setup_local_model.bat` | Double-click wrapper for local setup. |
| `setup_local_model.ps1` | Confirmation-gated install/download of Ollama/model/voice assets, including pinned checksums where configured. |
| `tests/test_companion.py` | Unit and server behavior using a fake Ollama; no real model/GPU needed. |
| `web/app.js` | Chat streaming, local history UI, voice capture/playback, avatar reactions, confirmation cards, memory and media controls. |
| `web/capri.png` | Main avatar/brand artwork. Keep its existing separate art notice. |
| `web/index.html` | App shell: chat, model selection, voice, memory, sound, media, avatar, setup, and action approval UI. |
| `web/styles.css` | Cyberpunk dark theme, yellow/pink/red/green palette, responsive UI, avatar and glitch effects. |
| `web/sprites/idle.png` | Idle pose/animation sheet. |
| `web/sprites/blink.png` | Blink sheet. |
| `web/sprites/blink_glitch.png` | Blink/glitch transition sheet. |
| `web/sprites/glitch.png` | Glitch reaction sheet. |
| `web/sprites/grin.png` | Grin/thinking/success sheet. |
| `web/sprites/mouth.png` | Mouth frames used during speech. |
| `web/sprites/sleep.png` | Sleep sheet. |
| `web/sprites/wake.png` | Wake-up sheet. |

## mochiiwuff/capri-desktop complete tracked-file map

The upstream `main` tree reviewed here contains 90 files. The descriptions identify what Claude can study; the art section is explicitly **not** a reuse list.

### Root and build/config files (7)

| Path | Use |
|---|---|
| `.gitattributes` | Git text/binary handling. |
| `.gitignore` | Ignores generated/local files. |
| `LICENSE` | MIT for source code only; explicitly excludes Capri artwork in `assets/capri/` and `docs/`. |
| `README.md` | Feature, interaction, model, voice, art direction, safety, credits, and build guide. |
| `README.fr.md` | French README. |
| `package.json` | Electron app metadata, scripts, dependencies, and Windows packaging. |
| `package-lock.json` | Exact npm dependency lockfile. |

### Art and docs images (39 files; do not bundle or edit)

The upstream README says its Capri image files come from show frames, a fan cutout, and fan art, and are **not** covered by MIT. They belong to their respective rights holders. These paths can help identify what an animation sequence depicts, but are not available for CapriCompanion under the code license.

| Paths | What they depict; reuse status |
|---|---|
| `assets/capri/capri-cutout.png`, `assets/capri/capri-face.png`, `assets/capri/capri-full.png` | Character cutout/face/full image; protected artwork, no copying. |
| `assets/capri/cutin-eyes.png`, `assets/capri/cutin-grin.png`, `assets/capri/cutin-laugh.png`, `assets/capri/cutin-look.png`, `assets/capri/cutin-many.png` | Face cut-ins; anime-derived art, no copying. |
| `assets/capri/face-aside.png`, `assets/capri/face-calm.png`, `assets/capri/face-laugh.png`, `assets/capri/face-look.png`, `assets/capri/face-many.png`, `assets/capri/face-smug.png`, `assets/capri/face-wide.png` | Expression portraits; protected art, no copying. |
| `assets/capri/intro-grab.webp`, `assets/capri/intro-happy.webp`, `assets/capri/intro-mouth1.webp`, `assets/capri/intro-mouth2.webp`, `assets/capri/intro-mouth3.webp`, `assets/capri/intro-smear.webp`, `assets/capri/intro-wave1.webp`, `assets/capri/intro-wave2.webp`, `assets/capri/intro-wave3.webp` | Intro animation cels; no copying or redistributing. |
| `assets/icons/capri.ico`, `assets/icons/capri.png`, `assets/icons/tray.png` | App/tray icons using the same character; no copying. |
| `docs/done.png`, `docs/faces.png`, `docs/guide.png`, `docs/intro.png`, `docs/peek.png`, `docs/point.png`, `docs/possess.png`, `docs/sit.png`, `docs/sleep.png`, `docs/star.png`, `docs/teleport.png`, `docs/victory.png` | Screenshots/demonstrations containing the upstream art; do not copy into docs or tests. |

### Hooks, scripts, and test (10)

| Path | Use |
|---|---|
| `hooks/capri-hook.js` | Receives Claude Code lifecycle events and sends bounded status to the desktop app. |
| `hooks/capri-codex-hook.js` | Codex hook adapter. |
| `hooks/capri-agy-hook.js` | Antigravity hook adapter. |
| `scripts/check-llm.js` | Checks local/cloud chat provider setup. |
| `scripts/demo-sequence.js` | Defines scripted demo events. |
| `scripts/demo.js` | Runs the visual behavior demo without a real coding session. |
| `scripts/install-hooks.js` | Installs/removes Claude Code hooks. |
| `scripts/install-codex-hooks.js` | Installs/removes Codex hooks. |
| `scripts/install-hooks-agy.js` | Installs/removes Antigravity hooks. |
| `tests/hooks.test.js` | Tests hook adapters and event behavior. |

### Main process and preload (13)

| Path | Use |
|---|---|
| `src/main/apps.js` | Opens/closes selected desktop apps after user interaction/approval. |
| `src/main/assistants.js` | Assistant integration configuration. |
| `src/main/bridge.js` | Local bridge between renderer, hooks, and main process. |
| `src/main/config.js` | User settings and defaults. |
| `src/main/labels.js` | Localized labels and strings. |
| `src/main/launch.js` | App/assistant launch helpers. |
| `src/main/llm.js` | Chat provider adapters and configuration; includes non-offline provider options that Capri should not make mandatory. |
| `src/main/main.js` | Electron main window, tray, lifecycle, IPC, local integration, and settings. |
| `src/main/ollama.js` | Local Ollama model calls. |
| `src/main/setup.js` | First-run model/provider setup. |
| `src/main/windows.js` | Windows-only window position/tracking adapter. |
| `src/main/windows.ps1` | Helper for other-window position data; README says it reads no titles or contents. |
| `src/preload.js` | Narrow context bridge from Electron renderer to main process. |

### Renderer and visual behavior (18)

| Path | Use |
|---|---|
| `src/renderer/index.html` | Renderer document shell. |
| `src/renderer/js/acting.js` | Pose-by-pose exposure-sheet sequences: anticipation, held drawings, smears, and overshoot. Strong reference for a Capri state machine. |
| `src/renderer/js/app.js` | Renderer startup and event orchestration. |
| `src/renderer/js/brain.js` | Turns coding-assistant events into reactions and lines. |
| `src/renderer/js/capri.js` | Avatar state, stance, movement, teleport, sit/peek/fall/drag/sleep interactions. |
| `src/renderer/js/chat.js` | Companion chat interface and response handling. |
| `src/renderer/js/chip.js` | Compact sleeping/put-away mask representation. |
| `src/renderer/js/custom.js` | User-facing character personalization. |
| `src/renderer/js/fx.js` | Visual FX, particles, lightning, screen lines, impact frames, and animation sequences. |
| `src/renderer/js/guide.js` | In-app guide and pointer-to-target guidance. |
| `src/renderer/js/lines.js` | Localized dialogue/line selection. |
| `src/renderer/js/mission.js` | Local activity summary/report-card data. |
| `src/renderer/js/panel.js` | Status panel, ticker, and face display. |
| `src/renderer/js/setup.js` | First-run setup UI. |
| `src/renderer/js/sprite.js` | Sprite rendering/rigging, pose and shader effects. Reuse code only with MIT notices; no art sheets. |
| `src/renderer/js/util.js` | Shared helpers. |
| `src/renderer/js/voice.js` | Procedural Web Audio cues for teleport, blips, success, alert, error, lightning, etc.; no recorded voice is included by this module. |
| `src/renderer/styles/capri.css` | Renderer/character styling. |

### Tools (3)

| Path | Use |
|---|---|
| `tools/build-cutins.py` | Extracts/assembles cut-ins from anime-derived material. Do not run for CapriCompanion or reuse its outputs. |
| `tools/build-intro.py` | Builds the intro sequence from the upstream art. Do not run for CapriCompanion or reuse outputs. |
| `tools/build-sprite.py` | Rebuilds upstream character sprites from an art cutout; do not use with protected upstream art. |

## License and attribution matrix

| Material | What the repository says | Required handling |
|---|---|---|
| Original CapriCompanion source | MIT, copyright © 2026 ACE07X. | Keep ACE07X's copyright and MIT license for original source only. |
| Existing Lachy Capri art in this app | PolyForm Noncommercial 1.0.0; required notice is in `CAPRI_ASSET_LICENSE.md`. | Preserve separate notice. Not covered by ACE07X MIT. Do not claim unrestricted/commercial rights. |
| Mochiiwuff source code | MIT, copyright in upstream `LICENSE`; their license expressly excludes `assets/capri/` and `docs/`. | If adapting code, retain MIT text/copyright and document which files contain reused/adapted code. Keep its notices distinct from ACE07X ownership. |
| Mochiiwuff art/screenshots | README says anime frames, fan cutout, and fan art are not MIT and belong to their rights holders. | Do not copy, bundle, edit, or attribute the art to ACE07X or Mochiiwuff as if Mochiiwuff could grant rights. Obtain permission from actual rights holders or create separately licensed original art. |
| Qwen3.5 weights | Apache-2.0 per Qwen project. | Keep model weights out of Git; list model/version and license separately if packaging. |
| Gemma 3 weights | Google Gemma Terms, including distribution notice/restrictions. | Do not label MIT/Apache; add Google's required notice and restrictions if distributing. |
| Llama 3.2 weights | Meta Llama Community License and Acceptable Use Policy. | Keep separate and review terms before redistribution. |
| Kokoro ONNX weights | Model card identifies Apache-2.0. | Keep model files out of Git; separately list runtime dependencies and chosen preset. |
| Piper engine and voices | Current engine GPL-3.0; per-voice terms vary. | Do not bundle by default; review engine and exact voice license before packaging. |
| Anime actor audio / exact voice | No official downloadable/redistributable Capri voice model was identified in these repositories. | Do not scrape episode audio or clone the actor. Create and tune a distinct synthetic voice, or obtain explicit rights/consent. |

## Links checked

- [ACE07X CapriCompanion files](https://github.com/ACE07X/CapriCompanion)
- [Mochiiwuff Capri Desktop README](https://github.com/mochiiwuff/capri-desktop/blob/main/README.md) and [MIT source license with artwork exclusion](https://github.com/mochiiwuff/capri-desktop/blob/main/LICENSE)
- [Qwen3.5 model sizes/modalities](https://ollama.com/library/qwen3.5) and [Qwen3.5 official model card/license](https://huggingface.co/Qwen/Qwen3.5-4B)
- [Gemma 3 model sizes/modalities](https://ollama.com/library/gemma3) and [Gemma terms](https://ai.google.dev/gemma/terms)
- [Llama 3.2 model sizes/modality](https://ollama.com/library/llama3.2) and [Meta's Llama 3.2 model card](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md)
- [Kokoro ONNX model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
- [Vosk API](https://github.com/alphacep/vosk-api), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), and [Piper TTS](https://github.com/OHF-Voice/piper1-gpl)
- [Local Ollama agent reference](https://github.com/solas2529/local-ollama-agent), [Jarvis Local reference](https://github.com/AndreyLebedenko/jarvis-local), and [offline Windows voice-agent reference](https://github.com/Soumodeep-Ganguly/fully-offline-windows-desktop-voice-agent)

