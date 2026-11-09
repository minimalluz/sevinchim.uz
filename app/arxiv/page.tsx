import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { ArchiveBrowser } from "@/components/Archive";
import { PageHeader } from "@/components/ui";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Архив дастурлар",
  description: "Ўтган радио эшиттиришлар ва муаллифлик лойиҳалари: рукн ва сана бўйича саралаб, исталган вақтда қайта тингланг.",
  alternates: { canonical: "/arxiv" },
};

export default async function ArchivePage() {
  const { episodes, rubrics, profile } = await getContent();

  // Қидирув тизимлари учун: подкаст эпизодлари рўйхати
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: episodes.slice(0, 30).map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "RadioEpisode",
        name: e.title,
        description: e.description,
        datePublished: e.date,
        url: `${SITE_URL}/arxiv#ep-${e.id}`,
        associatedMedia: { "@type": "AudioObject", contentUrl: e.audio.startsWith("/") ? SITE_URL + e.audio : e.audio },
        partOfSeries: { "@type": "RadioSeries", name: e.rubric, author: { "@type": "Person", name: profile.name } },
      },
    })),
  };

  return (
    <>
      <PageHeader
        eyebrow="Медиатека"
        title="Архив дастурлар"
        lead="Ўтказиб юборган эфирларингизни қайта тингланг: 15 сония олдинга ёки орқага ўтинг, тезликни 1,25x ёки 1,5x га оширинг."
      />
      <ArchiveBrowser episodes={episodes} rubrics={rubrics} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
