import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guideProducts, rowForAge, rupees, type GuideProduct, type GuideSlug, type SizeTable } from "@/lib/guides";
import { breadcrumbs, faqPage, JsonLd } from "@/lib/seo";
import { getLiveOffers } from "@/lib/catalog";
import { offerTiers } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };
const find = (slug: string) => GUIDES.find((g) => g.slug === slug);

export function generateStaticParams() { return GUIDES.map((g) => ({ slug: g.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = find((await params).slug);
  if (!g) return { title: "Not found" };
  return { title: g.title, description: g.short, alternates: { canonical: `/guides/${g.slug}` }, openGraph: { title: g.title, description: g.short, type: "article", url: `/guides/${g.slug}` } };
}

function Table({ t, highlight }: { t: SizeTable; highlight?: (row: string[]) => boolean }) {
  return (
    <div className="my-4 overflow-x-auto">
      {t.title && <p className="mb-1 text-sm font-bold">{t.title}</p>}
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-sand-soft">{t.columns.map((c) => <th key={c} scope="col" className="border border-line px-3 py-2 text-left font-bold">{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, i) => <tr key={i} className={highlight?.(r) ? "bg-pine-soft" : ""}>{r.map((c, j) => j === 0 ? <th key={j} scope="row" className="border border-line px-3 py-2 text-left font-semibold">{c}</th> : <td key={j} className="border border-line px-3 py-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const P = ({ p, children }: { p: GuideProduct; children?: React.ReactNode }) => <Link href={`/p/${p.slug}`} className="font-semibold text-ink underline">{children ?? p.fullName}</Link>;

export default async function GuidePage({ params }: Props) {
  const slug = (await params).slug as GuideSlug;
  const g = find(slug);
  if (!g) notFound();
  const [all, s, offers] = await Promise.all([guideProducts(), getSettings(), getLiveOffers()]);
  const kids = all.filter((p) => p.kids), men = all.filter((p) => !p.kids);
  const tiers = offerTiers(offers).filter((t) => t.minPieces > 0);
  const offerLine = tiers.length ? `Buy more and save more: ${tiers.map((t) => `${t.minPieces} pieces ${t.reward.replace(/ off.*$/, "")}`).join(", ")} extra off, on top of prices already below MRP.` : "";
  const faq: { q: string; a: string }[] = [];
  let body: React.ReactNode = null;

  if (slug === "kids-thermal-size-chart") {
    const withAge = kids.map((p) => ({ p, t: p.chart[0], col: p.chart[0]?.columns.findIndex((c) => /age/i.test(c)) ?? -1 })).filter((x) => x.t && x.col >= 0);
    const sizeFor = (age: number) => withAge.map(({ p, t, col }) => { const r = rowForAge(t.rows, col, age); return r ? `${p.brand ?? p.name} ${r[0]} (${r[col]})` : null; }).filter(Boolean).join(" or ");
    const ages = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    faq.push(
      ...[3, 5, 7, 9].map((a) => ({ q: `What size thermal for a ${a} year old?`, a: `A ${a}-year-old usually fits ${sizeFor(a) || "the size for their age on the brand's chart"}. If your child is tall or between sizes, choose the next size up.` })),
      { q: "Should kids' thermals be tight?", a: "Snug, not tight. Thermals keep warm by sitting close to the skin, so they should hug the body without pressing. Sleeves and legs should reach the wrists and ankles." },
      { q: "Can I buy just a top or just a bottom?", a: `Yes. Every kids' thermal comes as a top, a bottom, or a set of both. Kids' wear is sold in twos, and you can mix any sizes and pieces.` },
      { q: "Can I return a thermal if the size is wrong?", a: `Yes, unused items can be returned within ${s.returnWindowDays} days of delivery. Start the return from your order page with a photo, and we pick it up for free once approved.` },
    );
    body = <>
      <p className="text-lg">Thermal sizes for kids follow the child&apos;s <b>chest and waist</b>, and each brand labels them with an age range. Use the table below for a quick answer, then check your brand&apos;s chart. <b>If your child is between sizes, go one size up</b>: children grow quickly and a slightly roomy thermal still keeps them warm.</p>
      <h2>Quick answer: size by age</h2>
      <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">
        <thead><tr className="bg-sand-soft"><th scope="col" className="border border-line px-3 py-2 text-left">Child&apos;s age</th>{withAge.map(({ p }) => <th key={p.id} scope="col" className="border border-line px-3 py-2 text-left">{p.fullName.replace(/ Thermal Warmer.*$/, "")}</th>)}</tr></thead>
        <tbody>{ages.map((a) => <tr key={a}><th scope="row" className="border border-line px-3 py-2 text-left">{a} years</th>{withAge.map(({ p, t, col }) => { const r = rowForAge(t.rows, col, a); return <td key={p.id} className="border border-line px-3 py-2">{r ? `${r[0]} (${r[col]})` : "–"}</td>; })}</tr>)}</tbody>
      </table></div>
      <p className="text-sm">Numbers like 55 or 60 are the brand&apos;s size labels, which match the chest measurement in cm (Dollar) or the size printed on the pack (Amul).</p>
      {withAge.map(({ p, t }) => <section key={p.id}><h2>{p.fullName} size chart</h2><Table t={t} />
        <p>Available as a top, a bottom, or a set{p.setFrom ? <>, sets from <b>{rupees(p.setFrom)}</b></> : null}. <P p={p}>See {p.brand ?? "this"} kids&apos; thermal</P>.</p></section>)}
      <h2>How to measure your child</h2>
      <ul><li><b>Chest:</b> measure around the fullest part of the chest, under the arms, over a thin vest.</li><li><b>Waist:</b> measure around the natural waist, just above the belly button.</li><li>Keep the tape snug but not tight, and compare with the chart above.</li></ul>
    </>;
  }

  if (slug === "mens-thermal-size-guide") {
    faq.push(
      { q: "How do I choose my thermal size?", a: "Measure your chest around the fullest part, under the arms. Pick the size whose chest measurement matches it. If you're between sizes and like a relaxed fit, go one size up." },
      { q: "Do men's thermals shrink?", a: "Cotton-rich thermals can shrink slightly if washed hot or tumble-dried on high. Wash cold or at up to 40°C, and dry in the shade, as each brand's care label says." },
      { q: "Can I buy only the thermal top or only the trouser?", a: "Yes. Each men's thermal comes as a top, a bottom, or a set of both, and you can choose different sizes for each." },
    );
    body = <>
      <p className="text-lg">Men&apos;s thermals come in <b>S, M, L, XL and XXL</b>. The size number on most packs (80 to 100) is the chest in centimetres. Measure your chest, pick the matching size, and <b>go one size up if you&apos;re between sizes</b>. A thermal should feel snug, like a second skin, without pulling across the shoulders.</p>
      {men.map((p) => <section key={p.id}><h2>{p.fullName}</h2>{p.chart.map((t, i) => <Table key={i} t={t} />)}
        <p>{p.material ? <>Fabric: {p.material}. </> : null}{p.setFrom ? <>Sets from <b>{rupees(p.setFrom)}</b>, single pieces from {rupees(p.pieceFrom)}. </> : null}<P p={p}>View sizes and stock</P>.</p></section>)}
      <h2>How to measure</h2>
      <ul><li><b>Chest:</b> around the fullest part of your chest, under the arms, with the tape level.</li><li><b>Waist:</b> around your natural waist, where your trousers sit.</li><li>Breathe normally and keep the tape snug, not tight.</li></ul>
    </>;
  }

  if (slug === "amul-vs-dollar-vs-lux-thermals") {
    const rows = [...men, ...kids];
    const cheapestMen = men.filter((p) => p.setFrom).sort((a, b) => a.setFrom! - b.setFrom!)[0];
    const widestKids = [...kids].sort((a, b) => b.sizes.length - a.sizes.length)[0];
    faq.push(
      ...(cheapestMen ? [{ q: "Which men's thermal is the cheapest?", a: `At WonderVastra right now, the ${cheapestMen.fullName} set (top and bottom) is the lowest priced, from ${rupees(cheapestMen.setFrom)}.` }] : []),
      ...(widestKids ? [{ q: "Which kids' thermal has the most sizes?", a: `${widestKids.fullName} comes in ${widestKids.sizes.length} sizes, from ${widestKids.sizes[0]} to ${widestKids.sizes[widestKids.sizes.length - 1]}.` }] : []),
      { q: "Are these original brand thermals?", a: "Yes. WonderVastra sells only 100% original stock from Amul, Dollar and Lux." },
      { q: "Which brand is warmest?", a: "All three are full-sleeve, full-length thermal warmers made for North Indian winters. Choose by fabric feel: brushed or fleece-backed fabrics feel warmer and softer on the inside, while lighter cotton-rich fabrics are easier to wear all day under office clothes." },
    );
    body = <>
      <p className="text-lg">Amul, Dollar and Lux all make full-sleeve thermal tops and full-length trousers for winter. The differences are in <b>fabric, fit, sizes and price</b>. Here they are side by side, with today&apos;s prices at WonderVastra.</p>
      <h2>Side by side</h2>
      <div className="my-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm">
        <thead><tr className="bg-sand-soft">{["Thermal", "For", "Fabric", "Sizes", "Set from", "Piece from"].map((c) => <th key={c} scope="col" className="border border-line px-3 py-2 text-left">{c}</th>)}</tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id}><th scope="row" className="border border-line px-3 py-2 text-left"><P p={p} /></th><td className="border border-line px-3 py-2">{p.kids ? "Kids" : "Men"}</td><td className="border border-line px-3 py-2">{p.material ?? "–"}</td><td className="border border-line px-3 py-2">{p.kids ? `${p.sizes.length} sizes, ages ${p.sizes[0].replace(/\s*\(.*$/, "")} to ${p.sizes[p.sizes.length - 1].replace(/\s*\(.*$/, "")}` : `${p.sizes.map((x) => x.replace(/\s*\(.*$/, "")).join(", ")}`}</td><td className="border border-line px-3 py-2 tabular-nums">{rupees(p.setFrom)}</td><td className="border border-line px-3 py-2 tabular-nums">{rupees(p.pieceFrom)}</td></tr>)}</tbody>
      </table></div>
      {offerLine && <p className="text-sm">{offerLine}</p>}
      {rows.map((p) => <section key={p.id}><h2>{p.fullName}</h2>
        {p.features.length > 0 && <ul>{p.features.slice(0, 7).map((f) => <li key={f}>{f}</li>)}</ul>}
        <p>{p.care ? <>Care: {p.care} </> : null}<P p={p}>See prices and sizes</P>.</p></section>)}
      <h2>Which should you buy?</h2>
      <ul>
        {cheapestMen && <li><b>Lowest price for men:</b> <P p={cheapestMen} />, sets from {rupees(cheapestMen.setFrom)}.</li>}
        {widestKids && <li><b>Most sizes for kids:</b> <P p={widestKids} />, {widestKids.sizes.length} sizes.</li>}
        <li><b>Daily office wear:</b> pick a lighter cotton-rich thermal that sits smoothly under shirts.</li>
        <li><b>Very cold nights or two-wheeler rides:</b> pick a brushed or fleece-backed thermal for extra warmth.</li>
      </ul>
    </>;
  }

  if (slug === "thermal-wear-for-delhi-winter") {
    faq.push(
      { q: "When should you start wearing thermals in Delhi?", a: "Most people in Delhi NCR start in early December, when night temperatures fall below about 10°C, and keep wearing them through January and into February. Cold-wave nights can drop to around 3–5°C." },
      { q: "Should you wear thermals indoors?", a: "Yes, many homes in Delhi aren't heated. A thin cotton-rich thermal under regular clothes keeps you warm indoors without bulk." },
      { q: "How many thermal sets does a child need?", a: "Two sets is practical: one to wear while the other is washed and dried, which can take a day in winter." },
      { q: "How do you wash thermals so they last?", a: "Wash cold or at up to 40°C, inside out, with similar colours. Don't bleach, and dry in the shade. Avoid high-heat tumble drying, which can shrink cotton." },
      { q: "Does WonderVastra deliver thermals across Delhi NCR?", a: `Yes, free delivery across Delhi NCR (Delhi, Gurugram, Noida, Greater Noida, Ghaziabad and Faridabad), usually in ${s.deliveryDaysMin}–${s.deliveryDaysMax} days.` },
    );
    body = <>
      <p className="text-lg">Delhi winters are short but sharp. From <b>December to February</b>, nights often fall into single digits and cold waves bring foggy days that feel colder than the number. A good thermal worn as your <b>first layer</b> keeps you warm without heavy sweaters, at home, in the office and on the school run.</p>
      <h2>How a thermal should fit</h2>
      <ul><li><b>Snug, like a second skin.</b> Thermals trap a thin layer of warm air next to your body, so a close fit works best.</li><li><b>Full sleeves and full length,</b> with ribbed cuffs that stay at the wrists and ankles.</li><li>No pulling across the shoulders or at the knees when you sit or bend.</li></ul>
      <h2>Which fabric for which day</h2>
      <ul><li><b>Office and indoors:</b> lighter cotton-rich fabric that sits flat under shirts and kurtas.</li><li><b>Early mornings, bikes and cold waves:</b> brushed or fleece-backed fabric for extra warmth.</li><li><b>Kids at school:</b> soft, tag-free thermals in the right size, so they don&apos;t itch or ride up.</li></ul>
      <h2>Our thermals</h2>
      <ul>{all.map((p) => <li key={p.id}><P p={p} />{p.material ? `: ${p.material}` : ""}{p.setFrom ? `, sets from ${rupees(p.setFrom)}` : ""}.</li>)}</ul>
      {offerLine && <p>{offerLine}</p>}
      <h2>Washing and care</h2>
      <ul><li>Wash cold or at up to 40°C, inside out, with similar colours.</li><li>Don&apos;t bleach, and dry in the shade.</li><li>Skip high-heat tumble drying; it shrinks cotton.</li></ul>
    </>;
  }

  const updated = new Date().toISOString().slice(0, 10);
  const url = `${siteUrl()}/guides/${g.slug}`;
  return (
    <div className="container-x py-8">
      <JsonLd data={[
        breadcrumbs([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: g.title, path: `/guides/${g.slug}` }]),
        { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.short, url, mainEntityOfPage: url, dateModified: updated, inLanguage: "en-IN", author: { "@type": "Organization", name: s.storeName, url: siteUrl() }, publisher: { "@id": `${siteUrl()}/#store` }, about: "Thermal wear" },
        ...(faq.length ? [faqPage(faq)] : []),
      ]} />
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs font-medium text-ink-soft"><Link href="/guides" className="hover:underline">Guides</Link> / <span>{g.title}</span></nav>
        <h1 className="text-4xl sm:text-5xl">{g.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Updated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · prices and sizes are live from our store</p>
        <div className="prose-vv mt-6">{body}
          {faq.length > 0 && <><h2>Questions parents and buyers ask</h2>{faq.map((x) => <div key={x.q}><h3 className="mt-4 font-bold text-ink">{x.q}</h3><p>{x.a}</p></div>)}</>}
        </div>
        <div className="mt-10 border-t border-line pt-6">
          <p className="font-display text-2xl">More guides</p>
          <ul className="mt-2 space-y-1.5">{GUIDES.filter((x) => x.slug !== g.slug).map((x) => <li key={x.slug}><Link href={`/guides/${x.slug}`} className="underline">{x.title}</Link></li>)}</ul>
          <div className="mt-6 flex flex-wrap gap-2"><Link href="/shop" className="btn btn-primary">Shop thermals</Link><Link href="/family-pack" className="btn btn-white">Build a family pack</Link></div>
        </div>
      </article>
    </div>
  );
}
