# GST Verification Integration

Company creation (`create-user.js company-admin ...`) is designed to support GST verification APIs.

## Behavior

- Always performs **local GSTIN format validation**.
- Remote verification is **optional** and controlled by env vars.
- When remote verification is disabled, company creation continues (format validation only).
- You can enforce verification by setting `GST_VERIFY_REQUIRED=true`.

## Environment variables

- `GST_VERIFY_ENABLED` (default: `false`): enable remote verification.
- `GST_VERIFY_REQUIRED` (default: `false`): fail company creation if verification is not successful.
- `GST_VERIFY_URL`: verification endpoint URL template. Supported placeholders:
  - `{{GSTIN}}`, `{GSTIN}`, `:gstin`
- `GST_VERIFY_TOKEN`: optional bearer token used as `Authorization: Bearer <token>`.
- `GST_VERIFY_HEADERS_JSON`: optional JSON string of extra headers (merged into request headers).
- `GST_VERIFY_PROVIDER`: optional provider label stored in `User.gstVerification.provider`.

## Example

```bash
set GST_VERIFY_ENABLED=true
set GST_VERIFY_REQUIRED=true
set GST_VERIFY_URL=https://example.com/api/gstin/{{GSTIN}}/verify
set GST_VERIFY_TOKEN=YOUR_TOKEN
```

