import { Hono } from "hono";
import { globalConfig, getEndpoint } from "./config.js";
import { forwardWithRetries } from "./forward.js";
import { store } from "./store.js";
import { newId, nowIso, type HookEvent } from "./types.js";
import { signBody, verifySignature } from "./verify.js";

// Shared across AWS Lambda, Cloudflare Workers, GCP Cloud Run, and local dev.
export const app = new Hono();

app.get("/", (c) =>
  c.json({
    name: "HookVault",
    tagline: "Self-hosted webhook ingress: verify · dedupe · retry · DLQ · replay",
    docs: {
      ingest: "POST /v1/hooks/:endpointId",
      events: "GET /v1/events  (Authorization: Bearer <admin>)",
      replay: "POST /v1/events/:id/replay",
      dlq: "GET /v1/dlq",
      sign_help: "HMAC-SHA256 hex of body → header x-hookvault-signature",
    },
    pricingThesis: "OSS + $15–49/mo hosted control plane vs enterprise Hookdeck/Svix",
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", stats: store.stats(), time: nowIso() }),
);

/** Public ingest */
app.post("/v1/hooks/:endpointId", async (c) => {
  const endpointId = c.req.param("endpointId");
  const endpoint = getEndpoint(endpointId);
  const cfg = globalConfig();
  const body = await c.req.text();
  const contentType = c.req.header("content-type") || "application/json";

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  const sigHeaderName = (
    endpoint.signatureHeader || "x-hookvault-signature"
  ).toLowerCase();
  const signatureHeader = headers[sigHeaderName];

  let signatureValid: boolean | null = null;
  if (endpoint.secret && signatureHeader) {
    const result = verifySignature({
      body,
      signatureHeader,
      secret: endpoint.secret,
    });
    signatureValid = result.ok;
    if (!result.ok && cfg.requireSignature) {
      return c.json(
        { error: "invalid_signature", reason: result.reason },
        401,
      );
    }
  } else if (cfg.requireSignature) {
    return c.json({ error: "signature_required" }, 401);
  }

  const dedupeHeader = (endpoint.dedupeHeader || "x-idempotency-key").toLowerCase();
  const dedupeKey = headers[dedupeHeader] || null;

  const event: HookEvent = {
    id: newId("evt"),
    endpointId,
    receivedAt: nowIso(),
    headers: pickHeaders(headers),
    body,
    contentType,
    signatureValid,
    dedupeKey,
    status: "received",
    attempts: [],
  };

  const { event: stored, duplicate } = store.put(event);
  if (duplicate) {
    return c.json(
      {
        ok: true,
        duplicate: true,
        eventId: stored.id,
        status: stored.status,
      },
      200,
    );
  }

  const forwardUrl = endpoint.forwardUrl || cfg.defaultForwardUrl;
  if (forwardUrl) {
    const updated = await forwardWithRetries(
      stored,
      forwardUrl,
      cfg.maxAttempts,
    );
    store.update(updated);
    return c.json(
      {
        ok: updated.status === "forwarded",
        eventId: updated.id,
        status: updated.status,
        attempts: updated.attempts.length,
        lastError: updated.lastError,
      },
      updated.status === "forwarded" ? 200 : 502,
    );
  }

  // No forward URL: accept and store only
  return c.json({
    ok: true,
    eventId: stored.id,
    status: stored.status,
    note: "stored_only_set_HOOKVAULT_FORWARD_URL_to_forward",
  });
});

/** Admin: list events */
app.get("/v1/events", (c) => {
  if (!requireAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  const limit = Number(c.req.query("limit") || 50);
  return c.json({ events: store.list(limit), stats: store.stats() });
});

app.get("/v1/events/:id", (c) => {
  if (!requireAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  const ev = store.get(c.req.param("id"));
  if (!ev) return c.json({ error: "not_found" }, 404);
  return c.json({ event: ev });
});

/** Replay to forward URL again */
app.post("/v1/events/:id/replay", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  const ev = store.get(c.req.param("id"));
  if (!ev) return c.json({ error: "not_found" }, 404);
  const cfg = globalConfig();
  const endpoint = getEndpoint(ev.endpointId);
  const forwardUrl = endpoint.forwardUrl || cfg.defaultForwardUrl;
  if (!forwardUrl) {
    return c.json({ error: "no_forward_url" }, 400);
  }
  const replayBase = { ...ev, status: "replayed" as const };
  const updated = await forwardWithRetries(
    replayBase,
    forwardUrl,
    cfg.maxAttempts,
  );
  store.update(updated);
  return c.json({ event: updated });
});

app.get("/v1/dlq", (c) => {
  if (!requireAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  return c.json({ events: store.dlq() });
});

app.post("/v1/dlq/:id/retry", async (c) => {
  if (!requireAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  // Same as replay
  const ev = store.get(c.req.param("id"));
  if (!ev) return c.json({ error: "not_found" }, 404);
  const cfg = globalConfig();
  const endpoint = getEndpoint(ev.endpointId);
  const forwardUrl = endpoint.forwardUrl || cfg.defaultForwardUrl;
  if (!forwardUrl) return c.json({ error: "no_forward_url" }, 400);
  const updated = await forwardWithRetries(
    { ...ev, status: "replayed" },
    forwardUrl,
    cfg.maxAttempts,
  );
  store.update(updated);
  return c.json({ event: updated });
});

/** Dev helper: sign a body with the default secret */
app.post("/v1/dev/sign", async (c) => {
  const cfg = globalConfig();
  const body = await c.req.text();
  const signature = signBody(body, cfg.defaultSecret);
  return c.json({
    signature,
    header: "x-hookvault-signature",
    secretHint: cfg.defaultSecret.slice(0, 4) + "…",
  });
});

function requireAdmin(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const cfg = globalConfig();
  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token === cfg.adminToken;
}

function pickHeaders(headers: Record<string, string>): Record<string, string> {
  const keep = [
    "content-type",
    "user-agent",
    "x-request-id",
    "x-idempotency-key",
    "x-hookvault-signature",
    "stripe-signature",
    "x-hub-signature-256",
  ];
  const out: Record<string, string> = {};
  for (const k of keep) {
    if (headers[k]) out[k] = headers[k];
  }
  return out;
}
