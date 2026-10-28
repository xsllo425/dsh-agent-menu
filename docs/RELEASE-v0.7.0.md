# dsh-agent-menu v0.7.0

A restrained, theme-aware context menu for DeepSeek Harness, with real directory operations in the native workspace and session menus.

## Changes

- Keep conversation menus focused: copy selections and code; handle links, files, images, and basic composer editing.
- Remove obsolete AI actions and redundant file/image URL and filename entries.
- Restore **Copy code** for unselected code blocks.
- Add **Copy working directory** and **Reveal in file manager** to native session menus through the official DSH slot.
- Add **New session**, **Copy working directory**, and **Reveal in file manager** to native workspace menus, using DSH's own cwd snapshots and New session button.
- Preserve native Pin, Rename, Fork, Archive, Copy session ID, and workspace Rename/Delete. No fabricated session deletion, workspace pinning, unread state, bulk actions, or single-letter shortcuts.
- Use theme tokens, 12px menu cards, 6px menu items, subtle separators, and lighter shadows.
- Update English/Chinese documentation and package metadata; replace obsolete smoke tests and add sidebar action regression coverage.

## Verification

Passed:

- Syntax checks for host and client modules
- Menu scope and exact menu item regression tests
- Sidebar native action/slot tests
- Native menu fallback and plugin coexistence tests
- 24 status phrase tests
- Host image-byte route tests with 1×1 PNG clipboard read-back
- `git diff --check` and `npm pack --dry-run`

Actual browser acceptance remains pending: the browser session stopped at DSH access verification, so no claim of completed live UI verification is made. No DSH restart or plugin enable/disable was performed.
