import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../src/lib/html-md";
import { phoneDisplay, phoneE164 } from "../src/lib/business";
import { activePromo, PROMOS, promoFacts } from "../src/lib/promo";

describe("htmlToMarkdown", () => {
  const html = `<html><head><title>Size chart | WonderVastra</title><meta name="description" content="Which size to buy."/></head><body>
    <nav>Menu</nav><main><article><h1>Size chart</h1><p>Pick by <b>age</b>, see <a href="/p/x">the product</a>.</p>
    <ul><li>One</li><li>Two &amp; three</li></ul><form><button>Buy</button></form>
    <table><tr><th>Size</th><th>Age</th></tr><tr><td>50</td><td>2–3 Y</td></tr></table><script>x()</script></article></main></body></html>`;
  const { markdown } = htmlToMarkdown(html, "https://wondervastra.in");
  it("keeps headings, text, lists, links and tables", () => {
    expect(markdown.startsWith("# Size chart\n\n> Which size to buy.")).toBe(true);
    expect(markdown).toContain("Pick by **age**, see [the product](https://wondervastra.in/p/x).");
    expect(markdown).toContain("- Two & three");
    expect(markdown).toContain("| Size | Age |\n| --- | --- |\n| 50 | 2–3 Y |");
  });
  it("drops menus, forms and scripts", () => {
    expect(markdown).not.toMatch(/Menu|Buy|x\(\)/);
  });
});

describe("htmlToMarkdown on listing pages", () => {
  const html = `<title>Sale | WonderVastra</title><main><section><h1>Weekend Dhamaka</h1><div aria-hidden="true"><div><span>SALE ✦</span></div><div>SALE ✦</div></div>
    <a href="/p/a"><span>₹420</span><s>₹506</s></a><a href="/p/b">Men</a></section><article><p>Card one</p></article><article><p>Card two</p></article></main>`;
  const { markdown } = htmlToMarkdown(html, "https://x.in");
  it("uses all of <main> when there are several product cards, and its own h1", () => {
    expect(markdown.startsWith("# Weekend Dhamaka\n")).toBe(true);
    expect(markdown).toContain("Card one");
    expect(markdown).toContain("Card two");
  });
  it("skips decoration and keeps separate pieces of text apart", () => {
    expect(markdown).not.toContain("SALE ✦");
    expect(markdown).toContain("[₹420 ₹506](https://x.in/p/a) [Men](https://x.in/p/b)");
  });
});

describe("phone formatting", () => {
  it("formats Indian mobiles", () => {
    expect(phoneDisplay("098765 43210")).toBe("+91 98765 43210");
    expect(phoneE164("+91 98765-43210")).toBe("+919876543210");
  });
});

describe("weekend campaign dates", () => {
  const p = PROMOS[0];
  it("runs from its start to just before its end, in India time", () => {
    expect(activePromo(p.startsAt - 1)).toBeNull();
    expect(activePromo(p.startsAt)?.name).toBe(p.name);
    expect(activePromo(p.endsAt - 1)?.name).toBe(p.name);
    expect(activePromo(p.endsAt)).toBeNull();
    // Sunday 22 Nov 2026, 11:59 pm IST is still on; Monday 00:00 IST is off.
    expect(activePromo(Date.parse("2026-11-22T23:59:00+05:30"))).not.toBeNull();
    expect(activePromo(Date.parse("2026-11-23T00:00:00+05:30"))).toBeNull();
  });
  it("quotes the cheapest in-stock set in each range and the best extra discount", () => {
    const cards = [
      { categorySlug: "kids-thermals", price: 42000, inStock: true },
      { categorySlug: "kids-thermals", price: 30000, inStock: false },
      { categorySlug: "mens-thermals", price: 71000, inStock: true },
    ];
    expect(promoFacts(cards, "7% off")).toEqual({ kidsFrom: 42000, menFrom: 71000, extra: "7%" });
    expect(promoFacts([], null)).toEqual({ kidsFrom: null, menFrom: null, extra: null });
  });
});
