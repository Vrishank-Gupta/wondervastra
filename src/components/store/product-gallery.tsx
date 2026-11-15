"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

type Img = { url: string; alt: string | null };

/**
 * Product photos: swipe between them on phones, and tap to open full screen. Photos are shown whole
 * (never cropped), so size charts and box shots stay readable. Pinch-zoom works in the full-screen view.
 */
export function ProductGallery({ images, name, index, onIndex, badge }: { images: Img[]; name: string; index: number; onIndex: (i: number) => void; badge?: React.ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const many = images.length > 1;

  // Keep the swipe strip and the chosen photo in step (thumbnails, colour picks).
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const target = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: "smooth" });
  }, [index]);
  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index && i >= 0 && i < images.length) onIndex(i);
  };
  const go = useCallback((d: number) => onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);

  return (
    <>
      <div className="relative">
        <div ref={strip} onScroll={onScroll} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto bg-white" aria-label={`${name} photos`} data-testid="gallery">
          {images.map((im, i) => (
            <button key={im.url} type="button" onClick={() => { onIndex(i); setOpen(true); }} aria-label={`Open photo ${i + 1} of ${images.length} full screen`}
              className="relative aspect-[4/5] w-full shrink-0 snap-center cursor-zoom-in">
              <Image src={im.url} alt={im.alt ?? name} fill priority={i === 0} sizes="(max-width:768px) 100vw, 50vw" className="object-contain" />
            </button>
          ))}
          {!images.length && <div className="aspect-[4/5] w-full bg-sand-soft" />}
        </div>
        {badge}
        {images.length > 0 && <span className="pointer-events-none absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-white/90 shadow-sm" aria-hidden><Expand size={16} /></span>}
        {many && (
          <>
            <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden" aria-hidden>
              {images.map((im, i) => <span key={im.url} className={`size-1.5 rounded-full ${i === index ? "bg-ink" : "bg-ink/25"}`} />)}
            </span>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute top-1/2 left-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-sm md:grid"><ChevronLeft size={20} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute top-1/2 right-2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-sm md:grid"><ChevronRight size={20} /></button>
          </>
        )}
      </div>
      {many && (
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto p-0.5">
          {images.map((im, i) => (
            <button key={im.url} onClick={() => onIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index} className={`relative h-20 w-16 shrink-0 overflow-hidden border bg-white ${i === index ? "border-ink" : "border-line"}`}>
              <Image src={im.url} alt="" fill sizes="64px" className="object-contain" />
            </button>
          ))}
        </div>
      )}
      {open && createPortal(<Lightbox images={images} name={name} index={index} onIndex={onIndex} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Lightbox({ images, name, index, onIndex, onClose }: { images: Img[]; name: string; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // The phone's Back button closes the photos instead of leaving the page. Opening adds one history step;
  // every way of closing goes back through it, so they all behave the same.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pushed = useRef(false);
  useEffect(() => {
    if (!pushed.current) { history.pushState({ ...(history.state ?? {}), wvPhotos: true }, ""); pushed.current = true; }
    const onPop = () => { if (!history.state?.wvPhotos) closeRef.current(); };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const close = () => { if (history.state?.wvPhotos) history.back(); else closeRef.current(); };
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    strip.current?.scrollTo({ left: index * (strip.current?.clientWidth ?? 0) });
    return () => { document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") onIndex(Math.min(images.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [images.length, index, onIndex]);
  useEffect(() => {
    const el = strip.current;
    if (el && Math.abs(el.scrollLeft - index * el.clientWidth) > 4) el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, [index]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${name} photos`} className="fixed inset-0 z-[1000] flex flex-col bg-white" data-testid="lightbox">
      <div className="flex items-center justify-between px-3 pt-[max(.5rem,env(safe-area-inset-top))] pb-2">
        <span className="text-sm font-medium tabular-nums">{index + 1} / {images.length}</span>
        <button ref={closeBtn} type="button" onClick={close} aria-label="Close photos" className="grid size-12 place-items-center rounded-full bg-ink text-white shadow-md"><X size={24} /></button>
      </div>
      <div ref={strip} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== index) onIndex(i); }}
        className="scrollbar-none flex flex-1 snap-x snap-mandatory overflow-x-auto [touch-action:pan-x_pan-y_pinch-zoom]">
        {images.map((im) => (
          <div key={im.url} className="relative h-full w-full shrink-0 snap-center" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <Image src={im.url} alt={im.alt ?? name} fill sizes="100vw" className="object-contain" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          {images.map((im, i) => (
            <button key={im.url} onClick={() => onIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index} className={`relative h-14 w-12 shrink-0 overflow-hidden border ${i === index ? "border-ink" : "border-line"}`}>
              <Image src={im.url} alt="" fill sizes="48px" className="object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
