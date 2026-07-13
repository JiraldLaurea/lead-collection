import { describe, expect, it } from "vitest";
import { parseFranchiseCsv } from "@/lib/sme/franchise-import";
import { normalizeBusinessName, normalizeWebsiteHost } from "@/lib/sme/normalize-name";
import { parseSearchZoneCsv } from "@/lib/sme/zone-import";

describe("business name normalization", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalizeBusinessName("ABC Café – BGC")).toBe("abc cafe bgc");
    expect(normalizeBusinessName("ABC CAFE MAKATI")).toBe("abc cafe makati");
    expect(normalizeBusinessName("A & S Café")).toBe("a and s cafe");
  });

  it("collapses apostrophes so McDonald's matches McDonalds", () => {
    expect(normalizeBusinessName("McDonald's")).toBe("mcdonalds");
    expect(normalizeBusinessName("McDonalds")).toBe("mcdonalds");
    expect(normalizeBusinessName("McDonald’s")).toBe("mcdonalds");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeBusinessName("  Jollibee   Foods  ")).toBe("jollibee foods");
  });
});

describe("website host normalization", () => {
  it("reduces a URL to a bare comparable host", () => {
    expect(normalizeWebsiteHost("https://www.Jollibee.com.ph/menu?x=1")).toBe("jollibee.com.ph");
    expect(normalizeWebsiteHost("jollibee.com.ph")).toBe("jollibee.com.ph");
  });

  it("returns null for junk rather than a misleading host", () => {
    expect(normalizeWebsiteHost("")).toBeNull();
    expect(normalizeWebsiteHost(null)).toBeNull();
    expect(normalizeWebsiteHost("not a url at all")).toBeNull();
    expect(normalizeWebsiteHost("javascript:alert(1)")).toBeNull();
  });
});

describe("search zone CSV import", () => {
  const header = "City,Commercial Area,Road Name,Latitude,Longitude,Default Radius m,Priority,Enabled";

  it("parses a valid zone row", () => {
    const { zones, errors } = parseSearchZoneCsv(
      [header, "Paranaque,BF Homes,Aguirre Avenue,14.4690,121.0180,500,A,true"].join("\n")
    );

    expect(errors).toEqual([]);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      city: "Paranaque",
      commercialArea: "BF Homes",
      roadName: "Aguirre Avenue",
      latitude: 14.469,
      longitude: 121.018,
      radiusMeters: 500,
      priority: "A",
      enabled: true
    });
  });

  it("allows a zone with no coordinates (it falls back to Text Search)", () => {
    const { zones, errors } = parseSearchZoneCsv([header, "Makati,Poblacion,Makati Avenue,,,,A+,"].join("\n"));

    expect(errors).toEqual([]);
    expect(zones[0]).toMatchObject({
      latitude: null,
      longitude: null,
      radiusMeters: 500,
      priority: "A+",
      enabled: true
    });
  });

  it("rejects a half-supplied coordinate pair", () => {
    const { zones, errors } = parseSearchZoneCsv([header, "Makati,Poblacion,Makati Avenue,14.5,,500,A,true"].join("\n"));

    expect(zones).toHaveLength(0);
    expect(errors[0]).toMatchObject({ row: 2, message: "Latitude and longitude must be provided together" });
  });

  it("reports row-level errors without discarding the good rows", () => {
    const { zones, errors } = parseSearchZoneCsv(
      [
        header,
        "Makati,Poblacion,Makati Avenue,14.5647,121.0294,400,A+,true",
        ",BF Homes,Aguirre Avenue,,,500,A,true",
        "Pasig,Kapitolyo,East Capitol Drive,999,121.06,450,A,true",
        "Taguig,BGC,28th Street,14.55,121.04,10,A,true",
        "San Juan,Greenhills,Wilson Street,,,500,Z,true"
      ].join("\n")
    );

    expect(zones).toHaveLength(1);
    expect(zones[0].city).toBe("Makati");
    expect(errors).toEqual([
      { row: 3, message: "City and Road Name are required" },
      { row: 4, message: 'Invalid latitude "999"' },
      { row: 5, message: 'Invalid radius "10" (expected 50-50000 m)' },
      { row: 6, message: 'Invalid priority "Z" (expected A+, A, B+, B or C)' }
    ]);
  });

  it("flags duplicate zones inside the same file", () => {
    const { zones, errors } = parseSearchZoneCsv(
      [
        header,
        "Makati,Poblacion,Makati Avenue,14.5,121.0,400,A,true",
        "makati,poblacion,makati avenue,14.5,121.0,400,A,true"
      ].join("\n")
    );

    expect(zones).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate zone in file");
  });

  it("treats enabled=false as disabled", () => {
    const { zones } = parseSearchZoneCsv([header, "Makati,Poblacion,Makati Avenue,,,500,A,false"].join("\n"));
    expect(zones[0].enabled).toBe(false);
  });

  it("throws when the header row is missing", () => {
    expect(() => parseSearchZoneCsv("a,b,c\n1,2,3")).toThrow(/header row/i);
  });
});

describe("franchise brand CSV import", () => {
  const header = "Canonical Name,Aliases,Official Domains,Category,Scope,Classification,Active,Notes";

  it("normalizes the brand name and every alias for matching", () => {
    const { brands, errors } = parseFranchiseCsv(
      [header, "McDonald's,McDonalds;McDo,mcdonalds.com.ph,Restaurant,GLOBAL,KNOWN_FRANCHISE,true,"].join("\n")
    );

    expect(errors).toEqual([]);
    expect(brands[0]).toMatchObject({
      canonicalName: "McDonald's",
      normalizedName: "mcdonalds",
      aliases: "McDonalds;McDo",
      classification: "KNOWN_FRANCHISE",
      active: true
    });
    // The canonical name is always part of the match set, deduplicated.
    expect(brands[0].normalizedAliases.split(";")).toEqual(["mcdonalds", "mcdo"]);
  });

  it("normalizes official domains to bare hosts", () => {
    const { brands } = parseFranchiseCsv(
      [header, "Jollibee,,https://www.jollibee.com.ph/;jollibee.com,Restaurant,PH,KNOWN_FRANCHISE,true,"].join("\n")
    );
    expect(brands[0].officialDomains).toBe("jollibee.com.ph;jollibee.com");
  });

  it("rejects an unknown classification", () => {
    const { brands, errors } = parseFranchiseCsv(
      [header, "Some Brand,,,Restaurant,PH,NOT_A_CLASS,true,"].join("\n")
    );
    expect(brands).toHaveLength(0);
    expect(errors[0].message).toContain("Invalid classification");
  });

  it("requires a canonical name", () => {
    const { brands, errors } = parseFranchiseCsv([header, ",alias,,Restaurant,PH,KNOWN_FRANCHISE,true,"].join("\n"));
    expect(brands).toHaveLength(0);
    expect(errors[0].message).toBe("Canonical Name is required");
  });

  it("flags duplicate brands that normalize to the same name", () => {
    const { brands, errors } = parseFranchiseCsv(
      [header, "McDonald's,,,Restaurant,GLOBAL,KNOWN_FRANCHISE,true,", "McDonalds,,,Restaurant,GLOBAL,KNOWN_FRANCHISE,true,"].join("\n")
    );

    expect(brands).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate brand in file");
  });

  it("defaults classification, scope and active when the columns are blank", () => {
    const { brands } = parseFranchiseCsv([header, "Some Brand,,,,,,,"].join("\n"));
    expect(brands[0]).toMatchObject({ classification: "KNOWN_FRANCHISE", scope: "PH", active: true });
  });
});
