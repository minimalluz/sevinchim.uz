import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronRight } from "./icons";

export function PageHeader({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <header className="pt-6 pb-6 md:pt-10">
      {eyebrow && <p className="mb-2 text-sm font-semibold text-brand">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-extrabold leading-tight md:text-5xl">{title}</h1>
      {lead && <p className="mt-3 max-w-2xl text-muted md:text-lg">{lead}</p>}
    </header>
  );
}

export function SectionTitle({ children, href, linkLabel }: { children: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-display text-xl font-bold md:text-2xl">{children}</h2>
      {href && (
        <Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline">
          {linkLabel ?? "Барчаси"} <IconChevronRight width={16} height={16} />
        </Link>
      )}
    </div>
  );
}
