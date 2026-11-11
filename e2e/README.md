# Redmine E2E

The extension E2E suite needs a real Redmine origin because preview, uploads, inline editing, permissions and plugin/theme DOM differences are server behaviors.

Set these variables before adding/running environment-specific scenarios:

- `REDMINE_BASE_URL`
- `REDMINE_USERNAME`
- `REDMINE_PASSWORD`

The unit suite intentionally keeps server-specific assumptions out of the converter and content lifecycle tests. CI builds the unpacked extension as an artifact so it can be loaded by a Redmine matrix job or local Playwright project.
