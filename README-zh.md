# Release

建立 **GitHub Release**、**publish 套件**，並／或 **bump patch 版本**（從 `package.json`／semver tag）。

Registry publish 拆成兩個 Action：

- `dytsou/release/npm-publish` → **npmjs**
- `dytsou/release/github-packages` → **GitHub Packages**

版本 bump（開 PR）：

- `dytsou/release/bump-patch-version` → bump `package.json` patch + PR
- `dytsou/release/bump-git-tag` → bump git tag (v*.*.*) patch + PR

[![GitHub release](https://img.shields.io/github/v/release/dytsou/release)](https://github.com/dytsou/release/releases)
[![CI](https://github.com/dytsou/release/actions/workflows/ci.yml/badge.svg)](https://github.com/dytsou/release/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [繁體中文](README-zh.md)

## 目錄

- [快速開始](#快速開始)
- [Actions](#actions)
- [行為](#行為)
- [輸入](#輸入)
- [Caller 契約](#caller-契約)
- [支援](#支援)
- [貢獻](#貢獻)
- [重要說明](#重要說明)

## 快速開始

1. **先 checkout 完整歷史** — 這些 Action 不會 checkout。請使用 `fetch-depth: 0`。
2. **加入 caller workflow**：

### 只 publish 到 npmjs

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0

- uses: dytsou/release/npm-publish@v1
  with:
    npm-token: ${{ secrets.NPM_TOKEN }}
```

### 只 publish 到 GitHub Packages

```yaml
- uses: dytsou/release/github-packages@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

Job 需要 `permissions: packages: write`（若之後開 provenance，通常還要 `id-token: write`）。

### 兩個 registry 都 publish（分開兩個 step）

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
          # 同一個 job 裡 npm-publish 已裝過 deps：
          install-deps: "false"
          verify-pack: "false"
```

### GitHub Release（tag 已存在）

```yaml
- uses: dytsou/release/github@v1
  with:
    tag: ${{ inputs.tag }}
```

### 從 package.json 做 GitHub Release（optional）

```yaml
- uses: dytsou/release/github@v1
  with:
    from-package-json: "true"
    create-missing-tag: "true" # 可選，預設 true
    commit-notes: "true" # 可選，預設 true
    move-major-tag: "false"
```

### Bump patch 版本（開 PR）

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

### Bump git tag patch 版本（開 PR）

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

### 合併 root action

```yaml
- uses: dytsou/release@v1
  with:
    github-release: "true"
    npm-publish: "true"
    github-packages-publish: "true"
    npm-token: ${{ secrets.NPM_TOKEN }}
    token: ${{ secrets.GITHUB_TOKEN }}
```

Major tag（`@v1`）會跟著同 major 浮動；固定版本請用 `@v1.2.0` 或 commit SHA。

## Actions


| Action | 用途 |
| ------ | ---- |
| `dytsou/release/bump-patch-version@v1` | Bump `package.json` patch 並開 PR |
| `dytsou/release/bump-git-tag@v1` | Bump git tag (v*.*.*) patch 並開 PR |
| `dytsou/release/npm-publish@v1` | Publish 到 **npmjs**（版本已存在則跳過） |
| `dytsou/release/github-packages@v1` | Publish 到 **GitHub Packages**（版本已存在則跳過） |
| `dytsou/release/github@v1` | GitHub Release + 可選 major tag；可選 `from-package-json` |
| `dytsou/release/package-json@v1` | 預設：`from-package-json=true` |
| `dytsou/release@v1` | 合併（release + 各 registry 開關） |

## 行為

### `bump-patch-version`

1. 若已有 tag，且 base branch 沒有比最新 tag 更新的 commit → 失敗。
2. Bump `package.json` 的 patch（不跑 npm lifecycle scripts）。
3. 開一張 PR。

### `bump-git-tag`

1. 若已有 tag，且 base branch 沒有比最新 tag 更新的 commit → 失敗。
2. 從最新 `v*.*.*` tag 找出版本，bump patch（例如 `v1.2.3` → `v1.2.4`）。
3. 建立新 tag，若 `move-major-tag` 為 `"true"`，會同時移動 major tag（例如 `v1` → `v1.2.4`）。
4. 開一張 PR。

### `npm-publish` / `github-packages`

1. 讀取 `package.json` 的 `name` / `version`。
2. 若 `skip-if-exists`（預設 `true`）且該版本已在 registry → 跳過。
3. 可選執行 `pnpm install --frozen-lockfile --ignore-scripts`。
4. 可選執行 `pnpm pack` 當 dry check。
5. 對**該 registry** 執行 `pnpm publish`。

### `github`（預設）

1. 從 input 或 `github.ref_name` 解析 tag。
2. 建立 GitHub Release；可選移動 major tag `vN`。

### 可選 `from-package-json: true`

1. 讀取 `package.json` 的 `version`。
2. tag push 時要求 `v{version}` 一致。
3. 否則在 `create-missing-tag` 為 true 時建立／push tag。
4. 可選加上 commit list notes（`commit-notes`）。
5. 建立 GitHub Release。

Body 佔位符：`__TAG__`、`__MAJOR__`。

## 輸入

詳見各 `action.yml`。Registry Actions 共用：

| 名稱 | 預設 | 說明 |
| :--- | :--- | :--- |
| `skip-if-exists` | `true` | `name@version` 已存在則跳過 |
| `install-deps` | `true` | 執行 `pnpm install` |
| `verify-pack` | `true` | publish 前執行 `pnpm pack` |
| `package-json-path` | `package.json` | manifest 路徑 |
| `working-directory` | `.` | 套件根目錄 |
| `pnpm-version` | _(空)_ | 給 `pnpm/action-setup` 的版本；空則用 `packageManager`，否則 `10` |

`npm-publish` 另需 `npm-token`、`npm-access`。  
`github-packages` 使用 `token`（預設 `github.token`）。

`bump-patch-version` 輸入：`package-json-path`、`base-branch`、`labels`、`token`。

`bump-git-tag` 輸入：`base-branch`、`labels`、`token`、`move-major-tag`（預設 `"false"`）。

## Caller 契約

### 前置條件

1. 呼叫前先 checkout（`fetch-depth: 0`；bump 另需 `fetch-tags: true`）
2. GitHub Release／建 tag：`contents: write`
3. Bump PR：`contents: write` + `pull-requests: write`
4. GitHub Packages：`packages: write`（需要時加 `id-token: write`）
5. npmjs：`NPM_TOKEN` secret

### 本倉庫本地檢查

```bash
node --test lib/*.test.mjs
```

## 支援

### 常見狀況


| 你看到的現象 | 可能原因 |
| ------------ | -------- |
| Version skipped | 該 registry 已有此版本（`skip-if-exists`） |
| `npm-token is required` / `token is required` | 對應 Action 缺少 secret |
| Publish failed after install | registry 認證／package `name` scope 不符 |
| `Version mismatch!` | tag 與 `package.json` 不一致（`from-package-json`） |
| `Invalid npm package name` / `Invalid semver` | `package.json` 的 `name`/`version` 未通過 allowlist |
| `body must not contain ${{ secrets` | release body 範本插到了 secrets — 請移除 |

## 貢獻

歡迎貢獻 — 見 [CONTRIBUTING.md](CONTRIBUTING.md) 與 [Code of Conduct](CODE_OF_CONDUCT.md)。

## 重要說明

> [!IMPORTANT]
> **這些 Action 不會 checkout。** Caller 必須先以完整歷史 checkout。

> [!WARNING]
> 不要在 caller workflow 的 release **body** 範本裡寫 `${{ github.token }}` 或 `${{ secrets.* }}` — Actions 會把它們插值進公開的 release notes。Action 會拒絕這類 expression，並 redact 常見的 `ghp_` / `github_pat_` 形狀。

> [!NOTE]
> `name` / `version` / tag / scope 在進入 shell 或 registry 前會做 allowlist 檢查。

## License

本專案以 [MIT License](LICENSE) 開源。
