import { describe, expect, it } from "vitest";
import { parseCsvLeads } from "../lib/csv-import";

describe("CSV lead imports", () => {
  it("finds a header below title rows and handles quoted commas", () => {
    const csv = [
      "Client CRM,,,,",
      "Instructions,,,,",
      "Client ID,Business Name,City/Area,Phone,Email",
      'CL-1,"Acme, Inc.","BGC, Taguig",09171234567,hello@acme.test'
    ].join("\r\n");

    const result = parseCsvLeads(csv);

    expect(result.headerRow).toBe(3);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      clientId: "CL-1",
      businessName: "Acme, Inc.",
      cityArea: "BGC, Taguig",
      phoneNumber: "09171234567"
    });
  });

  it("uses the first valid address from a multi-email cell", () => {
    const csv = 'Business Name,Email\nAcme,"invalid; sales@acme.test; owner@acme.test"';
    expect(parseCsvLeads(csv).leads[0].email).toBe("sales@acme.test");
  });
});
