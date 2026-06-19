<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" alt="Ferry icon" />

  # Ferry

  A modern, native SFTP client — built on Tauri 2 and Next.js.
</div>

<br />

Ferry is a lightweight desktop SFTP client with a dual-pane file manager,
drag-and-drop transfers, and a real Rust backend talking SFTP over libssh2 —
no Electron, no bundled browser runtime.

## Features

- **Dual-pane browser** — local and remote file systems side by side, with
  breadcrumb navigation, search (including inside subfolders), and a
  right-click context menu for the usual file operations.
- **Drag and drop** — drag files between panes to upload/download, or drop
  files in from the OS file manager directly onto the remote pane.
- **Transfer queue** — uploads and downloads run through a per-connection
  queue with live progress, pause/resume, and cancel.
- **Connection profiles** — save servers with name, color, and favorite
  status. Passwords and key passphrases are stored in the OS keychain
  (Keychain / Credential Manager / Secret Service), never in plain text.
- **File preview** — quick look at text and image files without leaving
  the app.
- **Light and dark themes**, matching your OS by default.

## Tech stack

| Layer    | Tech |
|----------|------|
| Backend  | Rust, [Tauri 2](https://tauri.app), [ssh2](https://docs.rs/ssh2) (libssh2, vendored OpenSSL) |
| Frontend | [Next.js](https://nextjs.org) (App Router, static export), TypeScript |
| Styling  | Tailwind CSS v4 |
| State    | Zustand |
| Animation| GSAP |

## Getting started

### Prerequisites

- [pnpm](https://pnpm.io)
- [Rust](https://www.rust-lang.org/tools/install) + Cargo
- `perl` (needed to build vendored OpenSSL on first compile)

### Install

```bash
pnpm install
```

### Run in development

```bash
pnpm tauri dev    # full desktop app, hot reload
```

Or, for frontend-only work without the Tauri window:

```bash
pnpm dev          # Next.js dev server at localhost:3000
```

### Build a release bundle

```bash
pnpm build        # Next.js static export -> ./out
pnpm tauri build  # native .app/.dmg/.exe/etc.
```

### Checks

```bash
pnpm lint                     # eslint
npx tsc --noEmit               # type-check
cd src-tauri && cargo check    # Rust compile check
```

## Project structure

```
src/                  Next.js frontend
  components/         browser, connection, transfers, preview UI
  lib/                Tauri command wrappers, Zustand stores, helpers
src-tauri/src/        Rust backend
  sftp/               SFTP session + commands (ssh2/libssh2)
  localfs/            local filesystem commands
  store/              connection profiles + keychain secrets
  transfers/          upload/download queue
```

See [`CLAUDE.md`](./CLAUDE.md) for a deeper architecture walkthrough.
