import { describe, expect, it } from "vitest";
import { measureSms } from "@/lib/sms-length";
import { defaultSmsBodyTemplate } from "@/lib/sms-template-defaults";

describe("SMS length and segments", () => {
  it("counts a plain message as a single GSM-7 segment", () => {
    expect(measureSms("Hello there")).toMatchObject({
      encoding: "GSM-7",
      characters: 11,
      segments: 1,
      remaining: 149
    });
  });

  it("treats an empty message as zero segments", () => {
    expect(measureSms("")).toMatchObject({ characters: 0, segments: 0 });
  });

  it("fits exactly 160 GSM characters in one segment", () => {
    const result = measureSms("a".repeat(160));
    expect(result).toMatchObject({ segments: 1, remaining: 0 });
  });

  it("splits at 161 characters, where each segment drops to 153", () => {
    expect(measureSms("a".repeat(161)).segments).toBe(2);
    expect(measureSms("a".repeat(306)).segments).toBe(2);
    expect(measureSms("a".repeat(307)).segments).toBe(3);
  });

  it("charges GSM extended characters as two", () => {
    // A single "€" occupies two GSM characters because it needs an escape sequence.
    expect(measureSms("€")).toMatchObject({ encoding: "GSM-7", characters: 2 });
    expect(measureSms("{}")).toMatchObject({ encoding: "GSM-7", characters: 4 });
  });

  it("drops to UCS-2 and 70 characters when a single non-GSM character appears", () => {
    // A curly apostrophe is the classic accident: pasted from Word, halves the limit.
    const result = measureSms("It’s a deal");
    expect(result.encoding).toBe("UCS-2");
    expect(result.segments).toBe(1);
    expect(result.remaining).toBe(70 - "It’s a deal".length);
  });

  it("splits UCS-2 messages at 70, then 67 per segment", () => {
    expect(measureSms(`${"a".repeat(69)}’`).segments).toBe(1);
    expect(measureSms(`${"a".repeat(70)}’`).segments).toBe(2);
  });

  it("treats an emoji as UCS-2", () => {
    expect(measureSms("Hi 👋").encoding).toBe("UCS-2");
  });

  it("keeps the shipped default template inside one GSM segment", () => {
    const rendered = defaultSmsBodyTemplate.split("[business_name]").join("Aguirre Garden Cafe");
    const result = measureSms(rendered);
    expect(result.encoding).toBe("GSM-7");
    expect(result.segments).toBe(1);
  });
});
