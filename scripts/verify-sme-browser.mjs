/**
 * Browser-level acceptance check for SME Search.
 *
 * Prerequisite: `npm run dev` is serving this app on http://localhost:3000.
 * The script creates only the existing debug sample, forces SMS/email dry-run on, performs a
 * one-result Places search, captures desktop/mobile screenshots, sends one dry-run SMS and
 * one dry-run email from the captured SME profile, and verifies both history entries.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const outputDir = path.join(process.cwd(), "test-results", "sme-browser-verification");
fs.mkdirSync(outputDir, { recursive: true });

function readLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
}

function createAdminCookie(env) {
  const secret = env.SESSION_SECRET && env.SESSION_SECRET !== "replace_with_long_random_secret"
    ? env.SESSION_SECRET
    : "development-only-change-me";
  const payload = JSON.stringify({ role: "ADMIN", expiresAt: Date.now() + 60 * 60 * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${encoded}.${signature}`;
}

async function api(page, url, body) {
  const endpoint = new URL(url, baseUrl).toString();
  return page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, { url: endpoint, body });
}

const env = readLocalEnv();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

try {
  await context.addCookies([{ name: "office_admin_session", value: createAdminCookie(env), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  // Give browser-side fetches the application's origin before calling protected APIs.
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  const debug = await api(page, "/api/settings/debug", { emailDryRunEnabled: true, smsDryRunEnabled: true });
  if (debug.status !== 200) throw new Error(`Unable to enable safe dry-run mode (${debug.status}).`);

  const sample = await api(page, "/api/settings/debug/sample-lead", {});
  if (sample.status !== 200) throw new Error(`Unable to create the SME test sample (${sample.status}).`);

  await page.goto(`${baseUrl}/sme-search`, { waitUntil: "networkidle" });
  if (await page.getByText("SME Business Search").count() === 0) {
    throw new Error("SME Search is unavailable. Enable the feature flag before browser verification.");
  }

  await page.getByRole("button", { name: "Schedule search" }).click();
  const scheduledDialog = page.getByRole("dialog", { name: "Scheduled SME Search" });
  await scheduledDialog.waitFor({ state: "visible", timeout: 10000 });
  const scheduledFooterButtons = await scheduledDialog.locator(".compose-modal-actions button").allTextContents();
  if (scheduledFooterButtons.join("|") !== "Cancel|Run now|Save schedule") {
    throw new Error(`Scheduled-search footer order is incorrect: ${scheduledFooterButtons.join(" | ")}`);
  }
  await page.screenshot({ path: path.join(outputDir, "scheduled-search-actions.png"), fullPage: true });
  await page.getByRole("button", { name: "Close scheduled search" }).click();

  // One result keeps the production Places verification inexpensive while still testing the
  // actual UI → server route → Google adapter path.
  await page.locator("label:has-text('Search mode') select").selectOption("FREE_TEXT");
  await page.getByLabel("Keyword").fill("cafe in Makati");
  await page.getByLabel("Max results").fill("1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".loading-modal").waitFor({ state: "detached", timeout: 30000 }).catch(() => undefined);
  if (await page.locator(".sme-send-error").count()) {
    throw new Error(`Places search failed: ${await page.locator(".sme-send-error").first().innerText()}`);
  }
  await page.screenshot({ path: path.join(outputDir, "desktop-search.png"), fullPage: true });

  await page.getByRole("button", { name: "Sort by business" }).click();
  const businessSortState = await page.locator(".sme-results-table thead th").nth(1).getAttribute("aria-sort");
  if (businessSortState !== "ascending") throw new Error(`Business sorting did not activate (received ${businessSortState}).`);

  await page.getByRole("button", { name: "Show filters" }).click();
  await page.getByRole("heading", { name: "SME table filters" }).waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: path.join(outputDir, "desktop-table-filters.png"), fullPage: true });
  await page.getByRole("button", { name: "Close SME table filters" }).click();

  await page.locator(".sme-results-table tbody tr.clickable-row").first().click();
  await page.locator(".sme-detail-modal").waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: path.join(outputDir, "desktop-result-detail.png"), fullPage: true });
  await page.locator(".sme-detail-modal .compose-modal-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: path.join(outputDir, "desktop-result-detail-footer.png"), fullPage: true });
  await page.getByRole("button", { name: "Close details" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "mobile-search.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.reload({ waitUntil: "networkidle" });
  const sampleRow = page.locator("tr", { hasText: "Jirald Sample Cafe" }).first();
  await sampleRow.waitFor({ state: "visible", timeout: 15000 });
  await sampleRow.getByLabel("Select Jirald Sample Cafe").click();
  await page.getByRole("button", { name: /Compose SMS \(1\)/ }).click();
  await page.getByRole("dialog", { name: "Send SMS" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Send SMS to 1 recipient" }).click();
  await page.getByText(/Sent 1 SMS/).waitFor({ state: "visible", timeout: 15000 });

  await page.goto(`${baseUrl}/sms-log`, { waitUntil: "networkidle" });
  await page.getByText("Jirald Sample Cafe").first().waitFor({ state: "visible", timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, "sms-history.png"), fullPage: true });

  await page.goto(`${baseUrl}/sme-search`, { waitUntil: "networkidle" });
  const emailSampleRow = page.locator("tr", { hasText: "Jirald Sample Cafe" }).first();
  await emailSampleRow.waitFor({ state: "visible", timeout: 15000 });
  await emailSampleRow.getByLabel("Select Jirald Sample Cafe").click();
  await page.getByRole("button", { name: /Compose Email \(1\)/ }).click();
  await page.getByRole("dialog", { name: "Compose Email" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Send Email to 1" }).click();
  await page.getByText(/Sent 1 email/).waitFor({ state: "visible", timeout: 15000 });

  await page.goto(`${baseUrl}/email-log`, { waitUntil: "networkidle" });
  await page.getByText("Jirald Sample Cafe").first().waitFor({ state: "visible", timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, "email-history.png"), fullPage: true });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Recent SME leads" }).waitFor({ state: "visible", timeout: 15000 });
  await page.screenshot({ path: path.join(outputDir, "dashboard-recent-sme-leads.png"), fullPage: true });

  console.log(JSON.stringify({
    verified: true,
    flow: "Google Places search → captured SME result → SMS/email composers → dry-run sends → SMS/email history",
    screenshots: ["scheduled-search-actions.png", "desktop-search.png", "desktop-table-filters.png", "desktop-result-detail.png", "desktop-result-detail-footer.png", "mobile-search.png", "sms-history.png", "email-history.png", "dashboard-recent-sme-leads.png"],
    outputDir
  }));
} finally {
  await browser.close();
}
