// SMS service — provider-agnostic interface
// Configure via environment variables:
//   SMS_PROVIDER=movider|twilio|infobip|clicksend|smpp|mock
//   SMS_API_KEY, SMS_API_SECRET, SMS_SENDER_ID

import { recordSmsDeliveryReceipt } from "@/lib/sms-delivery-receipts";

export interface SmsResult {
  success: boolean;
  provider_message_id?: string;
  error?: string;
}

export function applyLeadTemplate(template: string, businessName: string) {
  return template.replace(/\[business_name\]/gi, businessName);
}

export function buildLeadSmsBody(template: string, businessName: string) {
  return applyLeadTemplate(template, businessName);
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER ?? "mock";

  if (provider === "smpp_worker") return sendViaSmppWorker(phone, message);
  if (provider === "smpp") return sendViaSmpp(phone, message);
  if (provider === "movider") return sendViaMovider(phone, message);
  if (provider === "twilio") return sendViaTwilio(phone, message);
  if (provider === "infobip") return sendViaInfobip(phone, message);
  if (provider === "clicksend") return sendViaClickSend(phone, message);

  // Mock provider — logs the message; use in development
  console.log(`[SMS MOCK] To: ${phone}\n${message}\n`);
  return { success: true, provider_message_id: `mock_${Date.now()}` };
}

async function sendViaSmppWorker(phone: string, message: string): Promise<SmsResult> {
  const workerUrl = process.env.SMPP_WORKER_URL;
  const apiToken = process.env.SMPP_WORKER_API_TOKEN;
  if (!workerUrl || !apiToken) {
    return { success: false, error: "SMPP worker is not configured (SMPP_WORKER_URL, SMPP_WORKER_API_TOKEN)" };
  }

  try {
    const response = await fetch(new URL("/messages", workerUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ to: phone, message })
    });
    const payload = await response.json().catch(() => null) as {
      success?: boolean;
      provider_message_id?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.success) {
      return { success: false, error: payload?.error ?? `SMPP worker HTTP ${response.status}` };
    }
    return { success: true, provider_message_id: payload.provider_message_id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

type SmppPdu = {
  command?: string;
  command_status?: number;
  message_id?: string | Buffer;
  message_state?: number | string;
  receipted_message_id?: string | Buffer;
  short_message?: unknown;
  response?: (options?: Record<string, unknown>) => unknown;
};

type SmppSession = {
  bind_transceiver: (options: Record<string, unknown>, callback: (pdu: SmppPdu) => void) => void;
  bind_transmitter: (options: Record<string, unknown>, callback: (pdu: SmppPdu) => void) => void;
  submit_sm: (options: Record<string, unknown>, callback: (pdu: SmppPdu) => void) => void;
  query_sm: (options: Record<string, unknown>, callback: (pdu: SmppPdu) => void) => void;
  unbind: (callback?: (pdu: SmppPdu) => void) => void;
  send: (pdu: unknown) => void;
  close: () => void;
  destroy: () => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

/** SMPP command_status values we can explain to the operator rather than just echoing a number. */
const smppBindErrors: Record<number, string> = {
  5: "the SMSC still has an earlier session bound (ESME_RALYBND). It usually clears within a few minutes; a stale session is left behind when the app is force-killed instead of shut down cleanly.",
  13: "the SMSC rejected the bind (ESME_RBINDFAIL). Check the system ID, password and IP allowlist.",
  14: "the SMPP password is wrong (ESME_RINVPASWD).",
  15: "the SMPP system ID is wrong (ESME_RINVSYSID)."
};

type SmppModule = {
  connect: (options: Record<string, unknown>, callback: () => void) => SmppSession;
};

/**
 * The SMPP session is kept on globalThis, not in module scope, for the same reason
 * lib/prisma.ts does it: Next.js hot-reloads modules in development.
 *
 * With module-scope state, every recompile of this file produced a fresh module whose
 * `smppSession` was null — while the previous module's socket stayed bound and alive. The
 * next send therefore opened a SECOND connection and re-bound, and the SMSC rejected it with
 * command_status=5 (ESME_RALYBND, "already bound"), because most providers allow only one
 * session per system ID. The symptom was SMS working right up until the first hot reload
 * after a successful bind, then failing forever.
 */
const globalForSmpp = globalThis as unknown as {
  smppSession?: SmppSession | null;
  smppSessionPromise?: Promise<SmppSession> | null;
};

function smppConfig() {
  const host = process.env.SMPP_HOST;
  const systemId = process.env.SMPP_SYSTEM_ID;
  const password = process.env.SMPP_PASSWORD;
  if (!host || !systemId || !password) return null;

  return {
    host,
    port: process.env.SMPP_PORT ?? "2775",
    systemId,
    password,
    bindType: process.env.SMPP_BIND_TYPE ?? "transceiver"
  };
}

/** One submit_sm on an already-bound session. */
function submitViaSmpp(session: SmppSession, phone: string, message: string): Promise<SmsResult> {
  return new Promise<SmsResult>((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: "SMPP submit_sm timed out" });
    }, getEnvNumber("SMPP_SUBMIT_TIMEOUT_MS", 30000));

    session.submit_sm(
      {
        source_addr: selectSmppSourceAddress(phone),
        source_addr_ton: getEnvNumber("SMPP_SOURCE_ADDR_TON", 5),
        source_addr_npi: getEnvNumber("SMPP_SOURCE_ADDR_NPI", 0),
        destination_addr: phone,
        dest_addr_ton: getEnvNumber("SMPP_DEST_ADDR_TON", 1),
        dest_addr_npi: getEnvNumber("SMPP_DEST_ADDR_NPI", 1),
        registered_delivery: getEnvNumber("SMPP_REGISTERED_DELIVERY", 1),
        short_message: message
      },
      (pdu) => {
        clearTimeout(timeout);
        if (pdu.command_status === 0) {
          return resolve({
            success: true,
            provider_message_id: pdu.message_id ? String(pdu.message_id) : undefined
          });
        }
        resolve({
          success: false,
          error: `SMPP submit_sm failed with command_status=${pdu.command_status ?? "unknown"}`
        });
      }
    );
  });
}

async function sendViaSmpp(phone: string, message: string): Promise<SmsResult> {
  const config = smppConfig();
  if (!config) {
    return { success: false, error: "SMPP credentials not configured (SMPP_HOST, SMPP_SYSTEM_ID, SMPP_PASSWORD)" };
  }

  try {
    const session = await getSmppSession(config);
    return await submitViaSmpp(session, phone, message);
  } catch (error) {
    resetSmppSession();
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type SmsBatchItem = { phone: string; message: string };

/**
 * Sends a batch, pipelining submit_sm instead of waiting for each response in turn.
 *
 * SMPP allows many requests in flight at once, and the provider allows SMPP_TPS per second —
 * but the app used to await every submit individually, so a 50-recipient send meant 50
 * sequential round-trips to the SMSC and took tens of seconds. SMPP_TPS was configured to 50
 * and never referenced anywhere in the code.
 *
 * Sends are issued in one-second windows of at most SMPP_TPS messages, so throughput matches
 * what the provider actually permits without exceeding it. Results are returned in the same
 * order as the input.
 */
export async function sendSmsBatch(items: SmsBatchItem[]): Promise<SmsResult[]> {
  if (items.length === 0) return [];

  const provider = process.env.SMS_PROVIDER ?? "mock";

  // Only SMPP supports pipelining here. Other providers are HTTP one-shot calls; keep them
  // sequential rather than risk hammering a rate-limited REST API.
  if (provider !== "smpp") {
    const results: SmsResult[] = [];
    for (const item of items) {
      results.push(await sendSms(item.phone, item.message));
    }
    return results;
  }

  const config = smppConfig();
  if (!config) {
    const error = "SMPP credentials not configured (SMPP_HOST, SMPP_SYSTEM_ID, SMPP_PASSWORD)";
    return items.map(() => ({ success: false, error }));
  }

  let session: SmppSession;
  try {
    session = await getSmppSession(config);
  } catch (error) {
    resetSmppSession();
    const message = error instanceof Error ? error.message : String(error);
    // A bind failure fails the whole batch — there is no session to submit on.
    return items.map(() => ({ success: false, error: message }));
  }

  const tps = Math.min(Math.max(getEnvNumber("SMPP_TPS", 20), 1), 200);
  const results: SmsResult[] = new Array(items.length);

  for (let offset = 0; offset < items.length; offset += tps) {
    const windowStartedAt = Date.now();
    const window = items.slice(offset, offset + tps);

    const settled = await Promise.all(
      window.map((item) =>
        submitViaSmpp(session, item.phone, item.message).catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }))
      )
    );
    settled.forEach((result, index) => {
      results[offset + index] = result;
    });

    // Hold the provider's rate limit: at most SMPP_TPS messages per second.
    const remaining = items.length - (offset + window.length);
    if (remaining > 0) {
      const elapsed = Date.now() - windowStartedAt;
      if (elapsed < 1000) await sleep(1000 - elapsed);
    }
  }

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asks the SMSC what happened to a message, instead of waiting for it to tell us.
 *
 * Delivery receipts were purely passive: the app waited for a deliver_sm that might never
 * come — because the provider does not send one, or because it arrived while the process was
 * restarting. A row then sat at "pending" forever with no way to ever resolve. query_sm lets
 * us pull the state on demand.
 */
export async function querySmppMessageState(
  providerMessageId: string,
  phone: string
): Promise<{ state: number | string | null; error?: string }> {
  const config = smppConfig();
  if (!config) return { state: null, error: "SMPP credentials not configured" };

  try {
    const session = await getSmppSession(config);

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ state: null, error: "SMPP query_sm timed out" });
      }, getEnvNumber("SMPP_QUERY_TIMEOUT_MS", 15000));

      session.query_sm(
        {
          message_id: providerMessageId,
          source_addr: selectSmppSourceAddress(phone),
          source_addr_ton: getEnvNumber("SMPP_SOURCE_ADDR_TON", 5),
          source_addr_npi: getEnvNumber("SMPP_SOURCE_ADDR_NPI", 0)
        },
        (pdu) => {
          clearTimeout(timeout);
          if (pdu.command_status !== 0) {
            return resolve({
              state: null,
              error: `query_sm failed with command_status=${pdu.command_status ?? "unknown"}`
            });
          }
          resolve({ state: pdu.message_state ?? null });
        }
      );
    });
  } catch (error) {
    resetSmppSession();
    return { state: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Binds at startup rather than lazily on the first send, so the first message does not pay
 * the bind handshake, and bad credentials surface at boot instead of mid-campaign.
 */
export async function warmSmppSession() {
  if ((process.env.SMS_PROVIDER ?? "mock") !== "smpp") return false;
  const config = smppConfig();
  if (!config) return false;

  try {
    await getSmppSession(config);
    return true;
  } catch (error) {
    resetSmppSession();
    console.error("[SMPP] startup bind failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Loads the SMPP driver. A dynamic import (rather than require) keeps this mockable in tests. */
async function loadSmppModule(): Promise<SmppModule> {
  const loaded = (await import("smpp")) as unknown as SmppModule & { default?: SmppModule };
  return loaded.default ?? loaded;
}

async function getSmppSession(options: {
  host: string;
  port: string;
  systemId: string;
  password: string;
  bindType: string;
}): Promise<SmppSession> {
  if (globalForSmpp.smppSession) return globalForSmpp.smppSession;
  if (globalForSmpp.smppSessionPromise) return globalForSmpp.smppSessionPromise;

  const smpp = await loadSmppModule();

  globalForSmpp.smppSessionPromise = new Promise<SmppSession>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resetSmppSession();
      reject(new Error("SMPP bind timed out"));
    }, getEnvNumber("SMPP_BIND_TIMEOUT_MS", 30000));

    const session = smpp.connect({
      url: `smpp://${options.host}:${options.port}`,
      auto_enquire_link_period: getEnvNumber("SMPP_ENQUIRE_LINK_MS", 10000),
      connectTimeout: getEnvNumber("SMPP_CONNECT_TIMEOUT_MS", 30000),
      debug: process.env.SMPP_DEBUG === "true",
    }, () => {
      const bindOptions = {
        system_id: options.systemId,
        password: options.password,
      };
      const bind = options.bindType === "transmitter"
        ? session.bind_transmitter.bind(session)
        : session.bind_transceiver.bind(session);

      bind(bindOptions, (pdu) => {
        clearTimeout(timeout);
        if (pdu.command_status === 0) {
          globalForSmpp.smppSession = session;
          registerSmppShutdown();
          return resolve(session);
        }
        resetSmppSession();
        const status = pdu.command_status ?? -1;
        const explanation = smppBindErrors[status];
        reject(
          new Error(
            `SMPP bind failed with command_status=${status}${explanation ? ` — ${explanation}` : ""}`
          )
        );
      });
    });

    session.on("deliver_sm", (pdu: unknown) => {
      const deliverPdu = pdu as SmppPdu;
      void recordSmsDeliveryReceipt({
        providerMessageId: deliverPdu.message_id ? String(deliverPdu.message_id) : null,
        messageState: deliverPdu.message_state,
        receiptedMessageId: deliverPdu.receipted_message_id,
        shortMessage: deliverPdu.short_message,
      }).catch((error) => {
        console.error("[SMPP DLR] Unable to record delivery receipt", error);
      });
      if (deliverPdu.response) session.send(deliverPdu.response());
    });
    session.on("enquire_link", (pdu: unknown) => {
      const enquirePdu = pdu as SmppPdu;
      if (enquirePdu.response) session.send(enquirePdu.response());
    });
    session.on("close", () => resetSmppSession());
    session.on("error", (error) => {
      resetSmppSession();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });

  return globalForSmpp.smppSessionPromise;
}

function resetSmppSession() {
  globalForSmpp.smppSession = null;
  globalForSmpp.smppSessionPromise = null;
}

let smppShutdownRegistered = false;

/**
 * Unbinds cleanly when the process stops.
 *
 * Without this, stopping the app leaves the SMPP session open on the SMSC's side. The next
 * bind is then rejected with command_status=5 (ESME_RALYBND, "already bound") until the
 * provider times the zombie out — so SMS silently stops working after a restart, and any
 * delivery receipt sent in the meantime is delivered to a session nobody is listening on.
 *
 * SIGKILL cannot be caught, so a force-kill can still orphan a session. Stopping the dev
 * server with Ctrl+C, or the host stopping the process normally, is now handled.
 */
function registerSmppShutdown() {
  if (smppShutdownRegistered) return;
  smppShutdownRegistered = true;

  const cleanup = () => {
    const session = globalForSmpp.smppSession;
    resetSmppSession();
    if (!session) return;
    try {
      session.unbind(() => {
        try {
          session.close();
        } catch {
          // The socket may already be gone; nothing left to do.
        }
      });
    } catch {
      try {
        session.destroy();
      } catch {
        // Same.
      }
    }
  };

  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.once("beforeExit", cleanup);
}

function getEnvNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function selectSmppSourceAddress(phone: string) {
  const smartSender = process.env.SMPP_SOURCE_ADDR_SMART;
  const globeSender = process.env.SMPP_SOURCE_ADDR_GLOBE;
  const defaultSender = process.env.SMPP_SOURCE_ADDR ?? process.env.SMS_SENDER_ID ?? "QROAD";

  if (smartSender && isLikelySmartNumber(phone)) return smartSender;
  if (globeSender && isLikelyGlobeNumber(phone)) return globeSender;
  return defaultSender;
}

function isLikelySmartNumber(phone: string) {
  const prefix = phone.replace(/\D/g, "").slice(0, 5);
  return [
    "63907", "63908", "63909", "63910", "63911", "63912", "63913", "63914",
    "63918", "63919", "63920", "63921", "63928", "63929", "63930", "63938",
    "63939", "63946", "63947", "63948", "63949", "63950", "63951", "63961",
    "63963", "63968", "63970", "63981", "63989", "63998", "63999",
  ].includes(prefix);
}

function isLikelyGlobeNumber(phone: string) {
  const prefix = phone.replace(/\D/g, "").slice(0, 5);
  return [
    "63905", "63906", "63915", "63916", "63917", "63926", "63927", "63935",
    "63936", "63937", "63945", "63953", "63954", "63955", "63956", "63957",
    "63958", "63959", "63965", "63966", "63967", "63975", "63976", "63977",
    "63978", "63979", "63995", "63996", "63997",
  ].includes(prefix);
}

// ─── Movider (Philippines) ───────────────────────────────────────────────────
// Docs: https://developer.movider.co
// Env vars:
//   SMS_API_KEY    = your Movider API key
//   SMS_API_SECRET = your Movider API secret
//   SMS_SENDER_ID  = approved sender name (optional, defaults to "QROAD")

async function sendViaMovider(phone: string, message: string): Promise<SmsResult> {
  const apiKey = process.env.SMS_API_KEY;
  const apiSecret = process.env.SMS_API_SECRET;
  let from = process.env.SMS_SENDER_ID ?? "QROAD";
  let text = message;

  // Trial-mode override: Movider trial accounts can ONLY use the default sender
  // name and the default "stability check" message -- custom sender/text are
  // rejected. Set MOVIDER_TRIAL_MODE=true to prove end-to-end delivery on a
  // trial account before upgrading. Remove the env var to send real messages.
  if (process.env.MOVIDER_TRIAL_MODE === "true") {
    from = process.env.MOVIDER_TRIAL_SENDER ?? "DemoP";
    text = process.env.MOVIDER_TRIAL_MESSAGE ?? "Good Day! This is a SMS for checking stability.";
  }

  if (!apiKey || !apiSecret) {
    return { success: false, error: "Movider credentials not configured (SMS_API_KEY, SMS_API_SECRET)" };
  }

  const body = new URLSearchParams({
    api_key: apiKey,
    api_secret: apiSecret,
    to: phone,
    text,
    from,
  });

  try {
    const res = await fetch("https://api.movider.co/v1/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    // Movider's /v1/sms response indicates success by returning a message_id
    // for each recipient in phone_number_list; failures come back as a
    // top-level `error` array (e.g. [{ code, message }]), not a status field.
    const data = await res.json() as {
      phone_number_list?: Array<{
        to?: string;
        phone_number?: string;
        number?: string;
        message_id?: string;
      }>;
      error?: Array<{ code?: number | string; message?: string }> | string;
      error_text?: string;
      remaining_balance?: number;
    };

    const rawErr = Array.isArray(data.error)
      ? data.error.map(e => `${e.code ?? ""}:${e.message ?? ""}`).join("; ")
      : (typeof data.error === "string" ? data.error : undefined);

    if (!res.ok || rawErr) {
      return {
        success: false,
        error: rawErr ?? data.error_text ?? `Movider HTTP ${res.status}: ${JSON.stringify(data)}`,
      };
    }

    const result = data.phone_number_list?.[0];
    if (result?.message_id) {
      return { success: true, provider_message_id: result.message_id };
    }

    // Reached Movider but no message_id and no explicit error -- surface the
    // raw response so the actual shape can be diagnosed.
    return { success: false, error: `Movider: no message_id in response: ${JSON.stringify(data)}` };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

async function sendViaTwilio(phone: string, message: string): Promise<SmsResult> {
  const accountSid = process.env.SMS_API_KEY;
  const authToken = process.env.SMS_API_SECRET;
  const from = process.env.SMS_SENDER_ID ?? process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return { success: false, error: "Twilio credentials not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ To: phone, From: from, Body: message });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await res.json() as { sid?: string; message?: string };
    if (!res.ok) return { success: false, error: data.message ?? "Twilio error" };
    return { success: true, provider_message_id: data.sid };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Infobip ─────────────────────────────────────────────────────────────────

async function sendViaInfobip(phone: string, message: string): Promise<SmsResult> {
  const apiKey = process.env.SMS_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.SMS_SENDER_ID ?? "QROAD";

  if (!apiKey || !baseUrl) {
    return { success: false, error: "Infobip credentials not configured" };
  }

  try {
    const res = await fetch(`${baseUrl}/sms/2/text/advanced`, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{ from: sender, destinations: [{ to: phone }], text: message }],
      }),
    });
    const data = await res.json() as { messages?: Array<{ messageId?: string; status?: { groupName?: string; description?: string } }> };
    if (!res.ok) return { success: false, error: "Infobip error" };
    const msg = data.messages?.[0];
    return {
      success: msg?.status?.groupName !== "REJECTED",
      provider_message_id: msg?.messageId,
      error: msg?.status?.groupName === "REJECTED" ? msg.status?.description : undefined,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── ClickSend ───────────────────────────────────────────────────────────────

async function sendViaClickSend(phone: string, message: string): Promise<SmsResult> {
  const username = process.env.SMS_API_KEY;
  const apiKey = process.env.SMS_API_SECRET;
  const sender = process.env.SMS_SENDER_ID ?? "QROAD";

  if (!username || !apiKey) {
    return { success: false, error: "ClickSend credentials not configured" };
  }

  try {
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ source: "sdk", body: message, to: phone, from: sender }],
      }),
    });
    const data = await res.json() as { data?: { messages?: Array<{ message_id?: string; status?: string }> } };
    if (!res.ok) return { success: false, error: "ClickSend error" };
    const msg = data.data?.messages?.[0];
    return {
      success: msg?.status === "SUCCESS",
      provider_message_id: msg?.message_id,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
