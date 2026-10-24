import type { EndpointConfig } from "./types.js";

export function env(name: string, fallback = ""): string {
  return (typeof process !== "undefined" && process.env?.[name]) || fallback;
}

export function globalConfig() {
  return {
    adminToken: env("HOOKVAULT_ADMIN_TOKEN", "dev-admin-token"),
    defaultSecret: env("HOOKVAULT_SECRET", "dev-webhook-secret"),
    defaultForwardUrl: env("HOOKVAULT_FORWARD_URL", ""),
    requireSignature: env("HOOKVAULT_REQUIRE_SIGNATURE", "false") === "true",
    maxAttempts: Number(env("HOOKVAULT_MAX_ATTEMPTS", "3")) || 3,
  };
}

/** Built-in endpoints; production would load from DB. */
export function getEndpoint(id: string): EndpointConfig {
  const g = globalConfig();
  return {
    id,
    secret: g.defaultSecret,
    forwardUrl: g.defaultForwardUrl || undefined,
    signatureHeader: "x-hookvault-signature",
    dedupeHeader: "x-idempotency-key",
  };
}
