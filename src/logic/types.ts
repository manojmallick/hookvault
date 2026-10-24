/** HookVault — webhook ingress, verify, dedupe, forward, DLQ */

export type EventStatus =
  | "received"
  | "forwarded"
  | "failed"
  | "dead"
  | "replayed";

export interface HookEvent {
  id: string;
  endpointId: string;
  receivedAt: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  signatureValid: boolean | null;
  dedupeKey: string | null;
  status: EventStatus;
  attempts: Attempt[];
  lastError?: string;
}

export interface Attempt {
  at: string;
  statusCode: number | null;
  ok: boolean;
  error?: string;
  latencyMs: number;
}

export interface EndpointConfig {
  id: string;
  /** HMAC secret for signature verification (optional) */
  secret?: string;
  /** Forward destination (overrides global) */
  forwardUrl?: string;
  /** Header that carries signature */
  signatureHeader?: string;
  /** Header used as idempotency / dedupe key */
  dedupeHeader?: string;
}

export function newId(prefix = "evt"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
