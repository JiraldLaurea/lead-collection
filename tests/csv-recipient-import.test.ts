import { describe, expect, it } from "vitest";
import { importCsvRecipientsWithNames } from "@/lib/csv-recipient-import";

describe("SMS CSV recipient import", () => {
  it("pairs SME business names with phone numbers, including quoted names", () => {
    const csv = [
      "business_name,phone,email",
      '"Acme, Inc.",09171234567,hello@acme.test',
      "Cafe Two,09181234567,"
    ].join("\n");

    expect(importCsvRecipientsWithNames(csv, ["phone", "phone_number"])).toEqual({
      recipients: [
        { name: "Acme, Inc.", value: "09171234567" },
        { name: "Cafe Two", value: "09181234567" }
      ],
      error: null
    });
  });

  it("still imports a phone-only CSV when no business name column is present", () => {
    expect(importCsvRecipientsWithNames("phone\n09171234567", ["phone"])).toEqual({
      recipients: [{ value: "09171234567" }],
      error: null
    });
  });
});
