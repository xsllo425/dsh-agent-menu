# dsh-agent-menu

[简体中文](./README.md) · **English**

> Only the items that belong there: copy, reveal, open with the default app.

[![ci](https://github.com/xsllo425/dsh-agent-menu/actions/workflows/ci.yml/badge.svg)](https://github.com/xsllo425/dsh-agent-menu/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)
[![DeepSeek Harness plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4d6bfe.svg)](https://github.com/topics/dsh-plugin)

A restrained right-click menu for the DeepSeek Harness Web UI. It provides clipboard, file and native desktop actions without quoting content into the composer, sending AI messages or applying prompt templates.

## Menus

| Right-click target | Actions |
| --- | --- |
| Conversation selection | Copy; append link/file actions when applicable |
| Link | Copy URL / Copy as Markdown link / Open in browser |
| File path | Copy path / Reveal in file manager / Open with default app |
| Code block, no selection | Copy code |
| Conversation image | Copy image / Save as…; local images also support Reveal / Open |
| Composer | Standard Cut / Copy / Paste / Undo / Redo / Select all actions |
| Composer image | Image actions and Remove from composer |
| Workspace row | Native Rename/Delete, plus New session / Copy directory / Reveal |
| Session row | Native pin/rename/fork/archive/copy-session-ID, plus Copy directory / Reveal |
| Anything else | Leave the native menu alone |

- Workspace paths come from the official `workspaces.list` snapshot. Session paths come from that session's `cwd`; paths are never guessed.
- **No session Delete action is offered.** DSH exposes no public session-deletion API, and Archive is not Delete. Workspace deletion remains the official dialog, which moves its sessions to Ungrouped.
- Session additions use the official `sidebar.workspaces.session.menu.item` slot and native `MenuItemButton`. Workspace menus have no corresponding slot, so additions are made only after identifying the actual native workspace menu. New session invokes the existing native row button.
- Relative file operations are hidden when no authoritative session directory is available. `blob:` / `data:` images use host byte routes rather than invented local paths.
- Custom menus follow the active theme, with a 12px card radius, 6px item radius, subtle separators and a light shadow. Native sidebar menus keep DSH's own styling.

## Install

```bash
dsh plugin --profile desktop add github:xsllo425/dsh-agent-menu
```

From a local checkout or tarball, use `dsh plugin --profile desktop add <this directory or tarball>`. Use your actual profile. Restart DSH after installing or changing host code.

## Coexistence and failure behavior

- **dsh-file-menu**: take over its menu only when this plugin has applicable items; otherwise leave it alone.
- **dsh-round-rightclick**: yield while its overlay is present.
- **dsh-session-deck**: stop later sidebar context-menu handlers before invoking the native row button.
- Build menu items synchronously before `preventDefault()`. Empty results, stale generations and errors all release the native menu instead of leaving a silent right-click.

## Development checks

```bash
node --test tests/*.test.mjs          # 35 tests, no dependencies
node scripts/check-manifest.mjs       # manifest, exports, icon, docs
```

`npm run verify` runs the syntax checks, all tests and the manifest self-check in one go.

These cover DOM/service stubs, native slot registrations and host routes. `tests/image-bytes.test.mjs` writes and reads the real system clipboard (Windows only; skipped elsewhere). They do not replace browser acceptance in a live DSH UI. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for implementation boundaries, [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.

## License

MIT; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
