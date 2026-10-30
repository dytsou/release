# Release

Create a **GitHub Release**, **publish packages**, and/or **bump the patch version** from `package.json` / a semver tag.

Registry publish is split into two Actions:

- `dytsou/release/npm-publish` → **npmjs**
- `dytsou/release/github-packages` → **GitHub Packages**

Version bump (opens a PR):

- `dytsou/release/bump-patch-version` → bump `package.json` patch + PR
- `dytsou/release/bump-git-tag` → bump git tag (v*.*.*) patch + PR

[![GitHub release](https://img.shields.io/github/v/release/dytsou/release)](https://github.com/dytsou/release/releases)
[![CI](https://github.com/dytsou/release/actions/workflows/ci.yml/badge.svg)](https://github.com/dytsou/release/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [繁體中文](README-zh.md)

## Table of contents

- [Quick Start](#quick-start)
- [Actions](#actions)
- [Behavior](#behavior)
- [Inputs](#inputs)
- [Caller contract](#caller-contract)
- [Support](#support)
- [Contributing](#contributing)
- [Important Notes](#important-notes)

## Quick Start

1. **Checkout with history** — these Actions do not checkout. Use `fetch-depth: 0`.
2. **Add a caller workflow**:

### Publish to npmjs only

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0

- uses: dytsou/release/npm-publish@v1
  with:
    npm-token: ${{ secrets.NPM_TOKEN }}
```

### Publish to GitHub Packages only

```yaml
- uses: dytsou/release/github-packages@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

Job needs `permissions: packages: write` (and usually `id-token: write` if you enable provenance later).

### Publish to both registries (separate steps)

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    branches: [main]
    paths: ["package.json"]
  release:
    types: [created]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: dytsou/release/npm-publish@v1
        with:
          npm-token: ${{ secrets.NPM_TOKEN }}

      - uses: dytsou/release/github-packages@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # deps already installed by npm-publish in the same job:
          install-deps: "false"
          verify-pack: "false"
```

### GitHub Release (tag already exists)

```yaml
- uses: dytsou/release/github@v1
  with:
    tag: ${{ inputs.tag }}
```

### GitHub Release from package.json (optional)

```yaml
- uses: dytsou/release/github@v1
  with:
    from-package-json: "true"
    create-missing-tag: "true" # optional, default true
    commit-notes: "true" # optional, default true
    move-major-tag: "false"
```

### Bump patch version (opens a PR)

```yaml
# .github/workflows/bump-patch-version.yml
name: Bump patch version

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  bumpPatchVersion:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          fetch-tags: true

      - uses: dytsou/release/bump-patch-version@v1
```

### Bump git tag patch version (opens a PR)

```yaml
# .github/workflows/bump-git-tag.yml
name: Bump git tag

on:
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: dytsou/release/bump-git-tag@v1
        with:
          base-branch: main
          labels: ci, maintenance
          move-major-tag: "true"
```

### Combined root action

```yaml
- uses: dytsou/release@v1
  with:
    github-release: "true"
    npm-publish: "true"
    github-packages-publish: "true"
    npm-token: ${{ secrets.NPM_TOKEN }}
    token: ${{ secrets.GITHUB_TOKEN }}
```

Pin `@v1` for floating updates, or pin `@v1.2.0` / a commit SHA in production.

## Actions


| Action | Purpose |
| ------ | ------- |
| `dytsou/release/bump-patch-version@v1` | Bump `package.json` patch version and open a PR |
| `dytsou/release/bump-git-tag@v1` | Bump git tag (v*.*.*) patch version and open a PR |
| `dytsou/release/npm-publish@v1` | Publish to **npmjs** (skip if version exists) |
| `dytsou/release/github-packages@v1` | Publish to **GitHub Packages** (skip if version exists) |
| `dytsou/release/github@v1` | GitHub Release + optional major tag; optional `from-package-json` |
| `dytsou/release/package-json@v1` | Preset: `from-package-json=true` |
| `dytsou/release@v1` | Combined (toggles for release + each registry) |

## Behavior

### `bump-patch-version`

1. Fail if the base branch has no commits after the latest tag (when tags exist).
2. Bump the patch segment in `package.json` (no npm lifecycle scripts).
3. Open a pull request with the change.

### `npm-publish` / `github-packages`

1. Read `name` / `version` from `package.json`.
2. If `skip-if-exists` (default `true`) and that version is already on the registry → skip.
3. Optionally `pnpm install --frozen-lockfile --ignore-scripts`.
4. Optionally `pnpm pack` as a dry check.
5. `pnpm publish` to that registry only.

### `github` (default)

1. Resolve tag from input or `github.ref_name`.
2. Create the GitHub Release; optionally move major tag `vN`.

### Optional `from-package-json: true`

1. Read `version` from `package.json`.
2. On tag push, require `v{version}` to match.
3. Otherwise create/push the tag when `create-missing-tag` is true.
4. Optionally prepend commit-list notes (`commit-notes`).
5. Create the GitHub Release.

Body placeholders: `__TAG__`, `__MAJOR__`.

## Inputs

See each `action.yml`. Registry Actions share:

| Name | Default | Description |
| :--- | :--- | :--- |
| `skip-if-exists` | `true` | Skip when `name@version` already exists |
| `install-deps` | `true` | Run `pnpm install` |
| `verify-pack` | `true` | Run `pnpm pack` before publish |
| `package-json-path` | `package.json` | Manifest path |
| `working-directory` | `.` | Package root |
| `pnpm-version` | _(empty)_ | pnpm for `pnpm/action-setup`; empty uses `packageManager`, else `10` |

`npm-publish` also takes `npm-token`, `npm-access`.  
`github-packages` takes `token` (default `github.token`).

`bump-patch-version` inputs: `package-json-path`, `base-branch`, `labels`, `token`.

## Caller contract

### Prerequisites

1. Checkout before calling (`fetch-depth: 0`; bump also needs `fetch-tags: true`)
2. GitHub Release / tag create: `contents: write`
3. Bump PR: `contents: write` + `pull-requests: write`
4. GitHub Packages: `packages: write` (+ `id-token: write` if needed)
5. npmjs: `NPM_TOKEN` secret

### Local smoke (this repository)

```bash
node --test lib/*.test.mjs
```

## Support

### When things go wrong


| What you see | Likely cause |
| ------------ | ------------ |
| Version skipped | Already on that registry (`skip-if-exists`) |
| `npm-token is required` / `token is required` | Missing secret for that Action |
| Publish failed after install | Registry auth / package `name` scope mismatch |
| `Version mismatch!` | Tag does not match `package.json` (`from-package-json`) |
| `Invalid npm package name` / `Invalid semver` | `package.json` `name`/`version` failed allowlist |
| `body must not contain ${{ secrets` | Release body template interpolates secrets — remove them |

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## Important Notes

> [!IMPORTANT]
> **These Actions do not checkout.** Callers must checkout first with full history.

> [!WARNING]
> Do not put `${{ github.token }}` or `${{ secrets.* }}` literally inside release **body** templates in caller workflows — Actions will interpolate them into published notes. The Action rejects those expression patterns in `body` and redacts common `ghp_` / `github_pat_` shapes from notes.

> [!NOTE]
> `name` / `version` / tag / scope are allowlisted before shell or registry use. Prefer normal npm names and semver.

## License

This project is open source and available under the [MIT License](LICENSE).
