import { prisma } from "@/lib/prisma";
import { querySmppMessageState } from "@/lib/sms";

/** SMPP message_state values (SMPP v3.4 §5.2.28). */
const messageStates: Record<string, { label: string; final: boolean; delivered: boolean }> = {
  "1": { label: "ENROUTE", final: false, delivered: false },
  "2": { label: "DELIVRD", final: true, delivered: true },
  "3": { label: "EXPIRED", final: true, delivered: false },
  "4": { label: "DELETED", final: true, delivered: false },
  "5": { label: "UNDELIV", final: true, delivered: false },
  "6": { label: "ACCEPTD", final: true, delivered: true },
  "7": { label: "UNKNOWN", final: false, delivered: false },
  "8": { label: "REJECTD", final: true, delivered: false }
};

/**
 * Written on a message the provider will never report on, so the log stops implying a receipt
 * is still coming. It is NOT a claim that the message failed — only that its fate is unknown.
 */
export const noReceiptStatus = "NO_RECEIPT";

export type ReconcileResult = {
  checked: number;
  /** Settled to delivered/failed by an actual query_sm answer. */
  resolved: number;
  /** Given up on: too old, and the provider offers no way to find out. */
  markedNoReceipt: number;
  stillPending: number;
  errors: number;
  /** False when the SMSC ignores query_sm, as Bliply does. */
  querySupported: boolean;
};

/** Hours after which a message with no receipt is declared unknowable rather than pending. */
function receiptTimeoutHours() {
  const value = Number(process.env.SMS_RECEIPT_TIMEOUT_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 6;
}

/**
 * Resolves messages stuck at "pending receipt".
 *
 * Two mechanisms, because one provider is not like another:
 *
 * 1. Ask the SMSC with query_sm. Where it is supported, this settles the message properly.
 *
 * 2. Where it is NOT supported — Bliply simply ignores query_sm, and returns no delivery
 *    receipts at all (its own dashboard reports DLR 0%) — there is no receipt to be had, from
 *    any direction. Leaving the row at "pending" forever tells the operator a receipt is still
 *    coming when it never will. After SMS_RECEIPT_TIMEOUT_HOURS the row is marked NO_RECEIPT:
 *    an honest "we cannot know", not a false "delivered" and not a false "failed".
 *
 * The first query_sm timeout disables querying for the rest of the run, so an unsupporting
 * provider costs one timeout instead of one per message.
 */
export async function reconcilePendingSms(
  options: { minAgeMinutes?: number; limit?: number } = {}
): Promise<ReconcileResult> {
  const minAgeMinutes = options.minAgeMinutes ?? 10;
  const limit = Math.min(options.limit ?? 50, 200);
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000);
  const giveUpBefore = new Date(Date.now() - receiptTimeoutHours() * 60 * 60 * 1000);

  const pending = await prisma.smsLog.findMany({
    where: {
      deliveryStatus: null,
      providerMessageId: { not: null },
      provider: "smpp",
      sentAt: { lt: cutoff }
    },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: { id: true, phone: true, providerMessageId: true, sentAt: true }
  });

  const result: ReconcileResult = {
    checked: pending.length,
    resolved: 0,
    markedNoReceipt: 0,
    stillPending: 0,
    errors: 0,
    querySupported: true
  };

  for (const log of pending) {
    // Dry-run rows never reached the SMSC; there is nothing to ask about.
    if (!log.providerMessageId || log.providerMessageId.startsWith("dryrun_")) continue;

    if (result.querySupported) {
      const { state, error } = await querySmppMessageState(log.providerMessageId, log.phone);

      if (error) {
        // One timeout is enough to conclude the SMSC does not answer query_sm. Trying it on
        // every remaining message would stall the request for 15 seconds each.
        result.querySupported = false;
        result.errors += 1;
      } else if (state !== null) {
        const known = messageStates[String(state)];
        if (known?.final) {
          await prisma.smsLog.update({
            where: { id: log.id },
            data: {
              status: known.delivered ? "delivered" : "failed",
              deliveryStatus: known.label,
              deliveredAt: known.delivered ? new Date() : undefined,
              deliveryReceipt: `query_sm: message_state=${state} (${known.label})`
            }
          });
          result.resolved += 1;
          continue;
        }
        result.stillPending += 1;
        continue;
      }
    }

    // No answer available. If it is old enough, stop pretending one is coming.
    if (log.sentAt < giveUpBefore) {
      await prisma.smsLog.update({
        where: { id: log.id },
        data: {
          deliveryStatus: noReceiptStatus,
          deliveryReceipt: `No delivery receipt after ${receiptTimeoutHours()}h. The provider returned no receipt and does not answer query_sm, so the outcome cannot be confirmed either way.`
        }
      });
      result.markedNoReceipt += 1;
    } else {
      result.stillPending += 1;
    }
  }

  return result;
}
