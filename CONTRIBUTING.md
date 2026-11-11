# Contributing to Engclaw

Thanks for helping out. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first. Questions and ideas are welcome in [GitHub Discussions](https://github.com/pikann/engclaw/discussions).

## Set up

You need:

- [Bun](https://bun.sh) (installs dependencies and runs scripts).
- Git.
- CMake and a C compiler (on Windows, an MSYS2 MINGW64 shell). The app bundles its own pinned `espeak-ng`, so players install nothing. `bun run dev`, `package` and `dist` build and stage it into `apps/desktop/resources/espeak-ng/` automatically the first time (`./scripts/espeak/build.sh` does the same by hand; `FORCE=1` rebuilds). The app looks for `ESPEAK_NG`, then that folder, then common install locations, then `PATH`. The unit tests do not need it.

Supported development machines are macOS on Apple Silicon, Windows x64 and Linux x64 (the `onnxruntime-node` binaries limit this).

```bash
git clone https://github.com/pikann/engclaw.git
cd engclaw
bun install
bun run dev
```

The first time you record, the app asks to download about 2.6 GB of models from Hugging Face. They are stored in the Electron user data folder (change it in Settings → AI models).

## Build, run and test

```bash
bun run dev          # run the app with hot reload
bun run lint         # ESLint
bun run typecheck    # tsc for every workspace
bun run test         # Vitest unit and golden tests (no models or network needed)
bun run build        # production build into apps/desktop/out
bun run package      # unpacked app in apps/desktop/release (needs espeak-ng staged)
bun run test:e2e     # Playwright end-to-end tests (see below)
bun run license:check
```

Before opening a PR, `lint`, `typecheck` and `test` must pass. CI also runs `license:check` and a package build.

### End-to-end tests

The e2e tests drive the built app with Playwright and a fake microphone. They use the dev-only design-system route, so build with that flag first:

```bash
VITE_DESIGN_SYSTEM=1 bun run build
bun run test:e2e          # headless
bun run test:e2e:headed   # watch it run
```

On Linux without a display use `xvfb-run --auto-servernum bun run test:e2e`. CI runs this manually from the Actions tab.

Rebuild before re-running: the specs load the built `out/` folder, not your sources.

The helpers in `apps/desktop/e2e/support` let a spec cover practice, shadowing, game and converse without models or network:

- `audio.ts`: sound fixtures the fake microphone plays in a loop (`speech`, `speechThenSilence`, `silence`, `tone`, `quiet`). Pick one with `launchApp({ audio })`.
- `speech-stubs.ts`: replaces the on-device ASR, pronunciation analysis, intonation and TTS with scripted answers and logs each call with the RMS of the audio it received, which proves the fixture reached the app.
- `fake-llm.ts`: a scriptable OpenAI-compatible provider on a loopback port (replies, HTTP errors, broken streams, tool calls, stalls) that records every request.
- `launch.ts`: `launchApp`, plus `breakMic` / `fixMic` to simulate a denied, missing or busy microphone.
- `shadowing.ts`: opens a cached video session offline, with a stand-in for the YouTube player.

Chromium's fake mic only works with `--no-sandbox` (on macOS its audio service cannot open the WAV otherwise and records silence), so the launchers always pass it. Specs that need the real models still use `ENGCLAW_E2E_USER_DATA`.

## Regenerate the README GIFs

The GIFs in `docs/media` are recorded from the real UI by `apps/desktop/media/readme-gifs.spec.ts`. Like the e2e specs they use the fake microphone and the scripted speech engine and fake LLM, so they are deterministic and need no models, microphone or network (the shadowing video is a drawn look-alike of a video player, because the real one is a native view that screenshots cannot see, and it needs the network). The navigation sidebar is collapsed in every GIF. Requires `ffmpeg` on your `PATH`.

```bash
cd apps/desktop
bun run media                                             # build, then record all five GIFs
bunx playwright test -c playwright.media.config.ts -g game  # re-record one scene (needs a build)
```

Change what a GIF shows by editing its scene (scores, text, pauses). Keep each GIF under about 500 KB; the status bar is cropped automatically.

## How the code is organised

Read the [architecture overview](docs/architecture.md) first. In short:

- `apps/desktop/src/main`: privileged services (models, YouTube, SQLite, AI provider, updates).
- `apps/desktop/src/utility`: ML inference, phonemizer and the scoring pipeline.
- `apps/desktop/src/renderer`: React UI.
- `packages/pronounce` (and `prosody`): pure TypeScript scoring, tested in plain Node.
- `packages/ipc-contract`: zod schemas for every IPC call. Add a method here first; main, preload and renderer all depend on it.

Rules that are checked by tests or review: no Node APIs in the renderer, every IPC payload is validated, and no generic fs/shell access is exposed to the UI (see `tests/security.test.ts`).

## Regenerate the golden data

The scoring port is tested against outputs from the Python [OpenPronounce](https://github.com/Halleck45/OpenPronounce) reference, stored in `tests/golden`. Regenerate only when you change the algorithm on purpose or move to a newer upstream commit. The steps (Python 3.10+, `espeak-ng`, `ffmpeg`, network on first run) are in [tests/golden/README.md](tests/golden/README.md). Record the new upstream commit there and explain the diff in your PR.

The dictionary and game content databases in `apps/desktop/resources/data` are built by the scripts in `scripts/data` (for example `bun scripts/data/build-dictionary.ts`). Crawlers cache under the git-ignored `.cache/`; never commit raw crawled pages. Read the `*_SOURCES.md` files next to the databases for licensing rules first.

## Export or update models

Users cannot choose models; a model change is an app release that pins a new revision in `apps/desktop/resources/models.json`. The full procedure (ONNX export, verification, publishing, checksums) is in the [model export guide](docs/model-export.md).

## Add a locale

1. Copy `packages/i18n/locales/en` to `packages/i18n/locales/<code>` (for example `fr`) and translate every value in `common.json` and `main.json`. Keep the keys and `{{placeholders}}` unchanged; plural keys (`_one`, `_other`) follow the target language's plural forms.
2. Register it in `packages/i18n/src/index.ts`: import the two JSON files and add `<code>: { common, main }` to `resources`.
3. Add the new language's name under the `language` key (`"<code>": "Name"`) in every locale's `common.json`; the language switcher lists locales from `SUPPORTED_LOCALES` and reads these names.
4. Run `bun run test`. `tests/i18n-parity.test.ts` fails if any key is missing or empty.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(i18n): add Vietnamese strings`.
- Keep PRs focused; one change per PR. Fill in the PR template.
- Add or update tests with behavior changes.

## Developer Certificate of Origin (DCO)

Engclaw uses the [DCO](https://developercertificate.org/) instead of a CLA. Every commit must be signed off to certify you have the right to submit it under the project license (GPL-3.0-or-later):

```bash
git commit -s -m "feat: my change"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line.

## License of contributions

By contributing, you agree your contribution is licensed under `GPL-3.0-or-later`.

## What not to commit

- Model weights, benchmark audio, or crawled copyrighted content (for example etymonline or learnthat text).
- API tokens, signing certificates or other secrets.

## Dependencies

New dependencies must have a license compatible with GPL-3.0-or-later. CI runs `bun run license:check` and fails on disallowed licenses. After adding one, run `bun run license:generate` to refresh `THIRD_PARTY_LICENSES.md`.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).
