import crypto from "node:crypto";
import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { recordSmsDeliveryReceipt } from "@/lib/sms-delivery-receipts";

export const runtime = "nodejs";

const receiptSchema = z.object({
  providerMessageId: z.string().trim().optional(),
  receiptedMessageId: z.string().trim().optional(),
  messageState: z.union([z.string(), z.number()]).optional(),
  shortMessage: z.string().optional()
});

function authorized(request: Request) {
  const secret = process.env.SMPP_WORKER_CALLBACK_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !provided) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(provided);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return fail("E-SMS-DLR-01", "Unauthorized delivery receipt", 401);

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SMS-DLR-02", "Invalid delivery receipt", 400, parsed.error.flatten());

  await recordSmsDeliveryReceipt(parsed.data);
  return ok({ received: true });
}
