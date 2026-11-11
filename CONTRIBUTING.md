# Contributing to MarkMine

## Development

```bash
npm install
npm run check
```

Keep changes focused. MarkMine's primary invariant is that editing assistance must never silently destroy or reinterpret Redmine content.

For converter changes, add a fixture or unit test that demonstrates both directions when applicable. For Redmine DOM changes, document the Redmine version/theme/plugin that required the selector change.

## Pull requests

- Explain the user-visible behavior.
- Include tests for conversion or safety changes.
- Do not add telemetry, remote code, or third-party network requests.
- Keep Redmine-specific DOM/endpoints behind the content adapter layer.
- Preserve native-editor fallback behavior.
