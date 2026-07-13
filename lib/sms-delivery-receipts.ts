import { prisma } from "@/lib/prisma";

export type SmsDeliveryReceiptInput = {
  providerMessageId?: string | null;
  messageState?: number | string | null;
  shortMessage?: unknown;
  receiptedMessageId?: string | Buffer | null;
};

type ParsedDeliveryReceipt = {
  providerMessageId: string;
  deliveryStatus: string;
  deliveryError?: string | null;
  rawReceipt: string;
};

const deliveredStates = new Set(["DELIVRD", "DELIVERED", "2"]);
const failedStates = new Set(["UNDELIV", "UNDELIVERABLE", "REJECTD", "REJECTED", "EXPIRED", "DELETED", "3", "4", "5", "8"]);

export async function recordSmsDeliveryReceipt(input: SmsDeliveryReceiptInput) {
  const receipt = parseSmsDeliveryReceipt(input);
  if (!receipt?.providerMessageId) return;

  const statusUpdate = deliveredStates.has(receipt.deliveryStatus)
    ? "delivered"
    : failedStates.has(receipt.deliveryStatus)
      ? "failed"
      : undefined;

  await prisma.smsLog.updateMany({
    where: { providerMessageId: receipt.providerMessageId },
    data: {
      ...(statusUpdate ? { status: statusUpdate } : {}),
      deliveryStatus: receipt.deliveryStatus,
      deliveryError: receipt.deliveryError,
      deliveryReceipt: receipt.rawReceipt,
      deliveredAt: deliveredStates.has(receipt.deliveryStatus) ? new Date() : undefined,
    }
  });
}

function parseSmsDeliveryReceipt(input: SmsDeliveryReceiptInput): ParsedDeliveryReceipt | null {
  const rawReceipt = normalizeShortMessage(input.shortMessage);
  const fields = parseReceiptFields(rawReceipt);
  const providerMessageId = normalizeReceiptValue(
    input.receiptedMessageId ?? input.providerMessageId ?? fields.id ?? fields.message_id
  );
  const deliveryStatus = normalizeReceiptValue(input.messageState ?? fields.stat ?? fields.state ?? fields.message_state)
    ?.toUpperCase();
  const deliveryError = normalizeReceiptValue(fields.err ?? fields.error);

  if (!providerMessageId || !deliveryStatus) return null;

  return {
    providerMessageId,
    deliveryStatus,
    deliveryError,
    rawReceipt,
  };
}

function normalizeShortMessage(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Buffer.isBuffer(message)) return message.toString("utf8");
  }
  return String(value);
}

function parseReceiptFields(rawReceipt: string) {
  const fields: Record<string, string> = {};
  const matches = rawReceipt.matchAll(/([a-zA-Z_]+):\s*([^\s]+)/g);
  for (const match of matches) {
    fields[match[1].toLowerCase()] = match[2];
  }
  return fields;
}

function normalizeReceiptValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value).trim() || null;
}
