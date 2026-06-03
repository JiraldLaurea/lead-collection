import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { sendLeadEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

const requestSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(50),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const body = requestSchema.safeParse(await request.json());
  if (!body.success) return fail("E-EMAIL-01", "Invalid email request", 400, body.error.flatten());

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: body.data.leadIds },
      email: { not: null }
    },
    select: {
      id: true,
      businessName: true,
      email: true
    }
  });

  if (leads.length === 0) return fail("E-EMAIL-02", "No selected leads have an email address", 400);

  const results = [];
  for (const lead of leads) {
    if (!lead.email) continue;
    try {
      await sendLeadEmail({
        businessName: lead.businessName,
        email: lead.email,
        subjectTemplate: body.data.subject,
        bodyTemplate: body.data.body
      });
      results.push({ id: lead.id, email: lead.email, sent: true });
    } catch (error) {
      results.push({
        id: lead.id,
        email: lead.email,
        sent: false,
        error: error instanceof Error ? error.message : "Unable to send email"
      });
    }
  }

  const sent = results.filter((result) => result.sent).length;
  const failed = results.length - sent;
  if (sent === 0) return fail("E-EMAIL-03", "Email sending failed", 500, results);

  return ok({ sent, failed, results });
}
