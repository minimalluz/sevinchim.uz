"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Ким кирган ва Premium'ми — браузерда. Саҳифалар кэшланади (ҳамма учун
 * бир хил), шунинг учун бу маълумот /api/me дан алоҳида олинади.
 * Эслатма: бу фақат кўриниш учун; ҳуқуқ серверда (/api/audio) текширилади.
 */
export type Me = { name: string; premium: boolean; premiumUntil: number | null } | null;

const Ctx = createContext<{ user: Me; ready: boolean; refresh: () => void }>({ user: null, ready: false, refresh: () => undefined });

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me>(null);
  const [ready, setReady] = useState(false);
  const path = usePathname();

  const refresh = useCallback(() => {
    fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: Me }) => setUser(d.user))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  // Саҳифа алмашганда (кириш/чиқишдан кейин) ва ойнага қайтилганда янгилаймиз
  useEffect(() => {
    refresh();
  }, [refresh, path]);
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [refresh]);

  return <Ctx.Provider value={{ user, ready, refresh }}>{children}</Ctx.Provider>;
}

export const useUser = () => useContext(Ctx);
