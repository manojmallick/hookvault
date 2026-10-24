# HookVault

HookVault is a prototype webhook receiver with signature verification, idempotency checks, forwarding retries, and a dead-letter queue. It includes adapters for AWS Lambda, Cloudflare Workers, and Google Cloud Run.

## Run locally

Requirements: Node.js and pnpm.

```bash
pnpm install
pnpm dev
```

The local server listens on port `8080`. `.env.example` contains development-only placeholder values. Replace them before any deployment.

## Try the API

The development signing endpoint creates a signature for a sample payload:

```bash
SIG=$(curl -s -X POST http://localhost:8080/v1/dev/sign \
  -H 'content-type: application/json' \
  -d '{"hello":"world"}' | jq -r .signature)

curl -s -X POST http://localhost:8080/v1/hooks/demo \
  -H 'content-type: application/json' \
  -H "x-hookvault-signature: $SIG" \
  -H 'x-idempotency-key: demo-1' \
  -d '{"hello":"world"}'
```

Set `HOOKVAULT_FORWARD_URL` to test forwarding to a destination you control. See `.env.example` for the available settings.

## Build and checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Security limitations

This is a prototype. Event, idempotency, and dead-letter state are not backed by a shared durable store, so they do not provide production-grade persistence or multi-instance coordination. Review signature handling, access controls, retry behavior, and deployment configuration before using it with real webhook traffic. Use strong unique secrets and TLS. The `/v1/dev/sign` endpoint is intended only for local development and should not be exposed in production.

Cloud deployment workflows use manual dispatch and require correctly configured provider credentials.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). This source-available license restricts commercial use; it is not an OSI-approved open-source license. See the license for terms and exceptions. Third-party dependencies retain their own licenses.
