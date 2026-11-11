# MarkMine

MarkMine is a Chrome/Edge Manifest V3 extension for Redmine that lets users write Markdown while keeping Redmine's existing Textile storage and rendering flow intact.

The extension is opt-in per Redmine origin. It does not require a Redmine plugin, admin access, an API key, telemetry, or any third-party service.

## What works

- Per-site activation with optional host permissions and dynamic content-script registration.
- Redmine detection and Textile/Markdown format detection with a per-origin override.
- CodeMirror 6 Markdown editor while keeping Redmine's original textarea as the submission source of truth.
- GitHub-style formatting toolbar and keyboard shortcuts.
- Markdown -> Redmine Textile conversion for headings, emphasis, strike, inline/fenced code, block quotes, nested lists, task markers, links, images, tables, rules, line breaks and raw HTML.
- Textile -> Markdown editing through `textile-js` + Turndown.
- Protection for Redmine-native references, wiki links, macros, attachments and escaped blocks.
- Untouched fields remain byte-for-byte unchanged.
- Conversion failure never blocks saving; raw editor text is preserved as a last-resort fallback.
- Native Textile escape hatch per field.
- Dynamic editors through `MutationObserver`.
- Redmine-native preview trigger integration.
- Image/file paste and drag/drop through Redmine's existing attachment input.
- Local draft history with restore/discard flow.
- Issue/user/wiki/emoji autocomplete and slash commands where Redmine/page data is available.
- Templates and saved replies with issue/user/date variables.
- Automatic tracker templates.
- Quote reply, copy helpers, relative timestamps, badges, long-comment collapse, task-list rendering, hover details and page shortcuts.
- Dark mode, RTL/LTR controls, line wrapping and editor font settings.
- Import/export settings and local diagnostics logging.
- English/Arabic extension metadata.

## Packaging

Build a ready-to-install ZIP locally:

```bash
npm install
npm run package
```

The package is written to:

```text
packages/markmine-<version>.zip
```

The ZIP contains the extension files at its root, including `manifest.json`, so it can be extracted and loaded directly as an unpacked Chrome/Edge extension.

Every push to `main` also uploads the versioned ZIP as the **markmine-extension** GitHub Actions artifact.

You can also create the package manually from GitHub without editing or committing any file:

1. Open **Actions**.
2. Open **Release Extension**.
3. Choose **Run workflow**.
4. Leave **Create/update the GitHub Release** enabled to publish the ZIP under the version from `manifest.json`, or disable it to generate an Actions artifact only.

For example, version `0.1.0` produces `markmine-0.1.0.zip` and, when publishing is enabled, release/tag `v0.1.0`.

Pushing a tag that matches the manifest version, for example `v0.1.0`, still publishes the release automatically.

Keep `manifest.json` and `package.json` versions identical. Packaging fails if they differ. A manual release also refuses to move an existing version tag to a different commit; bump both version files before publishing the next release.

## Development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run check
```

`npm run build` writes the unpacked extension to `dist/`.

Load it in Chrome/Edge:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `dist/`.
4. Open a Redmine site and click MarkMine.
5. Choose **Enable on this Redmine**.

## Safety model

The original Redmine `<textarea>` remains in the DOM. MarkMine does not rewrite its initial value. Once the user edits Markdown, MarkMine mirrors the converted value into that textarea so Redmine's normal form submission and preview behavior continue to work.

Drafts and settings are stored in `chrome.storage.local`. MarkMine makes no third-party network requests; feature lookups use same-origin Redmine endpoints and degrade cleanly when a REST endpoint is unavailable.

## Project layout

```text
src/background/       MV3 service worker and per-origin registration
src/content/          Redmine detection, field lifecycle, editor integration, UX modules
src/content/editor/   CodeMirror setup and toolbar
src/converter/        Markdown <-> Textile conversion and syntax protection
src/shared/           Settings, types and logging
styles/               Injected/editor, popup and options styles
_locales/             Chrome i18n metadata
tests/                Converter and preservation tests
scripts/build.mjs      Deterministic esbuild bundling
```

See [Redmine Markdown+ — Chrome Extension.md](./Redmine%20Markdown%2B%20%E2%80%94%20Chrome%20Extension.md) for the product and technical requirements.

## Known compatibility boundary

Redmine themes and plugins can change editor DOM and private autocomplete/upload behavior. MarkMine deliberately falls back to the native textarea or native attachment UI instead of guessing when a supported hook is not present. Server preview remains the reference for final rendering.

## License

MIT 
