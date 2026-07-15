export const runtime = "nodejs";

import { z } from "zod";
import { normalizePhilippineMobileNumber } from "@/lib/export";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

const createSchema = z.object({
  contact: z.string().trim().min(1).max(254).optional(),
  // Retained for existing Settings clients during the transition to multi-channel DNC.
  phoneNumber: z.string().trim().min(1).max(40).optional(),
  channel: z.enum(["sms", "email"]).default("sms"),
  reason: z.string().trim().max(240).optional()
}).refine((value) => Boolean(value.contact || value.phoneNumber), { message: "Enter a phone number or email address." });

const removeSchema = z.object({
  id: z.number().int().positive()
});

const entrySelect = {
  id: true,
  normalizedContact: true,
  channel: true,
  reason: true,
  source: true,
  createdAt: true
} as const;

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-DNC-01", "Enter a valid phone number or email address.", 400, parsed.error.flatten());

  const rawContact = parsed.data.contact ?? parsed.data.phoneNumber ?? "";
  const normalizedContact = parsed.data.channel === "sms"
    ? normalizePhilippineMobileNumber(rawContact)
    : rawContact.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!normalizedContact || (parsed.data.channel === "email" && !validEmail.test(normalizedContact))) {
    return fail("E-DNC-02", parsed.data.channel === "sms" ? "Enter a valid Philippine mobile number." : "Enter a valid email address.", 400);
  }

  const reason = parsed.data.reason || null;
  const entry = await prisma.doNotContact.upsert({
    where: {
      normalizedContact_channel: {
        normalizedContact,
        channel: parsed.data.channel
      }
    },
    create: {
      normalizedContact,
      channel: parsed.data.channel,
      reason,
      source: "settings_ui",
      active: true
    },
    update: {
      reason,
      source: "settings_ui",
      active: true
    },
    select: entrySelect
  });

  return ok(entry);
}

export async function DELETE(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-DNC-03", "Invalid Do Not Contact entry.", 400, parsed.error.flatten());

  const result = await prisma.doNotContact.updateMany({
    where: { id: parsed.data.id, active: true },
    data: { active: false }
  });
  if (result.count === 0) return fail("E-DNC-04", "That Do Not Contact entry is no longer active.", 404);

  return ok({ id: parsed.data.id });
}
