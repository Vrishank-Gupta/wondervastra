"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Slide = { key: string; eyebrow: string; title: string; text: string; cta: string; href: string; wide: string; tall: string; alt: string };

/** Swipeable banner slideshow. Advances every 6s, pauses on hover/touch and for reduced motion. */
export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go((active + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [active, paused, slides.length]);

  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)}>
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none">
        {slides.map((s, i) => (
          <div key={s.key} className="relative w-full shrink-0 snap-start" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            <Link href={s.href} className="relative block aspect-[4/5] max-h-[74svh] w-full overflow-hidden md:aspect-auto md:h-[min(64vh,600px)] md:max-h-none">
              <Image src={s.tall} alt={s.alt} fill priority={i === 0} sizes="100vw" className="object-cover md:hidden" />
              <Image src={s.wide} alt={s.alt} fill priority={i === 0} sizes="100vw" className="hidden object-cover md:block" />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-transparent md:bg-gradient-to-r md:from-black/75 md:via-black/35" />
              <div className="absolute inset-x-0 top-0 p-6 text-white sm:p-10 md:inset-y-0 md:flex md:w-1/2 md:flex-col md:justify-center md:p-14 lg:p-20">
                <p className="eyebrow text-white/80">{s.eyebrow}</p>
                <h2 className="mt-2 text-[3.4rem] leading-[0.9] sm:text-7xl lg:text-[6.5rem]">{s.title}</h2>
                <p className="mt-3 max-w-sm text-[15px] text-white/85 sm:text-base">{s.text}</p>
                <span className="btn mt-5 w-fit bg-white text-ink">{s.cta}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Show slide ${i + 1}`} aria-current={i === active} onClick={() => go(i)} className={`h-1 transition-all ${i === active ? "w-8 bg-white" : "w-4 bg-white/45"}`} />
          ))}
        </div>
      )}
    </section>
  );
}
