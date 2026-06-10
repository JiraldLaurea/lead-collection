import { prisma } from "@/lib/prisma";

export const debugEmailDryRunSettingKey = "debug_email_dry_run";

export type DebugSettings = {
  emailDryRunEnabled: boolean;
};

export async function getDebugSettings(): Promise<DebugSettings> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: debugEmailDryRunSettingKey }
  });

  return {
    emailDryRunEnabled: setting?.value === "true"
  };
}

export async function saveDebugSettings(input: DebugSettings) {
  await prisma.appSetting.upsert({
    where: { key: debugEmailDryRunSettingKey },
    create: { key: debugEmailDryRunSettingKey, value: input.emailDryRunEnabled ? "true" : "false" },
    update: { value: input.emailDryRunEnabled ? "true" : "false" }
  });

  return input;
}
