# Redmine Markdown+ — Chrome Extension

**Product & Technical Requirements Document** · Version 0.1 (draft) · 11 Nov 2026 · Prepared for Mhamed

---

## 1. Summary

Redmine instances configured with **Textile** force people to write issues in a syntax most developers no longer use. Developers think and write in **GitHub-flavored Markdown (GFM)**. **Redmine Markdown+** is a Chrome (Manifest V3) extension that lets users write and edit every Redmine text field in Markdown with a GitHub-quality editing experience, converts to Textile silently on save, and adds GitHub-style productivity features (autocomplete, templates, drafts, paste-to-upload, keyboard shortcuts, dark mode).

It works **per user, with no server changes and no admin rights**.

### Why an extension and not just switching Redmine to Markdown?

Redmine has a global *Text formatting* setting (Administration → Settings → Display) that can be switched to Markdown. That is not a good option for most teams, because it needs an admin and every existing issue, comment and wiki page written in Textile would render incorrectly. The extension avoids that migration entirely: stored data stays Textile, the author experience becomes Markdown. If the server is already Markdown, the extension skips conversion and only provides the editor and UX enhancements.

## 2. Goals and non-goals

### Goals

1. Write in Markdown anywhere Redmine has a text area (issue description, notes/comments, wiki, news, documents, forum messages, project description).
2. Zero data loss: what is saved to Redmine must render the same structure the author intended.
3. Feel like the GitHub comment box: toolbar, live preview, shortcuts, `@` and `#` autocomplete, paste images, task lists, saved replies, templates.
4. Make existing Textile content editable in Markdown, with a safe path back to the original.
5. Be fast, private (no network calls except to the user's own Redmine), and easy to roll out to a whole team.

### Non-goals (v1)

- Replacing Redmine's server-side rendering.
- Supporting non-Redmine sites.
- Real-time collaboration.
- Changing Redmine permissions, workflows or data models.
- Mobile browsers.

## 3. Users and key scenarios

| Persona | Pain today | Scenario |
| --- | --- | --- |
| Developer | Textile syntax is hard to remember (`bq.`, `h2.`, `"text":url`) | Writes a bug report in Markdown with a code block and a task list, pastes a screenshot, saves. |
| QA / support | Retypes the same bug structure every time | Picks the *Bug* template when creating a new issue; fields are pre-filled. |
| Tech lead / reviewer | Long threads are hard to read, comment boxes are weak | Uses saved replies, quote-reply, and gets colored status badges and sticky submit bar. |
| Bilingual team | Mixed Arabic/English text breaks alignment | Each paragraph aligns correctly (auto direction) in editor and preview. |
| Admin | Does not want to migrate data or install server plugins | Distributes the extension by policy, no server change. |

## 4. Background: how Redmine editing works (technical constraints)

- Redmine renders a plain `<textarea>` wrapped by its own **jsToolBar** (`.jstEditor`, `.jstElements`, `.jstTabs`). Preview posts the raw text to a preview endpoint (for example `/issues/preview`) and injects the server-rendered HTML.
- Forms submit in three ways: normal POST, Rails UJS/AJAX (`data-remote`, used for inline comment editing and some quick edits), and the "Preview" tab. The extension must intercept all of them.
- The active formatting (Textile vs Markdown) is detectable from the toolbar help link (`.jstHelp` link points to `wiki_syntax_textile` or `wiki_syntax_markdown`). A manual per-site override is required as fallback.
- Redmine versions in the wild range from 4.x to 7.x. DOM and endpoints differ slightly; the design must use a selector adapter layer, not hard-coded selectors in feature code.
- Textile treats a single newline as a line break; Markdown treats it as a space. This must be an explicit conversion option (see FR-C5).

## 5. Functional requirements

Priority: **P0** = MVP, **P1** = v1.0, **P2** = later.

### 5.1 Activation and detection

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-A1 | The extension does nothing on a site until the user enables it for that origin (self-hosted Redmine has arbitrary domains). Use `optional_host_permissions` plus dynamic content-script registration; show a one-click "Enable on this Redmine" prompt from the action button. | P0 |
| FR-A2 | Detect Redmine by DOM signals (`#content`, `body.controller-issues/wiki/...`, `#issue_description`, `.jstEditor`, meta/generator hints) and never activate on non-Redmine pages. | P0 |
| FR-A3 | Detect server formatting (Textile or Markdown) from the toolbar help link; allow manual override per origin. | P0 |
| FR-A4 | Support late-added fields: dynamically inserted editors (edit-comment forms, modals, tabbed forms) must be enhanced through a `MutationObserver`. | P0 |
| FR-A5 | Per-field and global toggle: a small switch next to the toolbar to disable the extension for the current field, reverting to the native editor with the text intact. | P0 |

### 5.2 Editor

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-E1 | Replace the visible editor with a Markdown editor (CodeMirror 6). The **original textarea stays in the DOM** and remains the source of truth for submission. | P0 |
| FR-E2 | GitHub-style toolbar: heading, bold, italic, strikethrough, quote, inline code, code block, link, bullet list, numbered list, task list, table, horizontal rule, mention, issue reference, emoji. | P0 |
| FR-E3 | Shortcuts: `Ctrl/Cmd+B`, `I`, `K` (link), `E` (inline code), `Shift+7/8` (lists), `Shift+.` (quote), `Ctrl+Enter` (submit), `Esc` (cancel/blur). | P0 |
| FR-E4 | List behaviour like GitHub: Enter continues the list or task list, Enter on an empty item ends it, Tab and Shift+Tab indent and outdent. | P0 |
| FR-E5 | Auto-pairing for backticks, brackets, quotes and `**`; wrapping of a selection when typing a pair. | P1 |
| FR-E6 | Smart paste: paste a URL over selected text creates `[text](url)`; paste an HTML table (Excel, Sheets, web) becomes a Markdown table; paste rich HTML becomes Markdown. Holding `Ctrl+Shift+V` pastes plain text. | P1 |
| FR-E7 | Slash commands (`/` at line start): table, code block, task list, collapse, TOC, template, saved reply. | P2 |
| FR-E8 | Bidirectional text: `dir="auto"` per paragraph in editor and preview so Arabic and English mix correctly. | P1 |
| FR-E9 | Resizable editor, monospace font option, line-wrap toggle, full-screen (zen) mode. | P1 |
| FR-E10 | Accessibility: full keyboard operation, ARIA labels on toolbar, visible focus, respects reduced motion. | P0 |

### 5.3 Conversion engine (Markdown ⇄ Textile) — the core

The converter is a standalone, framework-free TypeScript library with its own test suite. It parses Markdown to an AST (markdown-it, with GFM table and task-list support) and **serializes the AST to Textile** using Redmine's Textile dialect. Do not use regex-only conversion; it cannot handle nesting reliably.

#### Mapping (Markdown → Redmine Textile)

| Markdown | Redmine Textile | Notes |
| --- | --- | --- |
| `# H1` … `###### H6` | `h1.` … `h6.` | Blank line after |
| `**bold**` | `*bold*` |  |
| `*italic*` / `_italic_` | `_italic_` |  |
| `~~strike~~` | `<del>strike</del>` | Safer than `-x-` (hyphen ambiguity) |
| `` `code` `` | `@code@` | Content escaped if it contains `@` (use `<code>`) |
| Fenced block with language | `<pre><code class="php">…</code></pre>` | HTML-escape content; language used for CodeRay highlighting |
| `> quote` | `bq. quote` | Multi-paragraph: `<blockquote>…</blockquote>` |
| `- item` / nested | `* item` / `** item` |  |
| `1. item` / nested | `# item` / `## item` | Mixed nesting handled by serializer |
| `- [ ] todo` / `- [x] done` | `* [ ] todo` / `* [x] done` | No Textile equivalent; degrades to literal text (documented limitation, see 5.8 for checklist rendering) |
| `[text](url)` | `"text":url` | URLs with spaces or parentheses are encoded |
| `![alt](url)` | `!url(alt)!` | Redmine attachment names map to `!file.png!` |
| Table with header row | `\|_. A \|_. B \|` header + `\| a \| b \|` rows | Alignment markers mapped to `<`, `>`, `=` |
| `---` | `---` |  |
| Hard line break | `<br />` or newline per FR-C5 |  |
| Raw HTML | Passed through (Redmine sanitizes) |  |
| `:emoji:` shortcode | Unicode emoji | Redmine does not render shortcodes |

#### Redmine-native syntax that must be preserved untouched

`#123`, `##123`, `###123`, `r456` (revisions), `commit:abc123`, `@login` (user links), `[[Wiki Page]]`, `[[Page|Label]]`, `attachment:file.ext`, `version:"1.0"`, `project:name`, `{{toc}}`, `{{collapse(title) … }}`, `{{include(...)}}`, `{{thumbnail(...)}}`, other `{{macro}}` calls, `<notextile>`, `<pre>`, and `==escaped==` spans.

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-C1 | Convert Markdown → Textile on submit and on preview request, covering the full mapping table above. | P0 |
| FR-C2 | Protect Redmine-native syntax: tokenize and restore it around conversion so `*`, `_`, `-` inside links, macros and identifiers are never reinterpreted. | P0 |
| FR-C3 | Escape Textile-special characters appearing in normal Markdown text (for example stray `*`, `_`, `@`, `%`, `+`, `-`, `?`, leading `#` or `*` that are not list markers) with `==…==` or `<notextile>`. | P0 |
| FR-C4 | **Textile → Markdown** for editing existing content: parse Textile to HTML, then HTML → Markdown (turndown with custom rules). Content that cannot be converted losslessly is kept as an opaque, visibly marked block (for example a `<!-- textile:raw -->` fenced region) and emitted back verbatim. | P0 |
| FR-C5 | Option: *Line breaks* — "preserve (each newline = break, Textile-like)" or "Markdown (newline = space)". Default: preserve, to match what the author sees in the editor. | P0 |
| FR-C6 | **Untouched = unchanged**: if the user did not modify a field, the original stored Textile is submitted byte-for-byte. Conversion happens only when the content is dirty. | P0 |
| FR-C7 | Round-trip guarantee: for the supported syntax subset, `toMarkdown(toTextile(md))` is structurally equal to `md`. Enforced by property-based tests. | P0 |
| FR-C8 | "Edit as Textile" escape hatch per field: switch to the original text at any time; unsaved conversion is not lost. | P0 |
| FR-C9 | A conversion report (warnings panel) lists constructs that degrade (task lists, nested block quotes, HTML the sanitizer may strip). | P1 |
| FR-C10 | Conversion runs in a Web Worker for documents larger than \~20 KB so typing never blocks. | P1 |

### 5.4 Preview

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-P1 | **Write / Preview tabs** like GitHub. Preview is rendered by the **server**: send the converted Textile to Redmine's own preview endpoint so the result is exactly what will be saved (macros, issue links, code highlighting all correct). | P0 |
| FR-P2 | Optional instant local preview (markdown-it + DOMPurify) while typing, clearly labelled "approximate"; server preview is the reference. | P1 |
| FR-P3 | Side-by-side (split) mode on wide screens. | P2 |
| FR-P4 | Preview shows the converted Textile in a collapsible "Show Textile output" panel for debugging and trust. | P1 |

### 5.5 Autocomplete and references

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-R1 | `#` opens an issue picker (id and subject, recent first), inserting `#123`. Uses Redmine's own same-origin autocomplete/JSON endpoints with the user's session; endpoints verified per Redmine version in a spike. | P1 |
| FR-R2 | `@` opens a user picker limited to project members (fallback: scrape assignee/watcher dropdown options already on the page), inserting `@login`. | P1 |
| FR-R3 | `[[` opens wiki page picker for the current project. | P2 |
| FR-R4 | `:` opens an emoji picker; selection inserts Unicode. | P1 |
| FR-R5 | Hover card on rendered `#123` links showing subject, status, assignee (cached for 5 minutes). | P2 |
| FR-R6 | All lookups are same-origin, cached, debounced (≥150 ms) and cancelled when stale. | P1 |

### 5.6 Attachments and paste

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-U1 | Paste or drag-and-drop an image: upload through Redmine's own attachment mechanism (same-origin upload, token returned), attach it to the form, and insert `![](filename.png)` which converts to `!filename.png!`. | P0 |
| FR-U2 | Non-image files: upload and insert `[file.pdf](attachment:file.pdf)` (converted to `attachment:file.pdf`). | P1 |
| FR-U3 | Show upload progress and error state inline; respect Redmine's max attachment size setting. | P1 |
| FR-U4 | Screenshot name normalisation (for example `Screenshot 2026-11-11 at 10.15.png` → `screenshot-20261111-1015.png`) to avoid unicode or space issues. | P2 |

### 5.7 Drafts, safety and recovery

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-S1 | Autosave draft per field (keyed by origin, path and field) every few seconds to `chrome.storage.local`; "Restore draft?" banner when a non-empty draft exists; cleared on successful submit. | P0 |
| FR-S2 | Before converting and overwriting, always keep the original Textile in memory and in the draft history (last 10 versions per field). | P0 |
| FR-S3 | Warn on navigating away with unsaved changes (Redmine does not by default). | P1 |
| FR-S4 | If conversion throws, fall back to submitting the raw text unchanged and show a clear, dismissible error. Never block saving. | P0 |
| FR-S5 | Undo/redo history survives switching Write ↔ Preview. | P0 |

### 5.8 GitHub-style page enhancements (optional modules, each toggleable)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-G1 | **Quote reply** improved: select text in a comment, press `r` (or click the floating button) to insert it as a Markdown quote in the notes box. | P1 |
| FR-G2 | Sticky comment box / submit bar on long issues; "Ctrl+Enter to submit" hint. | P1 |
| FR-G3 | Colored badges for status, priority and tracker (user-configurable color map by name). | P1 |
| FR-G4 | Dark mode (follows OS, with manual override) and a readable monospace/code style similar to GitHub. | P1 |
| FR-G5 | Relative timestamps ("3 hours ago") with absolute time on hover. | P2 |
| FR-G6 | Collapse long comments ("Show more") and a "jump to latest comment" button. | P2 |
| FR-G7 | **Copy helpers** on the issue page: copy `#123`, copy link, copy a branch name (`feature/123-short-subject`, pattern configurable), copy commit prefix (` refs #123  `). | P1 |
| FR-G8 | Render `- [ ]` / `- [x]` as real checkboxes in displayed content, with a progress indicator ("3 of 5"); clicking edits the source (requires edit permission). | P2 |
| FR-G9 | Keyboard navigation like GitHub: `c` create issue, `/` focus search, `e` edit, `g i` go to issues, `?` show help. Must not trigger while typing. | P2 |
| FR-G10 | Syntax highlighting for code blocks lacking a language, using a bundled highlighter (no CDN). | P2 |

### 5.9 Templates and saved replies

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-T1 | **Issue templates** per tracker (Bug, Feature, Support, custom), authored in Markdown in the options page. Applied automatically to an empty description when the tracker changes, with a confirm if text exists. | P1 |
| FR-T2 | **Saved replies**: named snippets inserted from a toolbar menu or slash command; supports variables (`{{issue.id}}`, `{{issue.subject}}`, `{{user.name}}`, `{{date}}`). | P1 |
| FR-T3 | Import/export templates and replies as JSON so a team can share a standard set; optional sync via `chrome.storage.sync`. | P1 |
| FR-T4 | Starter set: Bug report, Feature request, Release note entry, Code-review checklist, "Need more info" reply. | P1 |

### 5.10 Settings (options page)

- Enabled origins list; per-origin formatting override (Textile / Markdown / auto).
- Line-break mode, editor font and size, theme, RTL behaviour.
- Module toggles (autocomplete, drafts, badges, shortcuts, dark mode).
- Template and saved-reply manager; branch-name pattern; badge colors.
- Export/import all settings; "Reset to defaults"; diagnostics page (detected Redmine version, formatting, matched selectors, last conversion warnings).

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Compatibility | Chrome and Edge (Chromium) current and previous major; Manifest V3. Redmine 4.2 → latest 7.x. Firefox as a later port using the WebExtension API (keep browser APIs behind a thin wrapper). |
| Performance | Content-script init under 50 ms on page load (lazy-load CodeMirror and the converter only when an editable field is present); typing latency under 16 ms; conversion of 20 KB under 100 ms; bundle under 500 KB gzipped. |
| Reliability | Never lose user text; every failure path falls back to the native textarea and raw submit (FR-S4). |
| Privacy | No telemetry, no analytics, no remote code, no third-party requests. All data stays in the browser and the user's own Redmine. State this in the store listing and README. |
| Security | Strict MV3 CSP (no `eval`, no inline script); sanitize any HTML we render (DOMPurify); never read or store the Redmine API key or CSRF token beyond forwarding it on same-origin requests the page itself would make; least-privilege permissions (`storage`, `scripting`, `activeTab`, optional host permissions only). |
| Accessibility | WCAG 2.1 AA for all injected UI. |
| i18n | English and Arabic UI (RTL layout) from day one using `chrome.i18n`. |
| Maintainability | TypeScript strict; selector adapters per Redmine version; feature modules independent and individually disable-able. |
| Observability | Local-only debug log (toggle) and a "Copy diagnostics" button for bug reports. |

## 7. Architecture and tech stack

```
extension/
  manifest.json                  (MV3)
  src/
    background/service-worker.ts (registers content scripts per enabled origin, settings, messaging)
    content/
      detect.ts                  (is Redmine? version? formatting?)
      adapters/redmine-4.ts … redmine-7.ts   (selectors, endpoints)
      field-manager.ts           (finds fields, MutationObserver, lifecycle)
      editor/                    (CodeMirror 6 setup, toolbar, shortcuts, smart paste)
      submit-hook.ts             (form submit, UJS ajax, preview interception)
      modules/                   (autocomplete, uploads, drafts, badges, copy-helpers, dark-mode)
    converter/                   (pure library, no DOM: md->textile, textile->md, protect/restore)
    options/                     (settings UI)
    shared/                      (storage, i18n, logging)
  tests/ (unit, fixtures, e2e)
```

**Key design decisions**

1. **Textarea stays authoritative.** On every change, write the converted Textile into the hidden original textarea and dispatch `input`/`change`. Redmine's own scripts (preview, validation, quick-edit) keep working unchanged.
2. **Capture-phase submit hook** on the form, plus patching of the AJAX submit path, so the final conversion always runs last.
3. **Isolated content-script world**, communicating with the page only through the DOM; no page-world script injection unless a spike proves it necessary.
4. **Converter as a separate npm package** (usable in a CLI or a Redmine plugin later).

**Suggested stack:** TypeScript, Vite with WXT or CRXJS, CodeMirror 6, markdown-it (+ GFM plugins), turndown, a Textile parser (for example textile-js) for the reverse direction, DOMPurify, Vitest, Playwright.

## 8. Testing strategy

1. **Converter golden tests:** a fixtures folder of paired `.md` and `.textile` files covering every row of the mapping table, nesting, Arabic text, escapes and macros.
2. **Property-based round-trip tests** (fast-check): random Markdown AST → Textile → Markdown must be structurally stable.
3. **Real-server verification:** a Docker Compose setup with Redmine 5.1, 6.0 and 7.0 (Textile mode); a script renders each fixture through the real preview endpoint and compares the HTML against the HTML of the equivalent native Textile.
4. **E2E (Playwright, Chromium with the extension loaded):** create issue, edit issue, edit comment, wiki edit, paste image, template apply, draft restore, extension-disabled fallback.
5. **Corpus test:** run Textile → Markdown → Textile over an exported sample of real (anonymized) issues from the team's Redmine; report lossy cases and drive converter fixes.
6. **Manual a11y pass** (keyboard only, screen reader).

## 9. Release plan

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 – Spike (1 week)** | Verify DOM selectors, preview/upload/autocomplete endpoints and submit paths on target Redmine versions; prototype converter on 50 real issues | Spike report; go/no-go |
| **1 – MVP (3–4 weeks)** | All **P0**: activation, CodeMirror editor, toolbar, MD→Textile and Textile→MD, server preview, image paste, drafts, safe fallback | Team of 5 uses it daily for two weeks with zero data-loss reports |
| **2 – v1.0 (3–4 weeks)** | **P1**: autocomplete, templates, saved replies, smart paste, quote reply, badges, dark mode, copy helpers, Arabic UI, options page | Chrome Web Store (or private) release; docs and GIF demos |
| **3 – v1.x** | **P2**: slash commands, checkbox rendering, hover cards, split preview, Firefox | Based on usage feedback |

**Distribution:** private team rollout first (Chrome enterprise policy `ExtensionInstallForcelist` or a self-hosted update URL), then public Chrome Web Store listing. Open-source on GitHub (MIT) with a clear README, a CONTRIBUTING guide and issue templates to attract contributors.

## 10. Success metrics

- 0 reports of lost or corrupted content (hard requirement).
- ≥ 95 % of sampled real issues convert Textile → Markdown → Textile with no structural diff.
- ≥ 80 % of team members keep the extension enabled after 30 days.
- Median time to write a bug report drops measurably (self-reported survey, target −30 %).
- Chrome Web Store rating ≥ 4.5 after the first 100 installs (public phase).

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Textile ⇄ Markdown is not 1:1 (task lists, nested quotes, some tables) | Silent formatting loss | FR-C6 untouched = unchanged; FR-C8 escape hatch; FR-C9 warnings; server preview as reference |
| Redmine DOM/endpoints differ across versions or themes/plugins | Extension breaks | Adapter layer, diagnostics page, version matrix in CI, fallback to native editor |
| Redmine upgrades change submit/preview flow | Broken saves | E2E suite against 3 versions; FR-S4 always-save fallback |
| Custom plugins (for example Agile, Checklists) add their own editors | Conflicts | Per-field opt-out, selector allow/deny lists in options |
| Chrome Web Store review of broad host access | Delayed publication | Optional host permissions requested per origin, clear privacy statement |
| Users distrust "magic" conversion | Low adoption | "Show Textile output" panel (FR-P4), draft history, easy disable |

## 12. Open questions

1. Which Redmine version(s) does the team run, and is Textile the server-wide default?
2. Are there Redmine plugins in use that replace or extend editors (checklists, agile boards, WYSIWYG)?
3. Is the REST API enabled, or must everything rely on session-authenticated same-origin requests?
4. Preferred behaviour for single newlines (keep Textile-like breaks vs strict Markdown)?
5. Do we want public distribution from the start, or private first?
6. Branch-name convention for the copy helper (for example `feature/<id>-<slug>`, `bugfix/<id>-<slug>`)?
7. Which saved replies and templates does the team want shipped by default?

## 13. Appendix A — DOM hooks to verify in the spike

| Purpose | Likely hook (verify per version) |
| --- | --- |
| Issue description | `#issue_description` |
| Issue comment / notes | `#issue_notes`, `#journal-N-notes` (inline edit) |
| Wiki body | `#content_text` |
| Toolbar container | `.jstEditor`, `.jstElements`, `.jstTabs` |
| Formatting detection | `.jstHelp` link (`wiki_syntax_textile` vs `wiki_syntax_markdown`) |
| Preview area | `#preview_*`, `.wiki` |
| Tracker / status / priority selects | `#issue_tracker_id`, `#issue_status_id`, `#issue_priority_id` |
| Assignee options (mention fallback) | `#issue_assigned_to_id option` |
| Attachment form | `.attachments_form`, `#attachments_fields` |

## 14. Appendix B — Default keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + B` / `I` / `E` / `K` | Bold / Italic / Inline code / Link |
| `Ctrl/Cmd + Shift + 7` / `8` | Numbered / Bulleted list |
| `Ctrl/Cmd + Shift + .` | Quote |
| `Ctrl/Cmd + Enter` | Submit |
| `Tab` / `Shift + Tab` | Indent / outdent list item |
| `#` / `@` / `:` | Issue / user / emoji autocomplete |
| `Ctrl/Cmd + Shift + V` | Paste as plain text |
| `r` (with text selected on the page) | Quote reply |
| `?` | Show shortcut help |