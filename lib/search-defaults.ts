export const fixedSearchCities = ["Pasig", "Mandaluyong", "Makati", "Taguig"] as const;

export const petClinicKeywords = [
  "pet clinic",
  "veterinary clinic",
  "animal clinic"
] as const;

export const skinClinicKeywords = [
  "skin clinic",
  "dermatology clinic",
  "aesthetic clinic"
] as const;

export const defaultClinicKeywords = [
  ...petClinicKeywords,
  ...skinClinicKeywords
] as const;
