import nodemailer from "nodemailer";

type LeadEmailInput = {
  businessName: string;
  email: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

type ManualEmailInput = {
  email: string;
  subject: string;
  body: string;
  attachments?: LeadEmailInput["attachments"];
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getTransporter() {
  const host = requiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const user = requiredEnv("SMTP_USER");
  const pass = requiredEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function buildLeadEmailBody(businessName: string) {
  return [
    `Hello ${businessName},`,
    "",
    "I hope you are doing well.",
    "",
    "We are reaching out to introduce our company and explore whether our services may be useful for your business. We would be happy to learn more about your needs and share how we may be able to help.",
    "",
    "Please let us know if you are open to a quick conversation.",
    "",
    "Thank you,"
  ].join("\n");
}

export function buildLeadEmailSubject(businessName: string) {
  return `Business Opportunity - ${businessName}`;
}

function applyLeadTemplate(template: string, businessName: string) {
  return template.replace(/\[business_name\]/gi, businessName);
}

export function buildLeadEmailContent(lead: Pick<LeadEmailInput, "businessName" | "subjectTemplate" | "bodyTemplate">) {
  const subject = lead.subjectTemplate
    ? applyLeadTemplate(lead.subjectTemplate, lead.businessName)
    : buildLeadEmailSubject(lead.businessName);
  const body = lead.bodyTemplate
    ? applyLeadTemplate(lead.bodyTemplate, lead.businessName)
    : buildLeadEmailBody(lead.businessName);

  return { subject, body };
}

export async function sendLeadEmail(lead: LeadEmailInput) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME;
  const fromAddress = fromName && from ? `"${fromName}" <${from}>` : from;
  const { subject, body } = buildLeadEmailContent(lead);

  await transporter.sendMail({
    from: fromAddress,
    to: lead.email,
    subject,
    text: body,
    attachments: lead.attachments
  });

  return { subject, body };
}

export async function sendManualEmail(message: ManualEmailInput) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME;
  const fromAddress = fromName && from ? `"${fromName}" <${from}>` : from;

  await transporter.sendMail({
    from: fromAddress,
    to: message.email,
    subject: message.subject,
    text: message.body,
    attachments: message.attachments
  });

  return { subject: message.subject, body: message.body };
}
