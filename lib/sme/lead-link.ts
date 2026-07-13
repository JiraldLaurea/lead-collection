/**
 * Google-sourced leads are stored in the existing `leads` table with a prefixed place ID,
 * mirroring the `serper:` prefix the existing Search Collection page already writes. The
 * two discovery paths therefore coexist in one table without colliding, and a lead's origin
 * is readable from its key.
 */
export const googleLeadPrefix = "google:";

export function toLeadPlaceId(providerPlaceId: string) {
  return `${googleLeadPrefix}${providerPlaceId.replace(/^places\//, "")}`;
}

export function isGoogleLeadPlaceId(placeId: string) {
  return placeId.startsWith(googleLeadPrefix);
}
