# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ferry — a modern SFTP client. Tauri 2 (Rust) backend, Next.js (App Router) frontend, Tailwind v4, GSAP for animation, Zustand for state. Package manager is pnpm (do not use npm/yarn).

## Commands

```bash
pnpm dev          # Next.js dev server only (web, no Tauri window), localhost:3000
pnpm tauri dev    # Full desktop app: runs `pnpm dev` then opens the Tauri window, hot reload
pnpm build        # Next.js static export -> ./out (required before tauri build)
pnpm tauri build  # Native bundle (.app/.dmg/.exe/etc) from ./out
pnpm lint         # eslint
npx tsc --noEmit  # type-check the frontend
cd src-tauri && cargo check   # Rust compile check without building the app
cd src-tauri && cargo build   # Rust debug build
```

No test runner is configured yet.

## Architecture

Two halves, glued by `src-tauri/tauri.conf.json`. `next.config.ts` forces `output: "export"` (`images.unoptimized: true`) — Tauri loads the frontend as static files from `./out`, not via a Node server, so any Next feature requiring a server (API routes, SSR, ISR) will not work here.

### Backend (`src-tauri/src/`)

- `lib.rs` — `tauri::Builder` setup, plugin registration (`tauri-plugin-dialog`, `tauri-plugin-log`), `.manage()`s the two pieces of shared state (`SftpManager`, `TransferManager`), and lists every `#[tauri::command]` in `invoke_handler!`. Add new commands here.
- `error.rs` — `AppError` (thiserror), serializes to a plain string for the JS side of `Result<T, E>`.
- `store/` — connection profile CRUD. Non-secret fields (host, port, username, key path, etc.) persist as JSON at `app_data_dir()/connections.json` (`store/mod.rs`). Secrets (password / key passphrase) go through `store/secrets.rs`, a thin wrapper over the `keyring` crate (OS keychain — Keychain/Credential Manager/Secret Service), keyed by profile id. Commands in `store/commands.rs`.
- `sftp/` — the actual SFTP backend, built on `ssh2` (libssh2 bindings, built with the `vendored-openssl` feature so it doesn't need a system OpenSSL). `connection.rs` wraps `ssh2::Session` + `ssh2::Sftp` (both internally `Arc<Mutex<..>>`-backed and `Send + Sync` already — no extra locking needed). `manager.rs` holds open connections in a `Mutex<HashMap<connectionId, Arc<SftpConnection>>>`. Commands in `commands.rs` are `async fn`s that `tauri::async_runtime::spawn_blocking` the actual libssh2 calls.
- `localfs/` — local filesystem equivalent of `sftp/`, using plain `std::fs` directly (custom commands, not `tauri-plugin-fs`). This was a deliberate choice over the fs plugin: the fs plugin's permission-scope system fights a file-manager's need to browse anywhere on disk, whereas a custom command has no extra scope layer. Returns the same `RemoteEntry` shape as the SFTP side (imported from `sftp::connection`) so the frontend can treat local/remote listings identically.
- `transfers/` — upload/download queue. One queue *per connection* (serialized — avoids hammering a single `ssh2::Session` concurrently), `TransferControl { paused, cancelled }` atomics per transfer for pause/cancel, progress emitted via `transfer:update` events (throttled to ~150ms). `connection:status` events report connect/disconnect/error state. See `transfers/mod.rs` for the worker loop (`spawn_enqueue` → `run_worker` → `process_transfer` → `copy_loop`).

### Frontend (`src/`)

- `lib/api.ts` — typed wrappers around every Tauri command + event, one object per backend module (`connectionsApi`, `sftpApi`, `localFsApi`, `transfersApi`). This is the only place that should call `invoke`/`listen` directly. All cross-IPC types use `camelCase` (Rust structs are annotated `#[serde(rename_all = "camelCase")]` to match).
- `lib/stores/` — Zustand. `connectionsStore` owns saved profiles + open connection "sessions" (tabs); `transfersStore` mirrors the backend transfer queue (subscribes to `transfer:update` once via `init()`); `paneStore.ts` exports `createPaneStore()` — the **local** pane uses a singleton (`useLocalPaneStore`), but each **remote** pane gets its own store instance created in `DualPane` (keyed by `session.id` from the parent so switching connection tabs doesn't bleed state between sessions).
- `components/browser/` — `DualPane` (local + remote side by side, resizable divider, OS drag-and-drop-in via Tauri's `onDragDropEvent`) and `FilePane` (breadcrumbs, search/filter, context menu, cross-pane HTML5 drag-and-drop). `FilePane` is side-agnostic — it's handed a `store` prop and switches between `localFsApi`/`sftpApi` based on the `side` prop.
- `components/connection/`, `components/transfers/`, `components/preview/` — connection dialog/list, transfer queue drawer, file preview panel (text/image only, no syntax highlighting — kept dependency-light).
- `lib/animations.ts` — small GSAP helpers (`fadeInUp`, `staggerRows`, `scaleIn`, `slideInFromLeft`, `slideUpFromBottom`) plus two hooks (`useFadeInOnChange`, `useStaggerOnChange`) used for panel/row transitions.
- Theming is class-based dark mode (`@custom-variant dark` in `globals.css`, not just `prefers-color-scheme`), toggled by `ThemeToggle` and initialized pre-hydration by an inline script in `layout.tsx` to avoid a flash/mismatch.

### Capabilities (`src-tauri/capabilities/default.json`)

Only `core:default` and `dialog:default` are needed — there's no `fs:*` permission because local filesystem access goes through the custom `localfs` commands, not the official fs plugin.

## pnpm build-script approvals

`pnpm-workspace.yaml` sets `allowBuilds: { sharp: true, unrs-resolver: true }` — pnpm otherwise blocks their native build scripts and `pnpm install` fails. If a new dependency triggers `ERR_PNPM_IGNORED_BUILDS`, add it there rather than running `pnpm approve-builds` interactively.

## ssh2 / vendored OpenSSL

`ssh2`'s `vendored-openssl` Cargo feature is enabled so `cargo build` compiles its own OpenSSL instead of requiring a system install. First build is slow (compiles OpenSSL + libssh2 from source); needs `perl` on the build machine.
