import assert from "node:assert";
import test, { describe } from "node:test";
import { verifySignature, signBody } from "./verify.js";
import { store } from "./store.js";
import type { HookEvent } from "./types.js";

describe("HookVault Verification & Store Logic", () => {
  const secret = "super-secret-key-123";
  const body = JSON.stringify({ event: "order.created", orderId: "ord_100" });

  test("signs and verifies raw HMAC signature", () => {
    const signature = signBody(body, secret);
    assert.ok(signature.length > 0);

    const verified = verifySignature({ body, signatureHeader: signature, secret });
    assert.strictEqual(verified.ok, true);

    const badVerify = verifySignature({ body, signatureHeader: "invalid_sig", secret });
    assert.strictEqual(badVerify.ok, false);
    assert.strictEqual(badVerify.reason, "bad_signature");
  });

  test("verifies GitHub-style sha256= signature", () => {
    const signature = `sha256=${signBody(body, secret)}`;
    const verified = verifySignature({ body, signatureHeader: signature, secret });
    assert.strictEqual(verified.ok, true);
  });

  test("stores events and detects dedupe keys", () => {
    const event1: HookEvent = {
      id: "ev_test_1",
      endpointId: "demo",
      receivedAt: new Date().toISOString(),
      headers: { "content-type": "application/json" },
      body,
      contentType: "application/json",
      signatureValid: true,
      dedupeKey: "idempotency_key_abc",
      status: "received",
      attempts: [],
    };

    const res1 = store.put(event1);
    assert.strictEqual(res1.duplicate, false);
    assert.strictEqual(res1.event.id, "ev_test_1");

    const event2: HookEvent = {
      ...event1,
      id: "ev_test_2",
    };

    const res2 = store.put(event2);
    assert.strictEqual(res2.duplicate, true);
    assert.strictEqual(res2.event.id, "ev_test_1");
  });

  test("lists events and tracks store statistics", () => {
    const listed = store.list(10);
    assert.ok(listed.length > 0);

    const stats = store.stats();
    assert.ok(stats.total > 0);
    assert.strictEqual(typeof stats.dedupeKeys, "number");
  });
});
