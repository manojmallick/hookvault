import type { HookEvent } from "./types.js";

/**
 * In-memory store for local/MVP.
 * Production: swap for Redis / DynamoDB / KV (dedupe keys + event log + DLQ).
 */
class HookStore {
  private events = new Map<string, HookEvent>();
  /** dedupeKey -> eventId */
  private dedupe = new Map<string, string>();
  private order: string[] = [];
  private maxEvents = 500;

  put(event: HookEvent): { event: HookEvent; duplicate: boolean } {
    if (event.dedupeKey) {
      const existingId = this.dedupe.get(event.dedupeKey);
      if (existingId) {
        const existing = this.events.get(existingId);
        if (existing) return { event: existing, duplicate: true };
      }
      this.dedupe.set(event.dedupeKey, event.id);
    }
    this.events.set(event.id, event);
    this.order.unshift(event.id);
    while (this.order.length > this.maxEvents) {
      const drop = this.order.pop();
      if (drop) {
        const ev = this.events.get(drop);
        if (ev?.dedupeKey) this.dedupe.delete(ev.dedupeKey);
        this.events.delete(drop);
      }
    }
    return { event, duplicate: false };
  }

  update(event: HookEvent): void {
    this.events.set(event.id, event);
  }

  get(id: string): HookEvent | undefined {
    return this.events.get(id);
  }

  list(limit = 50): HookEvent[] {
    return this.order.slice(0, limit).map((id) => this.events.get(id)!).filter(Boolean);
  }

  dlq(limit = 50): HookEvent[] {
    return this.list(200)
      .filter((e) => e.status === "dead" || e.status === "failed")
      .slice(0, limit);
  }

  stats() {
    const all = this.list(this.maxEvents);
    return {
      total: all.length,
      forwarded: all.filter((e) => e.status === "forwarded" || e.status === "replayed")
        .length,
      failed: all.filter((e) => e.status === "failed").length,
      dead: all.filter((e) => e.status === "dead").length,
      dedupeKeys: this.dedupe.size,
    };
  }
}

export const store = new HookStore();
