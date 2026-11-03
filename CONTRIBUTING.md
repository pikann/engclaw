# Contributing to Engclaw

Thanks for helping out. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Getting started

```bash
bun install
bun run dev
```

Before opening a PR, make sure these pass:

```bash
bun run lint
bun run typecheck
bun run test
```

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(i18n): add Vietnamese strings`.
- Keep PRs focused; one change per PR.

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

## Adding a locale

Add a folder under `packages/i18n` mirroring the English keys. `tests/i18n-parity.test.ts` checks that every locale has the same keys.

## Dependencies

New dependencies must have a license compatible with GPL-3.0-or-later. CI runs `bun run license:check` and fails on disallowed licenses.
