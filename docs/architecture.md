# Architecture overview

Engclaw is a fully local Electron app. There is no server. This page is the short version for contributors.

## Processes

```text
Renderer (React, sandboxed)  <-- typed IPC via preload -->  Main process (Node)
                                                              |  MessagePort
                                                              v
                                                     Utility process (ML)
```

- **Renderer** (`apps/desktop/src/renderer`): React UI, audio capture and playback, i18n. No Node access. Loaded from a custom `app://` protocol, with a strict CSP.
- **Preload** (`apps/desktop/src/preload`): the small typed API exposed with `contextBridge`.
- **Main** (`apps/desktop/src/main`): app lifecycle, windows, IPC handlers, model downloads, YouTube access, SQLite storage (history, dictionary, flashcards, game progress), the AI provider/agent, auto-update.
- **Utility process** (`apps/desktop/src/utility`): runs `onnxruntime-node` (WebGPU with CPU fallback), the model adapter, the bundled `espeak-ng` phonemizer, Kokoro text-to-speech, and the scoring pipeline.

Audio flow: the renderer records, resamples to 16 kHz mono, and sends the buffer over IPC to the utility process, which returns a JSON analysis.

## Packages

| Package                 | Purpose                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pronounce`    | Pure TypeScript scoring: CTC decode, phone comparison, DTW, alignment. No Electron or DOM imports, so it runs in plain Node tests. |
| `packages/prosody`      | Pitch (pYIN) and energy analysis.                                                                                                  |
| `packages/ipc-contract` | zod schemas and types for every IPC call, shared by main, preload and renderer.                                                    |
| `packages/models`       | Model catalog schema and the download manager (resume, checksum, atomic install).                                                  |
| `packages/youtube`      | YouTube adapter, isolated so it can be replaced or removed.                                                                        |
| `packages/dictionary`   | Dictionary lookup and flashcard scheduling.                                                                                        |
| `packages/game`         | Game rules (attempt evaluation, stars).                                                                                            |
| `packages/i18n`         | Locale files and helpers.                                                                                                          |

## Models and data

- `apps/desktop/resources/models.json` pins each model's Hugging Face repo, revision and per-file SHA-256. Models are downloaded at runtime, never committed.
- `apps/desktop/resources/data/` holds the dictionary and game-content SQLite databases, built by the scripts in `scripts/data`.
- `espeak-ng` is built from a pinned release by `scripts/espeak/build.sh` and shipped as a separate executable.

## Security rules

`contextIsolation` and `sandbox` on, no `nodeIntegration`, CSP, validated IPC only (zod), `setWindowOpenHandler` deny plus an https-only `openExternal` allow-list, and a permission handler allowing only the microphone. `tests/security.test.ts` guards some of these. Do not add generic fs/shell/ipcRenderer access to the renderer.

## More detail

The design decisions and specs live in the project's Paca docs (System Architecture, Decisions Log, ONNX Model Conversion & Delivery, OpenPronounce Algorithm Spec).
