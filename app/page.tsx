import Image from "next/image";
import Link from "next/link";
import { getPublicContent as getContent } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { ListenLiveButton, NowOnAirCard } from "@/components/Radio";
import { EpisodeCard } from "@/components/Archive";
import { SectionTitle } from "@/components/ui";
import { IconArchive } from "@/components/icons";

export const revalidate = 3600;

export default async function HomePage() {
  const { profile, episodes, rubrics, announcements } = await getContent();
  const latest = episodes.slice(0, 4);

  return (
    <>
      {/* Бошловчи баннери */}
      <section className="grid items-center gap-5 pt-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:pt-14">
        <div className="order-2 md:order-1">
          <p className="mb-3 hidden items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm text-muted md:inline-flex">
            {profile.role} • {profile.station}
          </p>
          <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            Салом, мен <span className="text-gradient">{profile.name}</span>
          </h1>
          {profile.slogan && (
            <p className="mt-3 font-display text-xl font-semibold text-ink/90 md:mt-4 md:text-2xl">{profile.slogan}</p>
          )}
          {/* Телефонда шиор бор бўлса тавсиф яширилади: «тинглаш» тугмаси биринчи экранда қолсин */}
          <p className={`mt-3 max-w-xl text-muted md:block md:text-lg ${profile.slogan ? "hidden" : ""}`}>{profile.tagline}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 md:mt-7">
            <ListenLiveButton />
            <Link
              href="/arxiv"
              className="inline-flex min-h-14 items-center gap-2 rounded-full border border-white/15 px-6 font-semibold transition hover:bg-white/5"
            >
              <IconArchive width={20} height={20} /> Архивни очиш
            </Link>
          </div>
        </div>

        <div className="relative order-1 md:order-2">
          <div className="relative mx-auto aspect-[4/3] max-h-[40svh] w-full max-[359px]:aspect-[16/10] overflow-hidden rounded-[2rem] shadow-2xl shadow-brand/20 md:aspect-[4/5] md:max-h-none">
            <Image
              src={profile.photo}
              alt={`${profile.name} — ${profile.role.toLowerCase()}`}
              fill
              preload
              fetchPriority="high"
              unoptimized={profile.photo.endsWith(".svg")}
              sizes="(min-width: 768px) 45vw, 90vw"
              className="object-cover object-[50%_30%]"
            />
          </div>
          <div className="absolute bottom-3 left-3 md:-bottom-4 md:left-auto md:right-6 md:w-[min(20rem,90%)]">
            <div className="rounded-2xl border border-white/10 bg-surface-2/85 px-3 py-2 text-left shadow-xl backdrop-blur md:px-4 md:py-3 md:text-center">
              <p className="font-display text-lg font-extrabold md:text-2xl">{profile.frequency}</p>
              <p className="text-xs text-muted max-[359px]:hidden">«{profile.station}» радиосида тингланг</p>
            </div>
          </div>
        </div>
      </section>

      {/* Эфирдаги жорий дастур */}
      <section className="mt-14" aria-label="Эфирдаги дастур">
        <NowOnAirCard />
      </section>

      {/* Архивга сўнгги қўшилганлар */}
      <section className="mt-12">
        <SectionTitle href="/arxiv" linkLabel="Барча архив">Архивга янги қўшилганлар</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {latest.map((ep) => <EpisodeCard key={ep.id} ep={ep} rubrics={rubrics} />)}
        </div>
      </section>

      {/* Анонслар */}
      {announcements.length > 0 && (
        <section className="mt-12">
          <SectionTitle href="/media" linkLabel="Медиа">Анонслар</SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {announcements.slice(0, 3).map((a) => (
              <article key={a.id} className="w-[80%] shrink-0 snap-start rounded-[var(--radius-card)] border border-white/5 bg-surface p-5 md:w-auto">
                <p className="text-xs font-semibold text-gold">{formatDate(a.date)}</p>
                <h3 className="mt-2 font-semibold leading-snug">{a.title}</h3>
                <p className="mt-2 text-sm text-muted">{a.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
