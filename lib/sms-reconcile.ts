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

export type ReconcileResult = {
  checked: number;
  resolved: number;
  stillPending: number;
  errors: number;
};

/**
 * Resolves messages stuck at "pending receipt" by asking the SMSC what happened to them.
 *
 * The app only ever learned a message's fate from a deliver_sm the provider pushed to it. If
 * the provider never sends one — or it arrives while the process is restarting — the row sits
 * at "pending" forever, and there is no way to ever find out. This pulls the state instead of
 * waiting for it.
 *
 * Only messages older than `minAgeMinutes` are checked: a receipt can legitimately take
 * half an hour on some routes, and querying immediately would just return ENROUTE.
 */
export async function reconcilePendingSms(options: { minAgeMinutes?: number; limit?: number } = {}): Promise<ReconcileResult> {
  const minAgeMinutes = options.minAgeMinutes ?? 10;
  const limit = Math.min(options.limit ?? 50, 200);
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000);

  const pending = await prisma.smsLog.findMany({
    where: {
      deliveryStatus: null,
      providerMessageId: { not: null },
      provider: "smpp",
      sentAt: { lt: cutoff }
    },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: { id: true, phone: true, providerMessageId: true }
  });

  const result: ReconcileResult = { checked: pending.length, resolved: 0, stillPending: 0, errors: 0 };

  for (const log of pending) {
    // Dry-run rows never reached the SMSC; there is nothing to ask about.
    if (!log.providerMessageId || log.providerMessageId.startsWith("dryrun_")) continue;

    const { state, error } = await querySmppMessageState(log.providerMessageId, log.phone);

    if (error || state === null) {
      result.errors += 1;
      continue;
    }

    const key = String(state);
    const known = messageStates[key];

    if (!known?.final) {
      result.stillPending += 1;
      continue;
    }

    await prisma.smsLog.update({
      where: { id: log.id },
      data: {
        status: known.delivered ? "delivered" : "failed",
        deliveryStatus: known.label,
        deliveredAt: known.delivered ? new Date() : undefined,
        deliveryReceipt: `query_sm: message_state=${key} (${known.label})`
      }
    });
    result.resolved += 1;
  }

  return result;
}
