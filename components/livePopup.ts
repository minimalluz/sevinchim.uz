import type { MouseEvent } from "react";

/**
 * Жонли эфирни ташқи платформада (Mediabay) кичик ойнада очиш — тингловчи
 * сайтдан чиқмайди. Телефонда ёки браузер ойнани блокласа — одатдагидек
 * янги варақ (ҳаволанинг ўзи target="_blank").
 */
export function openLivePopup(e: MouseEvent<HTMLAnchorElement>) {
  if (typeof window === "undefined") return;
  // Телефон ва планшетларда кичик ойна йўқ — оддий янги варақ
  const desktop = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
  if (!desktop || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const w = 500;
  const h = 600;
  const left = Math.max(0, window.screenX + window.outerWidth - w - 40);
  const top = Math.max(0, window.screenY + 80);
  const win = window.open(e.currentTarget.href, "sevinchim-live", `popup=yes,width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);
  if (win) {
    e.preventDefault();
    win.focus();
  }
  // win === null — браузер блоклади: ҳавола ўзи янги варақда очилади
}
