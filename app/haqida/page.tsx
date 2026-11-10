import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getContent } from "@/lib/content";
import { PageHeader, SectionTitle } from "@/components/ui";
import { IconExternal, IconMic } from "@/components/icons";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getContent();
  return {
    title: "Мен ҳақимда",
    description: `${profile.name} — ${profile.role.toLowerCase()}. ${profile.bioIntro ?? "Ижодий йўл, радиодаги фаолият ва муаллифлик дастурлари."}`,
    alternates: { canonical: "/haqida" },
  };
}

export default async function AboutPage() {
  const { profile } = await getContent();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.role,
    worksFor: { "@type": "RadioStation", name: profile.station },
    url: SITE_URL,
    sameAs: profile.socials.map((s) => s.url),
  };

  return (
    <>
      <PageHeader eyebrow="Биография" title={profile.bioTitle || "Мен ҳақимда"} lead={profile.bioIntro} />

      <section className="grid gap-8 md:grid-cols-[18rem_1fr] md:gap-12">
        <figure className="mx-auto w-full max-w-[18rem]">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem]">
          <Image
            src={profile.aboutPhoto || profile.photo}
            alt={`${profile.name} эфир пайтида`}
            fill
            sizes="18rem"
            className="object-cover"
            style={{ objectPosition: profile.aboutPhotoFocus || "50% 30%" }}
          />
        </div>
        {profile.aboutSlogan && (
          <figcaption className="mt-4 text-center font-display text-lg font-semibold text-gradient">
            «{profile.aboutSlogan}»
          </figcaption>
        )}
        </figure>
        <div className="space-y-4 text-lg leading-relaxed text-ink/90">
          <h2 className="font-display text-xl font-bold md:text-2xl">Қисқача биография</h2>
          {profile.bio.map((p, i) => <p key={i}>{p}</p>)}
          <ul className="flex flex-wrap gap-2 pt-2" aria-label="Ижтимоий тармоқлар">
            {profile.socials.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 bg-surface px-5 text-base font-semibold transition hover:border-brand hover:text-brand"
                >
                  {s.label} <IconExternal width={16} height={16} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {profile.timeline.length > 0 && (
      <section className="mt-14">
        <SectionTitle>Радиодаги йўлим</SectionTitle>
        <ol className="relative ml-3 border-l-2 border-white/10">
          {profile.timeline.map((t) => (
            <li key={t.year + t.title} className="relative pb-8 pl-7 last:pb-0">
              <span className="absolute -left-[9px] top-1.5 size-4 rounded-full border-4 border-bg bg-brand" aria-hidden />
              <p className="font-display text-sm font-bold text-brand">{t.year}</p>
              <h3 className="mt-1 text-lg font-semibold">{t.title}</h3>
              <p className="mt-1 text-muted">{t.text}</p>
            </li>
          ))}
        </ol>
      </section>
      )}

      <section className="mt-14">
        <SectionTitle>Муаллифлик дастурлари</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {profile.programs.map((p) => (
            <article
              key={p.title}
              className={`flex flex-col rounded-[var(--radius-card)] border p-5 ${
                p.archived ? "border-white/5 bg-surface" : "border-brand/40 bg-brand/[0.08] sm:col-span-2"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`grid size-11 place-items-center rounded-xl ${p.archived ? "bg-white/5 text-muted" : "bg-brand/15 text-brand"}`}>
                  <IconMic width={22} height={22} />
                </span>
                {!p.archived && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-3 py-1 text-xs font-bold text-live">
                    <span className="size-1.5 rounded-full bg-live animate-pulse-dot" /> ЭФИРДА
                  </span>
                )}
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{p.title}</h3>
              <p className="mt-1 text-sm font-semibold text-gold">{p.slot}</p>
              <p className="mt-2 text-muted">{p.text}</p>
              {p.archived && (
                <Link
                  href={`/arxiv?rukn=${encodeURIComponent(p.title)}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-brand hover:underline"
                >
                  Архивда тинглаш →
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
