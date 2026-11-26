import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ResetByLink, ResetByTelegram } from "@/components/profile/ResetForms";
import { getPremiumSettings } from "@/lib/premium";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Паролни тиклаш",
  robots: { index: false, follow: false },
};

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const token = q.t && /^[\w-]{20,64}$/.test(q.t) ? q.t : null;
  return (
    <>
      <PageHeader eyebrow="Менинг профилим" title="Паролни тиклаш" />
      {token ? <ResetByLink token={token} /> : <ResetByTelegram support={getPremiumSettings().support} />}
    </>
  );
}
