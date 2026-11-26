import { currentUser, isPremium } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Сайт қобиғи учун: ким кирган ва Premium'ми (саҳифалар кэшланади, шу сабаб алоҳида) */
export async function GET() {
  const u = await currentUser();
  const body = u ? { user: { name: u.name, premium: isPremium(u), premiumUntil: u.premium_until } } : { user: null };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
