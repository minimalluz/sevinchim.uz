import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { Gallery } from "@/components/Gallery";
import { PageHeader, SectionTitle } from "@/components/ui";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Медиа ва янгиликлар",
  description: "Студия жараёнлари, эфир лавҳаларидан фото ва видеолар ҳамда яқин кунлардаги дастурлар анонси.",
  alternates: { canonical: "/media" },
};

export default async function MediaPage() {
  const { gallery, announcements } = await getContent();
  return (
    <>
      <PageHeader
        eyebrow="Студиядан"
        title="Медиа ва янгиликлар"
        lead={announcements.length > 0 ? "Эфир ортидаги лаҳзалар, фото ва видеолар ҳамда яқин дастурлар анонси." : "Эфир ортидаги лаҳзалар, фото ва видеолар."}
      />

      {announcements.length > 0 && (
      <section aria-labelledby="ann">
        <SectionTitle><span id="ann">Дастурлар анонси</span></SectionTitle>
        <ol className="grid gap-3 md:grid-cols-3">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-[var(--radius-card)] border border-white/5 bg-surface p-5">
              <time dateTime={a.date} className="text-xs font-semibold text-gold">{formatDate(a.date)}</time>
              <h3 className="mt-2 font-semibold leading-snug">{a.title}</h3>
              <p className="mt-2 text-sm text-muted">{a.text}</p>
            </li>
          ))}
        </ol>
      </section>
      )}

      <section className={announcements.length > 0 ? "mt-12" : ""} aria-labelledby="gal">
        <SectionTitle><span id="gal">Фото ва видео галерея</span></SectionTitle>
        <Gallery items={gallery} />
      </section>
    </>
  );
}
