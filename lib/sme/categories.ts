export type CategoryPriority = "A" | "B" | "C";

export type SmeCategory = {
  key: string;
  label: string;
  priority: CategoryPriority;
  /**
   * Google place types for Nearby Search `includedTypes`. Empty when Google has no
   * matching type — those categories fall back to Text Search with `textQuery`.
   */
  googleTypes: string[];
  /** Used to build a Text Search query when googleTypes is empty or the mode is text-based. */
  textQuery: string;
};

/**
 * The four SME categories the business targets. Nothing outside this file should hard-code a
 * Google place type. Cafe/Restaurant is a single category spanning both Google types; Skin Clinic
 * has no Google place type and so falls back to Text Search (see lib/sme/search.ts).
 */
export const smeCategories: SmeCategory[] = [
  { key: "cafe_resto", label: "Cafe / Restaurant", priority: "A", googleTypes: ["cafe", "coffee_shop", "restaurant"], textQuery: "cafe restaurant" },
  { key: "skin_clinic", label: "Skin Clinic", priority: "A", googleTypes: [], textQuery: "skin clinic dermatology" },
  { key: "dental_clinic", label: "Dental Clinic", priority: "A", googleTypes: ["dentist"], textQuery: "dental clinic" },
  { key: "pet_clinic", label: "Pet Clinic", priority: "A", googleTypes: ["veterinary_care"], textQuery: "veterinary clinic" }
];

/** Keys of every SME category, in display order. */
export const smeCategoryKeys = smeCategories.map((category) => category.key);

export function findSmeCategory(key?: string) {
  if (!key) return undefined;
  return smeCategories.find((category) => category.key === key);
}
