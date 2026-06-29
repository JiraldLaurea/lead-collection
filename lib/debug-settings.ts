import { prisma } from "@/lib/prisma";

export const debugEmailDryRunSettingKey = "debug_email_dry_run";
export const debugSmsDryRunSettingKey = "debug_sms_dry_run";

export type DebugSettings = {
  emailDryRunEnabled: boolean;
  smsDryRunEnabled: boolean;
};

export async function getDebugSettings(): Promise<DebugSettings> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [debugEmailDryRunSettingKey, debugSmsDryRunSettingKey] } }
  });

  const valueOf = (key: string) => settings.find((setting) => setting.key === key)?.value;

  return {
    emailDryRunEnabled: valueOf(debugEmailDryRunSettingKey) === "true",
    smsDryRunEnabled: valueOf(debugSmsDryRunSettingKey) === "true"
  };
}

export async function saveDebugSettings(input: DebugSettings) {
  await prisma.appSetting.upsert({
    where: { key: debugEmailDryRunSettingKey },
    create: { key: debugEmailDryRunSettingKey, value: input.emailDryRunEnabled ? "true" : "false" },
    update: { value: input.emailDryRunEnabled ? "true" : "false" }
  });

  await prisma.appSetting.upsert({
    where: { key: debugSmsDryRunSettingKey },
    create: { key: debugSmsDryRunSettingKey, value: input.smsDryRunEnabled ? "true" : "false" },
    update: { value: input.smsDryRunEnabled ? "true" : "false" }
  });

  return input;
}
