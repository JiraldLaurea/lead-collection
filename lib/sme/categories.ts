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
 * Default mapping from work order 3.2 and Appendix B. Phase 6 makes this
 * administrator-editable; nothing outside this file should hard-code a Google place type.
 */
export const smeCategories: SmeCategory[] = [
  { key: "restaurant", label: "Restaurant", priority: "A", googleTypes: ["restaurant"], textQuery: "restaurant" },
  { key: "cafe", label: "Cafe", priority: "A", googleTypes: ["cafe", "coffee_shop"], textQuery: "cafe" },
  { key: "bakery", label: "Bakery", priority: "A", googleTypes: ["bakery"], textQuery: "bakery" },
  { key: "beauty_salon", label: "Beauty Salon", priority: "A", googleTypes: ["beauty_salon"], textQuery: "beauty salon" },
  { key: "hair_salon", label: "Hair Salon", priority: "A", googleTypes: ["hair_salon"], textQuery: "hair salon" },
  { key: "spa", label: "Spa", priority: "A", googleTypes: ["spa"], textQuery: "spa" },
  { key: "skin_clinic", label: "Skin Care Clinic", priority: "A", googleTypes: [], textQuery: "skin clinic dermatology" },
  { key: "dental_clinic", label: "Dental Clinic", priority: "A", googleTypes: ["dentist"], textQuery: "dental clinic" },
  { key: "veterinary_clinic", label: "Veterinary Clinic", priority: "A", googleTypes: ["veterinary_care"], textQuery: "veterinary clinic" },
  { key: "gym", label: "Gym / Fitness Center", priority: "A", googleTypes: ["gym", "fitness_center"], textQuery: "gym fitness center" },

  { key: "boutique", label: "Boutique", priority: "B", googleTypes: ["clothing_store"], textQuery: "boutique clothing store" },
  { key: "pet_shop", label: "Pet Shop", priority: "B", googleTypes: ["pet_store"], textQuery: "pet shop" },
  { key: "boutique_hotel", label: "Boutique Hotel", priority: "B", googleTypes: ["hotel"], textQuery: "boutique hotel" },
  { key: "tutorial_center", label: "Tutorial Center", priority: "B", googleTypes: [], textQuery: "tutorial center" },
  { key: "language_school", label: "Language School", priority: "B", googleTypes: [], textQuery: "language school" },
  { key: "auto_detailing", label: "Auto Detailing", priority: "B", googleTypes: ["car_wash"], textQuery: "auto detailing car wash" },
  { key: "car_repair", label: "Car Repair", priority: "B", googleTypes: ["car_repair"], textQuery: "car repair shop" },
  { key: "event_supplier", label: "Event Supplier", priority: "B", googleTypes: [], textQuery: "event supplier" },
  { key: "photography_studio", label: "Photography Studio", priority: "B", googleTypes: [], textQuery: "photography studio" },
  { key: "furniture_store", label: "Furniture / Interior Store", priority: "B", googleTypes: ["furniture_store"], textQuery: "furniture interior store" },

  { key: "accounting_firm", label: "Accounting Firm", priority: "C", googleTypes: ["accounting"], textQuery: "accounting firm" },
  { key: "law_office", label: "Law Office", priority: "C", googleTypes: ["lawyer"], textQuery: "law office" },
  { key: "property_broker", label: "Property Broker", priority: "C", googleTypes: ["real_estate_agency"], textQuery: "property broker" },
  { key: "recruitment_agency", label: "Recruitment Agency", priority: "C", googleTypes: [], textQuery: "recruitment agency" },
  { key: "small_bpo", label: "Small BPO", priority: "C", googleTypes: [], textQuery: "BPO office" },
  { key: "business_consulting", label: "Business Consulting", priority: "C", googleTypes: [], textQuery: "business consulting" }
];

export function findSmeCategory(key?: string) {
  if (!key) return undefined;
  return smeCategories.find((category) => category.key === key);
}
