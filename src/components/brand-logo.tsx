/**
 * WonderVastra logo, "Lotus Crown": a high-contrast serif W with a gold lotus on its centre peak.
 * The full mark adds fine gold threads fanning from the lotus; the compact mark (used at header/icon sizes)
 * drops the threads, thickens the hairlines and fills the lotus so it stays legible at 16–48px.
 * Pure SVG paths. The wordmark is set in Cinzel (self-hosted via @fontsource). Same shapes as src/app/icon.svg.
 */
export const BRAND = { ink: "#1A1414", maroon: "#5B1A2A", gold: "#A8823A", goldLight: "#C9A45C", ivory: "#FBF8F1", cream: "#F3E7D3" };

const PETAL = "M0 0 C9 -9 9 -19 0 -27 C-9 -19 -9 -9 0 0Z";
const PETALS = ["rotate(-72) scale(.66)", "rotate(72) scale(.66)", "rotate(-36) scale(.86)", "rotate(36) scale(.86)", ""];
const W_FULL = "33,42 47,42 75.1,127.9 102.5,61.2 130.2,128.3 160.1,42 163.9,42 127.8,146 123.5,146 97.5,82.8 71.4,146 67,146";
const W_SMALL = "30.5,42 49.5,42 75.4,121.2 102.5,55.1 130,121.7 157.6,42 166.4,42 129.6,148 121.8,148 97.5,88.9 73.1,148 65.1,148";

function Lotus({ transform, fill, stroke, strokeWidth }: { transform: string; fill: string; stroke: string; strokeWidth: number }) {
  return (
    <g transform={transform} fill={fill} stroke={stroke} strokeWidth={strokeWidth} paintOrder="stroke">
      {PETALS.map((t, i) => <path key={i} d={PETAL} transform={t || undefined} />)}
    </g>
  );
}

export function LogoMark({ className = "", onDark = false, variant = "compact" }: { className?: string; onDark?: boolean; variant?: "compact" | "full" }) {
  const ink = onDark ? BRAND.cream : BRAND.ink;
  const bg = onDark ? "#2A0E16" : BRAND.ivory;
  if (variant === "full") {
    return (
      <svg viewBox="18 24 164 126" aria-hidden className={className}>
        <path d="M101 63 L50 54 M101 63 L54 66 M101 63 L58 78 M101 63 L152 54 M101 63 L148 66 M101 63 L144 78" stroke={onDark ? BRAND.goldLight : BRAND.gold} strokeWidth={0.9} fill="none" />
        <polygon points={W_FULL} fill={ink} />
        <rect x={23} y={40.5} width={34} height={3} fill={ink} />
        <rect x={150} y={40.5} width={26} height={3} fill={ink} />
        <Lotus transform="translate(101 63) scale(1.3)" fill={bg} stroke={onDark ? BRAND.goldLight : BRAND.gold} strokeWidth={1.3} />
      </svg>
    );
  }
  return (
    <svg viewBox="22 14 156 136" aria-hidden className={className}>
      <polygon points={W_SMALL} fill={ink} />
      <Lotus transform="translate(101.5 57) scale(1.55)" fill={onDark ? BRAND.goldLight : "#B98E3E"} stroke={onDark ? "#2A0E16" : "#ffffff"} strokeWidth={2.4} />
    </svg>
  );
}

/** Mark + Cinzel wordmark. The large size stacks the full mark over the name and the "Crafted with trust" line. */
export function Logo({ className = "", onDark = false, size = "md" }: { className?: string; onDark?: boolean; size?: "sm" | "md" | "lg" }) {
  const word = onDark ? "text-[#F3E7D3]" : "text-maroon";
  if (size === "lg") {
    return (
      <span className={`inline-flex flex-col items-start gap-2 ${className}`}>
        <span className="inline-flex items-center gap-3">
          <LogoMark variant="full" onDark={onDark} className="h-11 w-auto shrink-0 min-[400px]:h-14" />
          <span className={`font-brand text-[1.45rem] leading-none font-semibold tracking-[0.04em] min-[400px]:text-[2rem] ${word}`}>WONDERVASTRA</span>
        </span>
        <span className={`text-[0.66rem] font-medium tracking-[0.32em] uppercase ${onDark ? "text-gold-light" : "text-gold"}`}>Crafted with trust</span>
      </span>
    );
  }
  const s = { sm: { mark: "h-6", text: "text-[1.05rem]", gap: "gap-1.5" }, md: { mark: "h-8", text: "text-[1.3rem]", gap: "gap-2" } }[size];
  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <LogoMark onDark={onDark} className={`${s.mark} w-auto shrink-0`} />
      <span className={`font-brand ${s.text} leading-none font-semibold tracking-[0.04em] ${word}`}>WONDERVASTRA</span>
    </span>
  );
}
