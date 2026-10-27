# AI project research and reuse notes

Reviewed 2026-10-26 for CapriCompanion. This is a practical shortlist, not an endorsement or a claim that every upstream feature has been independently tested.

## Useful references

### `solas2529/local-ollama-agent`

- Repository: <https://github.com/solas2529/local-ollama-agent>
- License: MIT, as identified by the repository README and GitHub license metadata.
- Relevant ideas: local Ollama desktop assistant; Qwen vision; file tools scoped to allowed roots; explicit workspace boundaries; warnings about prompt injection from read files.
- Applied here: Capri now has optional, one-time-approved listing and reading for Documents, Downloads, and Desktop. The local implementation is written for Capri's existing server-side approval IDs and its 2K context. Reads are limited to UTF-8 text/code, reject hidden/system/reparse-point and sensitive-looking paths, and give a file excerpt to a tools-disabled local summary request. The listing and raw excerpt are not saved in chat history.
- Not imported: its shell, Python execution environment, web access, file writes, or source code. Capri's file-access implementation is separate original code; no upstream MIT code is redistributed by this feature.
- Performance note: the RTX 4060 speed/context numbers in that project's README are that author's measurements for a different model/context setup, not a Capri benchmark or promise.

### `AndreyLebedenko/jarvis-local`

- Repository: <https://github.com/AndreyLebedenko/jarvis-local>
- Reviewed for ideas: offline voice/vision flow, sentence-sized speech, user-auditable local journal, and explicit screen capture.
- Not imported: Capri already has Vosk and Kokoro. Jarvis documents Gemma 4 12B as its tested default and has a much larger modular surface; adopting its full stack would conflict with Capri's small-context/low-resource goals. No Jarvis code or assets are included.

### `Soumodeep-Ganguly/fully-offline-windows-desktop-voice-agent`

- Repository: <https://github.com/Soumodeep-Ganguly/fully-offline-windows-desktop-voice-agent>
- Reviewed for ideas: opt-in local voice pipeline, interruptible speech, bounded tool registry, and persisted memory.
- Reuse status: no visible `LICENSE` file was found during this review, so its code is not copied or adapted here. Its optional faster-whisper route would also add model downloads and CPU load.

## Capri artwork boundary

### `mochiiwuff/capri-desktop`

- Repository: <https://github.com/mochiiwuff/capri-desktop>
- Its source license is MIT, while its README says the anime-derived artwork in `assets/capri/` and `docs/` is excluded and belongs to the respective rights holders.
- CapriCompanion does not copy those images or claim them under the source-code license. The currently bundled sprites remain under Lachy's separate PolyForm Noncommercial terms and attribution in [`CAPRI_ASSET_LICENSE.md`](CAPRI_ASSET_LICENSE.md).
- Its pose and reaction approach can inform new animation code, while every art asset keeps its own actual rights and notice.

## Reuse and publication rule

The MIT license in [`LICENSE`](LICENSE) covers original CapriCompanion code copyright © 2026 ACE07X. It does not absorb third-party artwork, weights, voices, or separately licensed code. If future changes copy or adapt third-party source code, add the exact upstream license and copyright notice, name the affected files, and keep that notice distinct from ACE07X's license. A project's public availability alone is not permission to reuse its art or code.
