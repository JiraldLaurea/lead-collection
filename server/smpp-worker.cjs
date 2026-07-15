/*
 * Persistent SMPP worker for hosted deployments.
 * Run this on a VM/container with the provider-whitelisted static public IP:
 *   npm run start:smpp-worker
 */
const http = require("http");
const smpp = require("smpp");

const port = Number(process.env.SMPP_WORKER_PORT || 8080);
const apiToken = required("SMPP_WORKER_API_TOKEN");
const callbackUrl = required("SMPP_DLR_CALLBACK_URL");
const callbackSecret = required("SMPP_WORKER_CALLBACK_SECRET");
const host = required("SMPP_HOST");
const systemId = required("SMPP_SYSTEM_ID");
const password = required("SMPP_PASSWORD");
const smppPort = Number(process.env.SMPP_PORT || 2775);

let sessionPromise = null;
let session = null;

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith("replace_with_")) throw new Error(`${name} must be configured.`);
  return value;
}

function getSession() {
  if (session) return Promise.resolve(session);
  if (sessionPromise) return sessionPromise;

  sessionPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resetSession();
      reject(new Error("SMPP bind timed out"));
    }, Number(process.env.SMPP_BIND_TIMEOUT_MS || 30000));

    const nextSession = smpp.connect({
      url: `smpp://${host}:${smppPort}`,
      auto_enquire_link_period: Number(process.env.SMPP_ENQUIRE_LINK_MS || 10000),
      connectTimeout: Number(process.env.SMPP_CONNECT_TIMEOUT_MS || 30000),
      debug: process.env.SMPP_DEBUG === "true"
    }, () => {
      const bind = process.env.SMPP_BIND_TYPE === "transmitter"
        ? nextSession.bind_transmitter.bind(nextSession)
        : nextSession.bind_transceiver.bind(nextSession);
      bind({ system_id: systemId, password }, (pdu) => {
        clearTimeout(timeout);
        if (pdu.command_status === 0) {
          session = nextSession;
          resolve(nextSession);
          return;
        }
        resetSession();
        reject(new Error(`SMPP bind failed with command_status=${pdu.command_status ?? "unknown"}`));
      });
    });

    nextSession.on("deliver_sm", (pdu) => {
      void forwardDeliveryReceipt({
        providerMessageId: pdu.message_id ? String(pdu.message_id) : undefined,
        receiptedMessageId: pdu.receipted_message_id ? String(pdu.receipted_message_id) : undefined,
        messageState: pdu.message_state,
        shortMessage: normalizeShortMessage(pdu.short_message)
      });
      if (pdu.response) nextSession.send(pdu.response());
    });
    nextSession.on("enquire_link", (pdu) => { if (pdu.response) nextSession.send(pdu.response()); });
    nextSession.on("close", resetSession);
    nextSession.on("error", (error) => {
      resetSession();
      console.error("[SMPP worker] session error", error);
    });
  });
  return sessionPromise;
}

function resetSession() {
  session = null;
  sessionPromise = null;
}

async function submitMessage(to, message) {
  const activeSession = await getSession();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SMPP submit_sm timed out")), Number(process.env.SMPP_SUBMIT_TIMEOUT_MS || 30000));
    activeSession.submit_sm({
      source_addr: selectSourceAddress(to),
      source_addr_ton: Number(process.env.SMPP_SOURCE_ADDR_TON || 5),
      source_addr_npi: Number(process.env.SMPP_SOURCE_ADDR_NPI || 0),
      destination_addr: to,
      dest_addr_ton: Number(process.env.SMPP_DEST_ADDR_TON || 1),
      dest_addr_npi: Number(process.env.SMPP_DEST_ADDR_NPI || 1),
      registered_delivery: Number(process.env.SMPP_REGISTERED_DELIVERY || 1),
      short_message: message
    }, (pdu) => {
      clearTimeout(timeout);
      if (pdu.command_status === 0) {
        resolve(pdu.message_id ? String(pdu.message_id) : undefined);
      } else {
        reject(new Error(`SMPP submit_sm failed with command_status=${pdu.command_status ?? "unknown"}`));
      }
    });
  });
}

async function forwardDeliveryReceipt(receipt) {
  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${callbackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(receipt)
    });
    if (!response.ok) console.error(`[SMPP worker] DLR callback failed with HTTP ${response.status}`);
  } catch (error) {
    console.error("[SMPP worker] DLR callback failed", error);
  }
}

function normalizeShortMessage(value) {
  if (!value) return "";
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "object" && value.message) return Buffer.isBuffer(value.message) ? value.message.toString("utf8") : String(value.message);
  return String(value);
}

function selectSourceAddress(phone) {
  const prefix = String(phone).replace(/\D/g, "").slice(0, 5);
  const smartPrefixes = new Set(["63907", "63908", "63909", "63910", "63911", "63912", "63913", "63914", "63918", "63919", "63920", "63921", "63928", "63929", "63930", "63938", "63939", "63946", "63947", "63948", "63949", "63950", "63951", "63961", "63963", "63968", "63970", "63981", "63989", "63998", "63999"]);
  const globePrefixes = new Set(["63905", "63906", "63915", "63916", "63917", "63926", "63927", "63935", "63936", "63937", "63945", "63953", "63954", "63955", "63956", "63957", "63958", "63959", "63965", "63966", "63967", "63975", "63976", "63977", "63978", "63979", "63995", "63996", "63997"]);
  if (smartPrefixes.has(prefix) && process.env.SMPP_SOURCE_ADDR_SMART) return process.env.SMPP_SOURCE_ADDR_SMART;
  if (globePrefixes.has(prefix) && process.env.SMPP_SOURCE_ADDR_GLOBE) return process.env.SMPP_SOURCE_ADDR_GLOBE;
  return process.env.SMPP_SOURCE_ADDR || process.env.SMS_SENDER_ID || "QROAD";
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") return sendJson(response, 200, { ok: true, bound: Boolean(session) });
  if (request.method !== "POST" || request.url !== "/messages") return sendJson(response, 404, { error: "Not found" });
  if (request.headers.authorization !== `Bearer ${apiToken}`) return sendJson(response, 401, { error: "Unauthorized" });

  let body = "";
  request.on("data", (chunk) => { body += chunk; if (body.length > 20_000) request.destroy(); });
  request.on("end", async () => {
    try {
      const payload = JSON.parse(body);
      if (typeof payload.to !== "string" || typeof payload.message !== "string" || !payload.to || !payload.message) {
        return sendJson(response, 400, { success: false, error: "A recipient and message are required." });
      }
      const providerMessageId = await submitMessage(payload.to, payload.message);
      return sendJson(response, 200, { success: true, provider_message_id: providerMessageId });
    } catch (error) {
      return sendJson(response, 502, { success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}).listen(port, "0.0.0.0", () => console.log(`[SMPP worker] listening on port ${port}`));
