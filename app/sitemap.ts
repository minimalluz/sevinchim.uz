import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { episodes } = await getContent();
  const lastEpisode = episodes[0]?.date;
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/fm-radio`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/arxiv`, changeFrequency: "daily", priority: 0.9, lastModified: lastEpisode },
    { url: `${SITE_URL}/haqida`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/media`, changeFrequency: "weekly", priority: 0.6 },
  ];
}
