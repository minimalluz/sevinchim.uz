import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AuthForms } from "@/components/profile/AuthForms";
import { Cabinet } from "@/components/profile/Cabinet";
import { currentUser, formatPhone, toPublic } from "@/lib/users";
import { userPayments } from "@/lib/premium";
import { botUsername } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Менинг профилим",
  description: "Шахсий кабинет: рўйхатдан ўтиш, кириш ва Premium обуна.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const user = await currentUser();
  const next = q.next && /^\/(?!\/)/.test(q.next) ? q.next : "/profil";

  if (!user) {
    return (
      <>
        <PageHeader
          eyebrow="Менинг профилим"
          title={q.tab === "register" ? "Рўйхатдан ўтиш" : "Хуш келибсиз"}
          lead="Рўйхатдан ўтинг ёки тизимга киринг: шахсий кабинет, Premium обуна ва барча дастурлар."
        />
        <AuthForms initialTab={q.tab === "register" ? "register" : "login"} next={next} />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Менинг профилим" title="Шахсий кабинет" />
      <Cabinet
        user={toPublic(user)}
        phone={formatPhone(user.phone)}
        payments={userPayments(user.id)}
        botReady={Boolean(await botUsername())}
        restored={q.tiklandi === "1"}
      />
    </>
  );
}
