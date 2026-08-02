# Migration Guides

Guides for upgrading **mtc** across breaking changes introduced by the
improvement plan.

---

## 1. License Key Format Migration (Breaking)

### What Changed

License keys were redesigned from a simple format to a **canonical signed
format**:

```
MTC-<tier>-<base64url(payload)>-<hmac>
```

- `tier` — `community`, `enterprise`, or `enterprise-plus`
- `base64url(payload)` — the payload `{ tier, organization, expiresAt, maxSeats }`
- `hmac` — `HMAC-SHA256` of the payload, hex-encoded

### What You Must Do

1. **Set `MTC_LICENSE_SECRET`** in your environment. It is required both to
   *generate* and to *verify* keys. Without it:
   - `mtc enterprise generate` warns that generated keys cannot be verified
   - Activation fails closed with "MTC_LICENSE_SECRET not set"
2. **Regenerate all existing keys** with the new format:

```bash
export MTC_LICENSE_SECRET=<your-signing-secret>
mtc enterprise generate -t enterprise -o "Your Org" --expires 2027-01-01 --seats 25
```

3. **Re-activate** on each client with the new key:
   `mtc enterprise activate <new-key>`

### Rollback

Old-format keys are rejected at parse time. There is no automatic migration —
regenerate and re-activate.

---

## 2. SSO Configuration Updates

### What Changed

- SSO now uses a **public-client device-code flow**.
- `MTC_AZURE_CLIENT_SECRET` is now **optional** for interactive logins.
- Auth tokens are written with `0600` file permissions.
- The `@metateammyanmar.com` domain check is enforced exactly.

### What You Must Do

1. Keep `MTC_AZURE_CLIENT_ID` and `MTC_AZURE_TENANT_ID` set.
2. `MTC_AZURE_CLIENT_SECRET` is optional — remove it if you were only using it
   for interactive device flow (confidential-client flows still need it).
3. No token migration is needed; existing sessions continue to work.

---

## 3. Custom Agent Permission Changes

### What Changed

- Custom agents (`custom.ts`) tighten permission defaults: `bash` permissions
  default to `deny` unless explicitly set to `allow`.
- MCP tools are **namespaced** as `<server>/<tool>` (e.g. `figma/list_components`).

### What You Must Do

1. Review `.mtc/agents/*.md` for any agent relying on implicit bash access.
   Set `permissions.bash = allow` explicitly where needed.
2. Update `/call` invocations to use the full `server/tool` name.

---

## 4. Telemetry Default Change

### What Changed

Telemetry is now **opt-in** and disabled by default (previously it defaulted
to enabled).

### What You Must Do

If you want usage analytics, enable them explicitly:

```bash
mtc analytics enable
```

`mtc analytics disable` turns them off at any time. See
[Privacy Policy](./privacy-policy.md).
