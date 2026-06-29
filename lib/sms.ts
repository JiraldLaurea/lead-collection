// SMS service — provider-agnostic interface
// Configure via environment variables:
//   SMS_PROVIDER=movider|twilio|infobip|clicksend|mock
//   SMS_API_KEY, SMS_API_SECRET, SMS_SENDER_ID

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

  if (provider === "movider") return sendViaMovider(phone, message);
  if (provider === "twilio") return sendViaTwilio(phone, message);
  if (provider === "infobip") return sendViaInfobip(phone, message);
  if (provider === "clicksend") return sendViaClickSend(phone, message);

  // Mock provider — logs the message; use in development
  console.log(`[SMS MOCK] To: ${phone}\n${message}\n`);
  return { success: true, provider_message_id: `mock_${Date.now()}` };
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
