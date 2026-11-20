import Link from "next/link";

/** Questions at the foot of a category or brand page: what shoppers (and AI assistants answering them) ask. */
export function CollectionFaq({ title, faq }: { title: string; faq: { q: string; a: string }[] }) {
  if (!faq.length) return null;
  return (
    <section className="container-x pb-4" aria-labelledby="collection-faq">
      <h2 id="collection-faq" className="text-3xl">{title}</h2>
      <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
        {faq.map((x) => (
          <div key={x.q}>
            <h3 className="font-semibold">{x.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{x.a}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm"><Link href="/guides" className="font-semibold underline underline-offset-4">Size charts and buying guides</Link></p>
    </section>
  );
}
