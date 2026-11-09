import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-display text-7xl font-extrabold text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold">Бу саҳифа эфирда йўқ</h1>
      <p className="mt-2 text-muted">Манзил нотўғри ёки саҳифа ўчирилган бўлиши мумкин.</p>
      <Link href="/" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-bg">
        Бош саҳифага қайтиш
      </Link>
    </section>
  );
}
