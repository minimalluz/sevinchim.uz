export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sevinchim.uz").replace(/\/$/, "");
export const SITE_NAME = "Севинчим";
/** Саҳифалар кэши: админ ўзгартирганда дарҳол янгиланади, бўлмаса ҳар соатда */
export const REVALIDATE = 3600;
