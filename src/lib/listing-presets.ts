/**
 * Ready-made choices for the listing form, so a new listing is mostly taps:
 * size sets per kind of category, common colours with swatches, and sensible text defaults.
 * Matched from the category's name, so a category added later (e.g. "Women's Thermals") still gets presets.
 */

export const COLOURS: { name: string; hex: string }[] = [
  { name: "White", hex: "#F7F7F5" }, { name: "Off White", hex: "#EFE8DA" }, { name: "Black", hex: "#1F1E1D" },
  { name: "Charcoal", hex: "#3B3A38" }, { name: "Grey Melange", hex: "#9A9A98" }, { name: "Navy", hex: "#2B3A4A" },
  { name: "Maroon", hex: "#6E2A2A" }, { name: "Red", hex: "#B3261E" }, { name: "Pink", hex: "#E7B7C2" },
  { name: "Peach", hex: "#F2C3A7" }, { name: "Sky Blue", hex: "#A9C8E0" }, { name: "Blue", hex: "#3F64A8" },
  { name: "Green", hex: "#4F7A4F" }, { name: "Olive", hex: "#5A6650" }, { name: "Yellow", hex: "#E8C547" },
  { name: "Skin", hex: "#CBA685" }, { name: "Brown", hex: "#6B4A35" }, { name: "Purple", hex: "#7B5A93" },
  { name: "Assorted", hex: "#8C3B2E" },
];

/** Best-guess swatch for a colour typed by hand ("Dark Navy" → Navy). */
export function colourHex(name: string): string {
  const n = name.trim().toLowerCase();
  const exact = COLOURS.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.hex;
  const partial = COLOURS.find((c) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().split(" ").some((w) => w.length > 3 && n.includes(w)));
  return partial?.hex ?? "#BBBBBB";
}

export const SIZE_SETS = {
  baby: ["0–6 M", "6–12 M", "12–18 M", "18–24 M"],
  kids: ["2–4 Y", "4–6 Y", "6–8 Y", "8–10 Y", "10–12 Y", "12–14 Y"],
  men: ["S (80 cm)", "M (85 cm)", "L (90 cm)", "XL (95 cm)", "XXL (100 cm)"],
  women: ["S", "M", "L", "XL", "XXL"],
  free: ["Free size"],
} as const;
export type SizeSet = keyof typeof SIZE_SETS;

/** Typical child height (cm) for each age size, as a starting point; brands differ, so each listing can change them. */
export const TYPICAL_HEIGHTS: Record<string, string> = {
  "0–6 M": "50–68", "6–12 M": "68–76", "12–18 M": "76–82", "18–24 M": "82–88",
  "2–4 Y": "88–104", "4–6 Y": "104–116", "6–8 Y": "116–128", "8–10 Y": "128–140", "10–12 Y": "140–152", "12–14 Y": "152–164",
};

export type Audience = { tag: string; label: string; sizes: SizeSet };
export type CategoryPreset = {
  kind: "kids" | "men" | "women" | "other";
  sizes: SizeSet;
  /** Kids' categories ask who it's for; the answer becomes a tag that drives the Baby/Boys/Girls shortcuts. */
  audiences?: Audience[];
  names: string[];
  material: string;
  care: string;
  hsn: string;
  tags: string[];
};

const THERMAL_CARE = "Machine wash cold, inside out, with similar colours. Do not bleach. Dry in shade. Do not iron directly on print.";

export function presetFor(categoryName: string): CategoryPreset {
  const n = categoryName.toLowerCase();
  const thermal = n.includes("thermal");
  if (n.includes("kid") || n.includes("baby") || n.includes("child")) {
    return {
      kind: "kids", sizes: "kids",
      audiences: [{ tag: "baby", label: "Baby (0–2 yrs)", sizes: "baby" }, { tag: "boys", label: "Boys", sizes: "kids" }, { tag: "girls", label: "Girls", sizes: "kids" }],
      names: thermal ? ["Thermal Set", "Thermal Top", "Thermal Bottom", "Thermal Top Full Sleeve", "Thermal Bodysuit"] : ["Vest", "Set", "Top"],
      material: thermal ? "Soft cotton blend, brushed inside for warmth" : "Soft cotton", care: THERMAL_CARE, hsn: "6111", tags: thermal ? ["kids", "winter"] : ["kids"],
    };
  }
  if (n.includes("women") || n.includes("ladies")) {
    return { kind: "women", sizes: "women", names: thermal ? ["Thermal Top", "Thermal Leggings", "Thermal Set"] : ["Camisole", "Slip"], material: "Cotton blend", care: THERMAL_CARE, hsn: "6108", tags: thermal ? ["winter"] : [] };
  }
  if (n.includes("men")) {
    return {
      kind: "men", sizes: "men",
      names: thermal ? ["Thermal Top Full Sleeve", "Thermal Bottom", "Thermal Set, Top & Bottom", "High Neck Thermal Top"] : ["Cotton Vest", "Brief", "Trunk"],
      material: thermal ? "Cotton blend, brushed inside for warmth" : "Combed cotton", care: THERMAL_CARE, hsn: "6107", tags: thermal ? ["winter"] : [],
    };
  }
  return { kind: "other", sizes: "free", names: [], material: "", care: "", hsn: "", tags: [] };
}

/** "Lux" + kids thermal set in Pink, Maroon, sizes 2–4 Y to 12–14 Y → a plain one-line description. */
export function autoShortDescription(o: { brand?: string; name: string; colours: string[]; sizes: string[]; material?: string }) {
  const sizes = o.sizes.filter((s) => s !== "Free size");
  const parts = [
    o.material ? o.material.split(",")[0] : null,
    o.colours.filter((c) => c !== "Default").length ? `in ${o.colours.filter((c) => c !== "Default").join(", ")}` : null,
    sizes.length ? (sizes.length === 1 ? `size ${sizes[0]}` : `sizes ${sizes[0]} to ${sizes[sizes.length - 1]}`) : null,
  ].filter(Boolean);
  return `${o.brand ? `100% original ${o.brand}. ` : ""}${parts.join(", ")}`.trim().replace(/[,.]$/, "").slice(0, 200);
}
