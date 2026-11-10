"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryItem } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { IconChevronLeft, IconChevronRight, IconClose, IconPlay } from "./icons";

const isYouTube = (v?: string) => !!v && /^[\w-]{11}$/.test(v);

function VideoView({ item }: { item: GalleryItem }) {
  if (isYouTube(item.video)) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${item.video}?autoplay=1&rel=0`}
        title={item.title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-2xl"
      />
    );
  }
  return <video src={item.video} poster={item.src} controls autoPlay playsInline className="max-h-[75vh] w-full rounded-2xl bg-black" />;
}

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const open = (i: number) => {
    lastFocus.current = document.activeElement as HTMLElement;
    setIndex(i);
  };
  const close = useCallback(() => {
    setIndex(null);
    lastFocus.current?.focus();
  }, []);
  const step = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + items.length) % items.length)),
    [items.length],
  );

  useEffect(() => {
    if (index === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, close, step]);

  const cur = index === null ? null : items[index];

  // Жадвалда бўш катак қолмаслиги учун охирги сурат керак бўлса кенгаяди.
  // Компьютер: 3 устун, биринчи сурат 2×2. Телефон: 2 устун, биринчиси тўлиқ эн.
  const n = items.length;
  const wideMd = n > 1 && (n + 3) % 3 === 2;
  const wideSm = n > 1 && (n + 1) % 2 === 1;
  const itemClass = (i: number) => {
    if (i === 0) return "col-span-2 md:col-span-2 md:row-span-2";
    if (i !== n - 1) return "";
    return [wideSm ? "col-span-2" : "", wideMd ? "md:col-span-2" : wideSm ? "md:col-span-1" : ""].join(" ");
  };
  const aspectClass = (i: number) => {
    if (i !== n - 1 || i === 0) return "aspect-[4/3]";
    return [wideSm ? "aspect-[8/3]" : "aspect-[4/3]", wideMd ? "md:aspect-[8/3]" : "md:aspect-[4/3]"].join(" ");
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((it, i) => (
          <li key={it.id} className={itemClass(i)}>
            <button
              type="button"
              onClick={() => open(i)}
              className={`group relative block ${aspectClass(i)} w-full overflow-hidden rounded-2xl bg-surface text-left`}
              aria-label={`Очиш: ${it.title}`}
              style={i === 0 ? { aspectRatio: "auto", height: "100%", minHeight: "14rem" } : undefined}
            >
              <Image
                src={it.src}
                alt=""
                fill
                sizes={i === 0 || (i === n - 1 && wideMd) ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 50vw"}
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" aria-hidden />
              {it.type === "video" && (
                <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-bg" aria-hidden>
                  <IconPlay width={24} height={24} className="translate-x-px" />
                </span>
              )}
              <span className="absolute inset-x-3 bottom-3 text-sm font-semibold leading-snug text-white">
                {it.title}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {cur && (
        <div role="dialog" aria-modal="true" aria-label={cur.title} className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4" onClick={close}>
          <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm text-white/70">{(index ?? 0) + 1} / {items.length}</span>
            <button ref={closeRef} type="button" onClick={close} className="grid size-12 place-items-center rounded-full text-white hover:bg-white/10" aria-label="Ёпиш">
              <IconClose />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-4xl">
              {cur.type === "video" && cur.video ? (
                <VideoView item={cur} />
              ) : (
                <div className="relative aspect-[4/3] w-full">
                  <Image src={cur.src} alt={cur.title} fill sizes="100vw" className="rounded-2xl object-contain" />
                </div>
              )}
              <p className="mt-4 font-semibold text-white">{cur.title}</p>
              {cur.date && <p className="text-sm text-white/60">{formatDate(cur.date)}</p>}
            </div>
            {items.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} className="absolute left-0 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Олдинги">
                  <IconChevronLeft />
                </button>
                <button type="button" onClick={() => step(1)} className="absolute right-0 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Кейинги">
                  <IconChevronRight />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
