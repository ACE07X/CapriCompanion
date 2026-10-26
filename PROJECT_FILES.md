# Project file guide

These are the source and documentation files intended for the private repository. Runtime data, model weights, voice files, and installed packages remain local and are excluded by `.gitignore`.

| File or folder | Description |
| --- | --- |
| `README.md` | Project overview, features, setup, privacy, and references. |
| `PROJECT_GUIDE.md` | Full architecture, dependencies, file map, local data boundaries, safety limits, and handoff notes. |
| `ROADMAP.md` | Current state, planned improvements, and privacy guardrails. |
| `PROJECT_FILES.md` | This tracked-file inventory. |
| `.gitignore` | Excludes local memory, chats, avatars, model downloads, environments, and temporary files. |
| `CAPRI_ASSET_LICENSE.md` | Required attribution and PolyForm Noncommercial terms for the third-party Capri art. |
| `companion.py` | Local web server, Ollama requests, user memory, screen capture, approved tools, Vosk, and Kokoro voice. |
| `requirements.txt` | Python package versions needed by the app, including Pillow for screen capture. |
| `setup_local_model.ps1` | Confirmation-gated installation and download of the local model and speech assets. |
| `run_capri.bat` | Launches Capri in a native Windows desktop window. |
| `web/index.html` | Chat, voice, memory, sound-effect, media, avatar, and setup UI. |
| `web/styles.css` | Neon yellow, hot-pink, red, and green theme; responsive layout; avatar animation effects. |
| `web/app.js` | Streamed local chat, local archive, voice playback, avatar reactions, approval cards, and local controls. |
| `web/capri.png` | Main Capri artwork used by the interface. |
| `web/sprites/idle.png` | Idle animation frames. |
| `web/sprites/blink.png` | Blink animation frames. |
| `web/sprites/blink_glitch.png` | Blink/glitch transition frames. |
| `web/sprites/glitch.png` | Glitch reaction frames. |
| `web/sprites/grin.png` | Thinking and success reaction frames. |
| `web/sprites/mouth.png` | Mouth frames animated during voice playback. |
| `web/sprites/sleep.png` | Sleep animation frames. |
| `web/sprites/wake.png` | Wake-up animation frames. |

The following local-only paths are intentionally excluded:

- `.capri-data/` — chats, memory notes, custom avatar, WebView profile, models, and voice files.
- `.venv/` — installed Python packages.
- `.setup-temp/` — temporary downloads and setup cache.
