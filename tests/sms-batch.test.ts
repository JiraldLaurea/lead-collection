import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fake SMPP session that records how many submits were in flight at once, which is the whole
 * point of the change: the old code awaited every submit_sm in turn.
 */
const submitCalls: { phone: string; at: number }[] = [];
let maxConcurrent = 0;
let inFlight = 0;
let bindStatus = 0;

const fakeSession = {
  bind_transceiver: (_o: unknown, cb: (pdu: { command_status: number }) => void) =>
    setTimeout(() => cb({ command_status: bindStatus }), 1),
  bind_transmitter: (_o: unknown, cb: (pdu: { command_status: number }) => void) =>
    setTimeout(() => cb({ command_status: bindStatus }), 1),
  submit_sm: (options: Record<string, unknown>, cb: (pdu: { command_status: number; message_id: string }) => void) => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    submitCalls.push({ phone: String(options.destination_addr), at: Date.now() });
    // A realistic round-trip: this is what used to be paid serially, once per recipient.
    setTimeout(() => {
      inFlight -= 1;
      cb({ command_status: 0, message_id: `id-${submitCalls.length}` });
    }, 20);
  },
  query_sm: (_o: unknown, cb: (pdu: { command_status: number; message_state: number }) => void) =>
    setTimeout(() => cb({ command_status: 0, message_state: 2 }), 1),
  unbind: (cb?: () => void) => cb?.(),
  send: () => undefined,
  close: () => undefined,
  destroy: () => undefined,
  on: () => undefined
};

// lib/sms.ts loads the driver with CommonJS `require`, so the mock must expose `connect`
// both as a named export and on `default`.
vi.mock("smpp", () => {
  const connect = (_options: unknown, onConnect: () => void) => {
    setTimeout(onConnect, 1);
    return fakeSession;
  };
  return { connect, default: { connect } };
});

const { sendSmsBatch, querySmppMessageState } = await import("@/lib/sms");

function resetSmppGlobals() {
  const g = globalThis as unknown as { smppSession?: unknown; smppSessionPromise?: unknown };
  g.smppSession = null;
  g.smppSessionPromise = null;
}

describe("SMPP batch sending", () => {
  beforeEach(() => {
    submitCalls.length = 0;
    maxConcurrent = 0;
    inFlight = 0;
    bindStatus = 0;
    resetSmppGlobals();
    process.env.SMS_PROVIDER = "smpp";
    process.env.SMPP_HOST = "smsc.test";
    process.env.SMPP_SYSTEM_ID = "id";
    process.env.SMPP_PASSWORD = "pw";
    process.env.SMPP_TPS = "10";
  });

  afterEach(() => {
    resetSmppGlobals();
    delete process.env.SMS_PROVIDER;
    delete process.env.SMPP_TPS;
  });

  it("returns a result per message, in order", async () => {
    const results = await sendSmsBatch([
      { phone: "639171111111", message: "one" },
      { phone: "639172222222", message: "two" },
      { phone: "639173333333", message: "three" }
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.success)).toBe(true);
    expect(submitCalls.map((call) => call.phone)).toEqual([
      "639171111111",
      "639172222222",
      "639173333333"
    ]);
  });

  it("pipelines submits instead of sending one at a time", async () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      phone: `63917000000${index}`,
      message: `m${index}`
    }));

    await sendSmsBatch(items);

    // The old code awaited each submit, so only ever one was in flight.
    expect(maxConcurrent).toBeGreaterThan(1);
    expect(maxConcurrent).toBe(8);
  });

  it("never exceeds SMPP_TPS messages in a single window", async () => {
    process.env.SMPP_TPS = "3";
    const items = Array.from({ length: 6 }, (_, index) => ({
      phone: `63917000000${index}`,
      message: `m${index}`
    }));

    await sendSmsBatch(items);

    // Respecting the provider's rate limit matters as much as being fast.
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(submitCalls).toHaveLength(6);
  });

  it("is faster than sending serially", async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      phone: `63917000000${index}`,
      message: `m${index}`
    }));

    const started = Date.now();
    await sendSmsBatch(items);
    const elapsed = Date.now() - started;

    // Serially this would be 10 x 20ms = 200ms+. Pipelined it is roughly one round-trip.
    expect(elapsed).toBeLessThan(150);
  });

  it("fails the whole batch when the bind is rejected, without submitting anything", async () => {
    bindStatus = 5; // ESME_RALYBND

    const results = await sendSmsBatch([{ phone: "639171111111", message: "x" }]);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("command_status=5");
    expect(submitCalls).toHaveLength(0);
  });

  it("returns an empty array for an empty batch without binding", async () => {
    await expect(sendSmsBatch([])).resolves.toEqual([]);
    expect(submitCalls).toHaveLength(0);
  });

  it("falls back to sequential sending for non-SMPP providers", async () => {
    process.env.SMS_PROVIDER = "mock";

    const results = await sendSmsBatch([
      { phone: "639171111111", message: "a" },
      { phone: "639172222222", message: "b" }
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.success)).toBe(true);
    // The mock provider never touches SMPP.
    expect(submitCalls).toHaveLength(0);
  });
});

describe("query_sm", () => {
  beforeEach(() => {
    resetSmppGlobals();
    process.env.SMS_PROVIDER = "smpp";
    process.env.SMPP_HOST = "smsc.test";
    process.env.SMPP_SYSTEM_ID = "id";
    process.env.SMPP_PASSWORD = "pw";
    bindStatus = 0;
  });

  afterEach(() => {
    resetSmppGlobals();
    delete process.env.SMS_PROVIDER;
  });

  it("pulls a message state from the SMSC instead of waiting for a receipt", async () => {
    const result = await querySmppMessageState("abc-123", "639171111111");
    expect(result.state).toBe(2); // DELIVRD
    expect(result.error).toBeUndefined();
  });
});
