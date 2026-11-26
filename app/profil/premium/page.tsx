import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PremiumPay } from "@/components/profile/PremiumPay";
import { currentUser } from "@/lib/users";
import { getPremiumSettings, pendingPayment } from "@/lib/premium";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Premium обуна",
  robots: { index: false, follow: false },
};

export default async function PremiumPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/profil?next=/profil/premium");
  const q = await searchParams;
  const st = getPremiumSettings();
  const pending = pendingPayment(user.id);
  return (
    <>
      <PageHeader eyebrow="Менинг профилим" title="Premium обуна" />
      {q.yuborildi === "1" && pending && (
        <p className="mx-auto mb-5 max-w-2xl rounded-2xl bg-mint/10 px-4 py-3 text-sm font-semibold text-mint" role="status">
          ✓ Чек юборилди! Администратор текширгач, Premium ўзи фаоллашади.
        </p>
      )}
      <PremiumPay
        price={st.price}
        days={st.days}
        card={st.cardNumber}
        holder={st.cardHolder}
        bank={st.cardBank}
        note={st.note}
        pending={pending ? { id: pending.id, created_at: pending.created_at, amount: pending.amount } : null}
        premiumUntil={user.premium_until}
      />
    </>
  );
}
