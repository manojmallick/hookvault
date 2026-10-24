import type { Attempt, HookEvent } from "./types.js";
import { nowIso } from "./types.js";

export interface ForwardResult {
  attempt: Attempt;
  ok: boolean;
}

/**
 * Forward event to destination with timeout.
 * Retries are orchestrated by the caller (ingest / replay).
 */
export async function forwardEvent(
  event: HookEvent,
  forwardUrl: string,
  opts?: { timeoutMs?: number },
): Promise<ForwardResult> {
  const started = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 10_000;

  if (!forwardUrl) {
    return {
      ok: false,
      attempt: {
        at: nowIso(),
        statusCode: null,
        ok: false,
        error: "no_forward_url",
        latencyMs: 0,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "content-type": event.contentType || "application/json",
        "x-hookvault-event-id": event.id,
        "x-hookvault-endpoint": event.endpointId,
        "x-hookvault-received-at": event.receivedAt,
        // Pass through a few useful original headers
        ...(event.headers["user-agent"]
          ? { "x-original-user-agent": event.headers["user-agent"] }
          : {}),
      },
      body: event.body,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      attempt: {
        at: nowIso(),
        statusCode: res.status,
        ok,
        error: ok ? undefined : `upstream_${res.status}`,
        latencyMs,
      },
    };
  } catch (e) {
    return {
      ok: false,
      attempt: {
        at: nowIso(),
        statusCode: null,
        ok: false,
        error: e instanceof Error ? e.message : "forward_failed",
        latencyMs: Date.now() - started,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardWithRetries(
  event: HookEvent,
  forwardUrl: string,
  maxAttempts = 3,
): Promise<HookEvent> {
  let current = { ...event, attempts: [...event.attempts] };
  for (let i = 0; i < maxAttempts; i++) {
    const { ok, attempt } = await forwardEvent(current, forwardUrl);
    current.attempts.push(attempt);
    if (ok) {
      current.status = current.status === "replayed" ? "replayed" : "forwarded";
      current.lastError = undefined;
      return current;
    }
    current.lastError = attempt.error;
    // brief backoff
    if (i < maxAttempts - 1) {
      await sleep(100 * 2 ** i);
    }
  }
  current.status = current.attempts.length >= maxAttempts ? "dead" : "failed";
  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
