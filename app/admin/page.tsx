import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Бошқарув панели",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!adminConfigured()) {
    return (
      <section className="mx-auto max-w-lg py-16">
        <h1 className="font-display text-2xl font-bold">Бошқарув панели ёқилмаган</h1>
        <p className="mt-3 text-muted">
          Серверда <code className="rounded bg-surface px-1.5 py-0.5 text-ink">ADMIN_PASSWORD</code> (камида 8 белги) ва{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 text-ink">SESSION_SECRET</code> ўзгарувчиларини ўрнатинг ва сайтни қайта ишга туширинг.
        </p>
      </section>
    );
  }

  if (!(await isAdmin())) return <LoginForm />;

  const content = await getContent();
  return <AdminDashboard content={content} />;
}
