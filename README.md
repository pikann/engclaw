# Engclaw

Engclaw is an open-source desktop app (macOS, Windows, Linux) for practising English pronunciation. It scores how you say a sentence against a reference, phone by phone, and lets you shadow YouTube videos. The UI is available in English and Vietnamese.

## Privacy

- **No server, no account, no telemetry.** Everything runs on your machine.
- Your recordings, history and settings are stored locally in the app data directory.
- The app only makes network requests when you ask it to: downloading models from Hugging Face on first use of a feature, and fetching a YouTube video you choose.

## Build and run

Requirements: [Bun](https://bun.sh) and a current Node-compatible toolchain for Electron.

```bash
bun install
bun run dev        # start the app in development mode
bun run lint
bun run typecheck
bun run test
bun run package    # unpacked production build in apps/desktop/release
```

## Models

Models are not bundled or committed. They are downloaded from Hugging Face Hub the first time a feature needs them, verified by checksum, and stored in the app data directory. The default phone model is `facebook/wav2vec2-lv-60-espeak-cv-ft`; compatible models can be chosen in Settings. Each model keeps its own license, which is shown before download.

## YouTube

Fetching captions and audio outside the official player may be against YouTube's Terms of Service. This feature is intended for personal, educational use only, and you are responsible for how you use it. The extraction code is isolated in `packages/youtube` so it can be removed or replaced.

## Repository layout

- `apps/desktop`: Electron app (main process, renderer, e2e tests)
- `packages/*`: pronunciation scoring, prosody, YouTube adapter, IPC contract, i18n
- `tests`: cross-package tests and golden data

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

Engclaw is licensed under the [GNU General Public License v3.0 or later](LICENSE) (`GPL-3.0-or-later`). It bundles the `espeak-ng` binary (GPL-3.0-or-later). Third-party notices are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Engclaw's scoring algorithm is a TypeScript port of OpenPronounce, used under the MIT License.
