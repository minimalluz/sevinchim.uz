import type { Metadata, Viewport } from "next";
import { Inter, Unbounded } from "next/font/google";
import "./globals.css";
import { getContent } from "@/lib/content";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { SiteDataProvider } from "@/components/SiteData";
import { BottomTabBar, SiteFooter, SiteHeader } from "@/components/Navigation";
import { ServiceWorkerRegister } from "@/components/ServiceWorker";

const inter = Inter({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-inter",
  display: "swap",
});
const unbounded = Unbounded({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-unbounded",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getContent();
  const title = profile.slogan
    ? `${profile.name} — ${profile.slogan.toLowerCase()} | ${SITE_NAME}`
    : `${profile.name} — ${profile.role.toLowerCase()} | ${SITE_NAME}`;
  const description = `${profile.slogan ? profile.slogan + ". " : ""}${profile.role} ${profile.name}нинг расмий сайти: «${profile.station}» жонли эфири, архив дастурлар, эфир жадвали ва янгиликлар.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    applicationName: SITE_NAME,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "uz_UZ",
      siteName: SITE_NAME,
      title,
      description,
      url: "/",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
    icons: {
      icon: [
        { url: "/icons/icon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0e0c14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { profile, streams, schedule, liveFallback } = await getContent();
  return (
    <html lang="uz-Cyrl" className={`${inter.variable} ${unbounded.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
          Асосий қисмга ўтиш
        </a>
        <SiteDataProvider
          value={{
            name: profile.name,
            station: profile.station,
            frequency: profile.frequency,
            schedule,
            hasStream: streams.length > 0,
            liveFallback: liveFallback?.url ? liveFallback : null,
          }}
        >
          <PlayerProvider streams={streams} hostName={profile.name} station={profile.station}>
            <SiteHeader name={profile.name} />
            <main id="main" className="page-pad mx-auto max-w-6xl px-4">
              {children}
            </main>
            <SiteFooter name={profile.name} socials={profile.socials} />
            <MiniPlayer />
            <BottomTabBar />
          </PlayerProvider>
        </SiteDataProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
