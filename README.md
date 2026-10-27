# dsh-agent-menu

An **agent-grade right-click menu** for the DeepSeek Harness (DSH) Web UI — interaction design
referenced from Codex, WorkBuddy and MiniMax.

Right-click a selection, a hyperlink, a file chip, a code block or an image to **quote it into the
composer**, **send it to the AI as your own message**, or fire a prompt template (explain / translate /
summarize / continue / code refactor & tests). 0.2.0 also brought the native bits in-house — system
clipboard, reveal-in-explorer and open-with-default-app — and 0.3.0 added image copy / save-as, a
code-block branch, a proper three-state composer menu and a whitelist gate that never swallows the
browser's own menu. It needs no other context-menu plugin.

See the [简体中文文档](README.zh.md) for the full feature table, coexistence rules and internals.

## What it does

The menu is chosen by **what you right-clicked**. Anything outside the whitelist is left alone —
the browser's native menu still opens.

| Right-clicked | Menu |
|---|---|
| A selection | Quote into composer · Send to AI · Explain · Translate (auto direction) · Summarize · Continue · (in code) Refactor · Generate unit tests · Copy |
| A selection that is a file path | …plus Copy path · Reveal in file manager · Open with default app |
| A selection inside a hyperlink | …plus Copy link address · Open in browser · Copy as Markdown link |
| A hyperlink | Copy link address · Open in browser · Copy as Markdown link · (when the text is worth asking about) Quote this paragraph · Ask AI to explain |
| A file chip / tool-row file link | Copy path · Reveal in file manager · Open with default app · Copy relative path · Copy as local file link · Copy file name |
| A code block | Copy code · **Copy as code block** (with a ```lang fence) · (when tagged) Copy without the language tag · Quote code · Explain this code · Refactor this code · Generate unit tests |
| An image in the conversation | **Copy image** · Copy image address · (local files) Reveal in file manager · Open with default app · **Save image as…** |
| The composer, empty | Paste · Undo · Redo · Select all |
| The composer, with a selection | Cut · Copy · Paste · Undo · Redo · Select all — deliberately **no** AI items, the text has not been sent yet |
| An image inside the composer | Copy image · Copy address · (local) Reveal / Open with / Save as · **Remove from composer** |
| The left workspace / session tree | **Triggers DSH's own native menu** — identical to clicking the row's ⋮ button (pin / rename / fork / archive / delete, with shortcuts and the red danger colour) |
| Anything else (blank space, toolbars…) | **Not intercepted** |

- **Quote into composer** appends to your existing draft — it never overwrites what you typed.
- **Send to AI** goes through the same official channel as dsh-suggest-actions
  (`conversation.input.shell(sessionId).actions` `setDraft` + `submit`), not simulated keystrokes.
- **Path detection** handles the hard case: DSH shows workspace files by *relative* path, and the
  tool-row file button has neither `title` nor `data-path` — the path only lives in the text. So the
  detector checks six attributes, any `dataset` key matching `/path/i`, and code/path text, then joins
  the candidate onto the current session's workspace root.
- **Image detection needs no guessing**: DSH mounts every session asset on one authenticated route,
  `GET /api/file?path=<absolute path>`, so a local image's path is decoded straight out of the
  `<img>` src. When it can't be decoded (remote URL, `data:`) the local-only items are **hidden**
  rather than shown and wrong.
- **Native actions** go through the host half (`lib/index.js`): the system clipboard prefers the
  Electron main process and falls back to PowerShell `Set-Clipboard`; copying an *image* needs
  `nativeImage` + `clipboard.writeImage` in the main process (the render side can't — `/api/file` is
  authenticated and `ClipboardItem` requires same-origin); *save as* uses the Electron save dialog and
  **copies rather than moves** (the original must stay in the conversation); reveal uses
  `explorer.exe /select,` with `windowsVerbatimArguments` on Windows (without it Explorer ignores the
  switch and opens the wrong folder — see the development notes).
- With no active session the menu drops the Agent items instead of offering an action that must fail.

## Not covered

- **The left workspace / session tree does not get its own menu** — a right-click there triggers
  DSH's own native menu by clicking the row's ⋮ button. The menu items, icons, shortcuts and the red
  danger colour are all rendered by the official component (`@deepseek-ai/dsh-client-ui-workspace`),
  so nothing is duplicated and nothing drifts when the official UI changes. The cost is that the menu
  opens next to the button rather than at the pointer. If the official DOM changes so far that the
  button cannot be found, the browser's own menu is allowed through as a fallback.
- The image lightbox (the expanded overlay) — only un-expanded images in the conversation get a menu.

## Install

```sh
dsh plugin --profile desktop add <this directory or tarball>
```

Use the profile you actually run (the desktop build is `desktop`, the web client is `web`).
Restart DSH to load it.

## Coexistence

Multiple context-menu plugins can be installed at once:

- **dsh-file-menu** — if it shows a menu for the same right-click, this plugin takes over whenever it
  also has items (0.3.0's menu is a superset). Otherwise it lets file-menu's menu stay.
- **dsh-round-rightclick** (the disc menu) — this plugin always yields when its overlay is up.

This plugin is fully standalone; in fact replacing those two was the point from 0.2.0 on.

## License

MIT


## 0.4.0: random status-line phrases (extracted from dsh-status-rotator)

The "running" row is rewritten with a random phrase picked per phase (`thinking` 0–15 s → `running` 15–60 s → `long` ≥60 s), rotating every 10 s with a shuffle bag. The bundled library (`lib/status-phrases.json`, 14 packs, ~1,210 phrases) is on by default except the community / star / ads packs. Override or disable with `~/.dsh/agent-menu/status-phrases.json` (`enabled`, `enabledPacks`, `rotateMs`, `longAfterMs`, `packs`). On any failure the host text is kept. Tests: `node tests/status-phrases.mjs`.
