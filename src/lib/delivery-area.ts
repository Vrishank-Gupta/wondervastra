/**
 * Where the store delivers. Pure and shared by server and browser.
 * The list is written the way a person would type it: single pincodes, ranges ("110001-110099")
 * or prefixes ("110" = every pincode starting 110), separated by commas, spaces or new lines.
 * A blank list means "all of India".
 */

/** Delhi NCR: Delhi, Gurugram, Faridabad, Noida, Greater Noida and Ghaziabad. */
export const NCR_PINCODES = [
  "110001-110099", // Delhi
  "121001-121015", // Faridabad
  "122001-122018, 122050-122052, 122101-122103", // Gurugram, Manesar, Sohna
  "201001-201019, 201102", // Ghaziabad, Indirapuram, Loni
  "201301-201318", // Noida, Greater Noida
].join("\n");

type Rule = { from: number; to: number };

export function parsePincodes(text: string): { rules: Rule[]; bad: string[] } {
  const rules: Rule[] = [];
  const bad: string[] = [];
  const tokens = text.replace(/\/\/[^\n]*/g, "").split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    const range = t.match(/^(\d{6})\s*[-–]\s*(\d{6})$/);
    if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      rules.push({ from: Math.min(a, b), to: Math.max(a, b) });
    } else if (/^[1-9]\d{5}$/.test(t)) rules.push({ from: Number(t), to: Number(t) });
    else if (/^[1-9]\d{1,4}$/.test(t)) {
      const pad = 6 - t.length;
      rules.push({ from: Number(t) * 10 ** pad, to: (Number(t) + 1) * 10 ** pad - 1 });
    } else bad.push(t);
  }
  return { rules, bad };
}

/** True when the store delivers to this pincode. A blank list delivers everywhere. */
export function deliversTo(pincode: string, list: string) {
  if (!/^[1-9]\d{5}$/.test(pincode)) return false;
  if (!list.trim()) return true;
  const n = Number(pincode);
  return parsePincodes(list).rules.some((r) => n >= r.from && n <= r.to);
}

/** A friendly place name for NCR pincodes, used when the post-office lookup is unavailable. */
export function ncrPlace(pincode: string): string | null {
  const n = Number(pincode);
  if (n >= 110001 && n <= 110099) return "Delhi";
  if (n >= 121001 && n <= 121015) return "Faridabad";
  if ((n >= 122001 && n <= 122018) || (n >= 122050 && n <= 122052) || (n >= 122101 && n <= 122103)) return "Gurugram";
  if ((n >= 201001 && n <= 201019) || n === 201102) return "Ghaziabad";
  if (n >= 201301 && n <= 201318) return n === 201306 || n === 201308 || n === 201310 ? "Greater Noida" : "Noida";
  return null;
}

/** "Delhi NCR" when the list is set, otherwise "India". */
export function areaLabel(s: { deliveryAreaName: string; deliveryPincodes: string }) {
  return s.deliveryPincodes.trim() ? s.deliveryAreaName.trim() || "selected areas" : "India";
}
