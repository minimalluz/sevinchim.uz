"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LiveFallback, ScheduleSlot } from "@/lib/types";
import { onAir } from "@/lib/format";

type SiteData = {
  name: string;
  station: string;
  frequency: string;
  schedule: ScheduleSlot[];
  /** Расмий оқим манзили киритилганми */
  hasStream: boolean;
  /** Оқим бўлмаганда жонли эфир тингланадиган ташқи саҳифа */
  liveFallback: LiveFallback | null;
};

const Ctx = createContext<SiteData | null>(null);

export function SiteDataProvider({ value, children }: { value: SiteData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SiteDataProvider топилмади");
  return v;
}

/**
 * «Ҳозир эфирда» ҳолати. Вақт фақат браузерда ҳисобланади (гидратация
 * фарқи бўлмаслиги учун), ҳар 30 сонияда янгиланади.
 */
export function useOnAir() {
  const { schedule } = useSiteData();
  const [state, setState] = useState<ReturnType<typeof onAir> | null>(null);
  useEffect(() => {
    const tick = () => setState(onAir(schedule));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [schedule]);
  return state;
}
