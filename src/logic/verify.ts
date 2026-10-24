import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify webhook signatures.
 * Supports:
 * - Stripe-style: `t=timestamp,v1=hex`
 * - GitHub-style: `sha256=hex`
 * - Raw hex HMAC of body
 */
export function verifySignature(input: {
  body: string;
  signatureHeader: string | undefined;
  secret: string;
  maxSkewSec?: number;
}): { ok: boolean; reason?: string } {
  const sig = input.signatureHeader?.trim();
  if (!sig) return { ok: false, reason: "missing_signature_header" };
  if (!input.secret) return { ok: false, reason: "missing_secret" };

  // Stripe: t=...,v1=...
  if (sig.includes("t=") && sig.includes("v1=")) {
    const parts = Object.fromEntries(
      sig.split(",").map((p) => {
        const [k, ...rest] = p.split("=");
        return [k.trim(), rest.join("=")];
      }),
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return { ok: false, reason: "malformed_stripe_signature" };
    const skew = input.maxSkewSec ?? 300;
    const ts = Number(t);
    if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
    const age = Math.abs(Date.now() / 1000 - ts);
    if (age > skew) return { ok: false, reason: "timestamp_skew" };
    const payload = `${t}.${input.body}`;
    const expected = createHmac("sha256", input.secret)
      .update(payload, "utf8")
      .digest("hex");
    return equalHex(expected, v1)
      ? { ok: true }
      : { ok: false, reason: "bad_signature" };
  }

  // GitHub: sha256=hex
  if (sig.startsWith("sha256=")) {
    const hex = sig.slice("sha256=".length);
    const expected = createHmac("sha256", input.secret)
      .update(input.body, "utf8")
      .digest("hex");
    return equalHex(expected, hex)
      ? { ok: true }
      : { ok: false, reason: "bad_signature" };
  }

  // Raw hex
  const expected = createHmac("sha256", input.secret)
    .update(input.body, "utf8")
    .digest("hex");
  return equalHex(expected, sig)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

/** Sign a body the same way clients should (raw hex HMAC-SHA256). */
export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function equalHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
