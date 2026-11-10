import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { LivePlayerHero, NowOnAirCard, ScheduleGrid } from "@/components/Radio";
import { PageHeader, SectionTitle } from "@/components/ui";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getContent();
  return {
    title: "FM Радио — жонли эфир",
    description: `${profile.station} (${profile.frequency}) жонли эфирини онлайн тингланг. Ҳафталик эфир жадвали ва ҳозир эфирдаги дастур.`,
    alternates: { canonical: "/fm-radio" },
  };
}

export default async function FmRadioPage() {
  const { streams, liveFallback } = await getContent();
  const lead =
    streams.length > 0
      ? "Эфирни тўғридан-тўғри тингланг. Бошқа саҳифаларга ўтсангиз ҳам радио узилмайди."
      : liveFallback?.url
        ? `Жонли эфир ҳозирча ${liveFallback.label} платформасида — тугмани босинг, янги ойнада очилади.`
        : "Онлайн эфир тез орада уланади.";
  return (
    <>
      <PageHeader eyebrow="Жонли эфир" title="FM Радио" lead={lead} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <LivePlayerHero />
        <div className="space-y-8">
          <NowOnAirCard />
          <section>
            <SectionTitle>Эфир жадвали</SectionTitle>
            <ScheduleGrid />
            <p className="mt-3 text-xs text-muted">Вақтлар Тошкент вақти бўйича кўрсатилган.</p>
          </section>
        </div>
      </div>
    </>
  );
}
