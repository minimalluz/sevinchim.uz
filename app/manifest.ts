import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Севинчим — FM радио ва архив",
    short_name: "Севинчим",
    description: "Жонли FM радио эфири, архив дастурлар ва эфир жадвали.",
    lang: "uz-Cyrl",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0c14",
    theme_color: "#0e0c14",
    categories: ["music", "entertainment", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Жонли эфир", short_name: "Эфир", url: "/fm-radio", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Архив дастурлар", short_name: "Архив", url: "/arxiv", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
