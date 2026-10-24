# src/logic — HookVault

Self-hosted webhook vault: **verify · dedupe · forward · retry · DLQ · replay**.

| Module | Role |
|--------|------|
| `app.ts` | Hono routes (shared across clouds) |
| `verify.ts` | HMAC signatures (raw / GitHub / Stripe-style) |
| `store.ts` | In-memory event log + dedupe (swap for Redis/KV) |
| `forward.ts` | Upstream POST with retries |
| `config.ts` | Env config |

## Env

```
HOOKVAULT_SECRET=dev-webhook-secret
HOOKVAULT_ADMIN_TOKEN=dev-admin-token
HOOKVAULT_FORWARD_URL=https://your-app.example/webhooks/in
HOOKVAULT_REQUIRE_SIGNATURE=false
HOOKVAULT_MAX_ATTEMPTS=3
```

## Wedge

Hookdeck/Svix proved willingness to pay; they're hosted + enterprise-priced.
HookVault deploys to **your** Lambda/Workers/Cloud Run — 5–10× cheaper control plane.
