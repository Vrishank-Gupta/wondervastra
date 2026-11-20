/**
 * Turns a rendered store page (guides, policies) into Markdown for AI assistants: keeps the <article>
 * (or <main>) text, headings, lists, links and tables; drops menus, forms, buttons and scripts.
 * No imports, so the Cloudflare entry (cf-worker.ts) can bundle it directly.
 */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", hellip: "…", middot: "·", rarr: "→", times: "×" };
export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m);
}

const inline = (html: string, base: string): string =>
  decode(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
        const t = inline(text, base).trim();
        if (!t) return "";
        const url = href.startsWith("/") ? base + href : href.replace(/&amp;/g, "&");
        return /^(mailto:|tel:|https?:)/.test(url) ? ` [${t}](${url}) ` : ` ${t} `;
      })
      .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, x: string) => (x.trim() ? `**${x.trim()}**` : ""))
      .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, x: string) => (x.trim() ? `_${x.trim()}_` : ""))
      // Separate elements are separate words ("₹420" "₹506"), but no space before punctuation.
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t\r\n]+/g, " ").replace(/ ([.,;:!?)])/g, "$1").replace(/\( /g, "(");

function table(html: string, base: string) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inline(c[1], base).trim().replace(/\|/g, "/")));
  if (!rows.length) return "";
  const w = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return `\n\n${line(rows[0])}\n| ${Array(w).fill("---").join(" | ")} |\n${rows.slice(1).map(line).join("\n")}\n\n`;
}

/** Drops every element marked aria-hidden="true" (decoration such as scrolling tape), nested tags included. */
function dropHidden(html: string) {
  const open = /<([a-z][a-z0-9]*)\b[^>]*\baria-hidden="true"[^>]*>/gi;
  let out = html, m: RegExpExecArray | null;
  open.lastIndex = 0;
  while ((m = open.exec(out))) {
    const tag = m[1].toLowerCase(), start = m.index;
    if (m[0].endsWith("/>")) { out = out.slice(0, start) + out.slice(start + m[0].length); open.lastIndex = start; continue; }
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = start + m[0].length;
    let depth = 1, end = -1, t: RegExpExecArray | null;
    while ((t = re.exec(out))) {
      if (t[1]) depth--; else if (!t[0].endsWith("/>")) depth++;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end < 0) break;
    out = out.slice(0, start) + out.slice(end);
    open.lastIndex = start;
  }
  return out;
}

/** Markdown for the main content of `html`. `base` is the site origin, for absolute links. */
export function htmlToMarkdown(html: string, base: string): { title: string; markdown: string } {
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const description = decode(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? "").trim();
  // A guide or policy is one <article>; listing pages have an <article> per product card, so take all of <main>.
  const single = (html.match(/<article\b/gi) ?? []).length === 1;
  let body = (single ? html.match(/<article\b[^>]*>([\s\S]*)<\/article>/i)?.[1] : null) ?? html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i)?.[1] ?? "";
  body = dropHidden(body.replace(/<!--[\s\S]*?-->/g, ""))
    .replace(/<(script|style|svg|noscript|template|form|button|select|textarea|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(input|img|link|meta)\b[^>]*>/gi, "")
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_m, t: string) => `\u0000${Buffer.from(table(t, base)).toString("base64")}\u0000`)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, x: string) => `\n\n${"#".repeat(Number(n))} ${inline(x, base).trim()}\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, x: string) => `\n- ${inline(x, base).trim()}`)
    .replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi, (_m, k: string, v: string) => `\n- **${inline(k, base).trim()}:** ${inline(v, base).trim()}`)
    .replace(/<\/(ul|ol|dl)>/gi, "\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, x: string) => `\n\n${inline(x, base).trim()}\n\n`)
    .replace(/<(div|section)\b[^>]*>/gi, "\n");
  const md = inline(body.replace(/\n/g, "\u0001"), base)
    .replace(/\u0001/g, "\n")
    .replace(/\u0000([A-Za-z0-9+/=]*)\u0000/g, (_m, b: string) => Buffer.from(b, "base64").toString())
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  // Lead with the page's own <h1> (or the <title> when it has none), then its description as a summary.
  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => l.startsWith("# "));
  const first = h1 >= 0 ? lines[h1] : `# ${title.replace(/\s*\|\s*[^|]+$/, "")}`;
  const before = h1 > 0 ? lines.slice(0, h1).join("\n").trim() : "";
  const after = (h1 >= 0 ? lines.slice(h1 + 1) : lines).join("\n").trim();
  const quote = description && !md.includes(description) ? `> ${description}` : "";
  return { title, markdown: [first, quote, before, after].filter(Boolean).join("\n\n") + "\n" };
}
