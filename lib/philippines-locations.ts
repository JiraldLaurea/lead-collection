export const philippinesLocations = {
  NCR: [
    "Caloocan",
    "Las Pinas",
    "Makati",
    "Malabon",
    "Mandaluyong",
    "Manila",
    "Marikina",
    "Muntinlupa",
    "Navotas",
    "Paranaque",
    "Pasay",
    "Pasig",
    "Quezon City",
    "San Juan",
    "Taguig",
    "Valenzuela",
    "Pateros"
  ],
  Bulacan: ["Baliwag", "Bocaue", "Malolos", "Marilao", "Meycauayan", "San Jose del Monte"],
  Cavite: ["Bacoor", "Carmona", "Cavite City", "Dasmarinas", "General Trias", "Imus", "Tagaytay", "Trece Martires"],
  Laguna: ["Binan", "Calamba", "San Pablo", "San Pedro", "Santa Rosa"],
  Pampanga: ["Angeles", "Mabalacat", "San Fernando"],
  Rizal: ["Antipolo", "Binangonan", "Cainta", "Rodriguez", "San Mateo", "Taytay"],
  Cebu: ["Cebu City", "Danao", "Lapu-Lapu", "Mandaue", "Talisay"],
  "Davao del Sur": ["Davao City", "Digos"],
  Iloilo: ["Iloilo City", "Passi"],
  "Negros Occidental": ["Bacolod", "Bago", "Cadiz", "La Carlota", "Sagay", "Silay", "Talisay", "Victorias"]
} as const;

export type Province = keyof typeof philippinesLocations;

export const provinces = Object.keys(philippinesLocations) as Province[];

export const philippinesCityCoordinates: Record<string, { latitude: number; longitude: number }> = {
  Caloocan: { latitude: 14.6507, longitude: 120.9668 },
  "Las Pinas": { latitude: 14.4445, longitude: 120.9939 },
  Makati: { latitude: 14.5547, longitude: 121.0244 },
  Malabon: { latitude: 14.6681, longitude: 120.9658 },
  Mandaluyong: { latitude: 14.5794, longitude: 121.0359 },
  Manila: { latitude: 14.5995, longitude: 120.9842 },
  Marikina: { latitude: 14.6507, longitude: 121.1029 },
  Muntinlupa: { latitude: 14.4081, longitude: 121.0415 },
  Navotas: { latitude: 14.6667, longitude: 120.95 },
  Paranaque: { latitude: 14.4793, longitude: 121.0198 },
  Pasay: { latitude: 14.5378, longitude: 121.0014 },
  Pasig: { latitude: 14.5764, longitude: 121.0851 },
  "Quezon City": { latitude: 14.676, longitude: 121.0437 },
  "San Juan": { latitude: 14.6042, longitude: 121.0295 },
  Taguig: { latitude: 14.5176, longitude: 121.0509 },
  Valenzuela: { latitude: 14.7011, longitude: 120.983 },
  Pateros: { latitude: 14.5448, longitude: 121.0671 },
  Baliwag: { latitude: 14.9544, longitude: 120.8969 },
  Bocaue: { latitude: 14.7983, longitude: 120.9261 },
  Malolos: { latitude: 14.8527, longitude: 120.816 },
  Marilao: { latitude: 14.7578, longitude: 120.9483 },
  Meycauayan: { latitude: 14.7369, longitude: 120.9608 },
  "San Jose del Monte": { latitude: 14.8139, longitude: 121.0453 },
  Bacoor: { latitude: 14.459, longitude: 120.929 },
  Carmona: { latitude: 14.3132, longitude: 121.0576 },
  "Cavite City": { latitude: 14.4791, longitude: 120.8969 },
  Dasmarinas: { latitude: 14.3294, longitude: 120.9367 },
  "General Trias": { latitude: 14.3869, longitude: 120.8816 },
  Imus: { latitude: 14.4297, longitude: 120.9367 },
  Tagaytay: { latitude: 14.1153, longitude: 120.9621 },
  "Trece Martires": { latitude: 14.2822, longitude: 120.8677 },
  Binan: { latitude: 14.3036, longitude: 121.0781 },
  Calamba: { latitude: 14.2117, longitude: 121.1653 },
  "San Pablo": { latitude: 14.0683, longitude: 121.3256 },
  "San Pedro": { latitude: 14.3595, longitude: 121.0473 },
  "Santa Rosa": { latitude: 14.3122, longitude: 121.1114 },
  Angeles: { latitude: 15.1449, longitude: 120.5887 },
  Mabalacat: { latitude: 15.223, longitude: 120.5797 },
  "San Fernando": { latitude: 15.0333, longitude: 120.6833 },
  Antipolo: { latitude: 14.6255, longitude: 121.1245 },
  Binangonan: { latitude: 14.4646, longitude: 121.1929 },
  Cainta: { latitude: 14.5786, longitude: 121.1222 },
  Rodriguez: { latitude: 14.7601, longitude: 121.1999 },
  "San Mateo": { latitude: 14.6969, longitude: 121.1219 },
  Taytay: { latitude: 14.5586, longitude: 121.1362 },
  "Cebu City": { latitude: 10.3157, longitude: 123.8854 },
  Danao: { latitude: 10.5208, longitude: 124.0272 },
  "Lapu-Lapu": { latitude: 10.3103, longitude: 123.9494 },
  Mandaue: { latitude: 10.3403, longitude: 123.9416 },
  Talisay: { latitude: 10.2447, longitude: 123.8494 },
  "Davao City": { latitude: 7.1907, longitude: 125.4553 },
  Digos: { latitude: 6.7497, longitude: 125.3572 },
  "Iloilo City": { latitude: 10.7202, longitude: 122.5621 },
  Passi: { latitude: 11.1078, longitude: 122.6419 },
  Bacolod: { latitude: 10.6765, longitude: 122.9509 },
  Bago: { latitude: 10.5378, longitude: 122.8333 },
  Cadiz: { latitude: 10.9465, longitude: 123.288 },
  "La Carlota": { latitude: 10.4242, longitude: 122.9212 },
  Sagay: { latitude: 10.9447, longitude: 123.4244 },
  Silay: { latitude: 10.7996, longitude: 122.9748 },
  Victorias: { latitude: 10.9015, longitude: 123.0719 }
};

export function getCityCoordinates(city: string) {
  return philippinesCityCoordinates[city];
}

export function getProvinceForCity(city?: string): Province {
  const province = provinces.find((item) =>
    philippinesLocations[item].some((location) => location.toLowerCase() === city?.toLowerCase())
  );
  return province ?? "NCR";
}
