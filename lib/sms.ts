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

  if (provider === "smpp") return sendViaSmpp(phone, message);
  if (provider === "movider") return sendViaMovider(phone, message);
  if (provider === "twilio") return sendViaTwilio(phone, message);
  if (provider === "infobip") return sendViaInfobip(phone, message);
  if (provider === "clicksend") return sendViaClickSend(phone, message);

  // Mock provider — logs the message; use in development
  console.log(`[SMS MOCK] To: ${phone}\n${message}\n`);
  return { success: true, provider_message_id: `mock_${Date.now()}` };
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
  send: (pdu: unknown) => void;
  close: () => void;
  destroy: () => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

type SmppModule = {
  connect: (options: Record<string, unknown>, callback: () => void) => SmppSession;
};

let smppSessionPromise: Promise<SmppSession> | null = null;
let smppSession: SmppSession | null = null;

async function sendViaSmpp(phone: string, message: string): Promise<SmsResult> {
  const host = process.env.SMPP_HOST;
  const port = process.env.SMPP_PORT ?? "2775";
  const systemId = process.env.SMPP_SYSTEM_ID;
  const password = process.env.SMPP_PASSWORD;
  const bindType = process.env.SMPP_BIND_TYPE ?? "transceiver";

  if (!host || !systemId || !password) {
    return { success: false, error: "SMPP credentials not configured (SMPP_HOST, SMPP_SYSTEM_ID, SMPP_PASSWORD)" };
  }

  try {
    const session = await getSmppSession({ host, port, systemId, password, bindType });
    const sourceAddress = selectSmppSourceAddress(phone);

    return await new Promise<SmsResult>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: "SMPP submit_sm timed out" });
      }, getEnvNumber("SMPP_SUBMIT_TIMEOUT_MS", 30000));

      session.submit_sm({
        source_addr: sourceAddress,
        source_addr_ton: getEnvNumber("SMPP_SOURCE_ADDR_TON", 5),
        source_addr_npi: getEnvNumber("SMPP_SOURCE_ADDR_NPI", 0),
        destination_addr: phone,
        dest_addr_ton: getEnvNumber("SMPP_DEST_ADDR_TON", 1),
        dest_addr_npi: getEnvNumber("SMPP_DEST_ADDR_NPI", 1),
        registered_delivery: getEnvNumber("SMPP_REGISTERED_DELIVERY", 1),
        short_message: message,
      }, (pdu) => {
        clearTimeout(timeout);
        if (pdu.command_status === 0) {
          return resolve({
            success: true,
            provider_message_id: pdu.message_id ? String(pdu.message_id) : undefined,
          });
        }

        resolve({
          success: false,
          error: `SMPP submit_sm failed with command_status=${pdu.command_status ?? "unknown"}`,
        });
      });
    });
  } catch (error) {
    resetSmppSession();
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function getSmppSession(options: {
  host: string;
  port: string;
  systemId: string;
  password: string;
  bindType: string;
}) {
  if (smppSession) return Promise.resolve(smppSession);
  if (smppSessionPromise) return smppSessionPromise;

  smppSessionPromise = new Promise<SmppSession>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const smpp = require("smpp") as SmppModule;
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
          smppSession = session;
          return resolve(session);
        }
        resetSmppSession();
        reject(new Error(`SMPP bind failed with command_status=${pdu.command_status ?? "unknown"}`));
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

  return smppSessionPromise;
}

function resetSmppSession() {
  smppSession = null;
  smppSessionPromise = null;
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
