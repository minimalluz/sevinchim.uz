/** Сайтнинг барча контент турлари. Маълумотлар data/content.json да сақланади. */

export type StreamQuality = {
  id: string;
  /** Масалан: «Юқори сифат» */
  label: string;
  /** Масалан: «128 kbps» */
  bitrate: string;
  /** Icecast (mp3/aac) ёки HLS (.m3u8) манзили */
  url: string;
};

export type Profile = {
  name: string;
  role: string;
  station: string;
  frequency: string;
  tagline: string;
  photo: string;
  bio: string[];
  timeline: { year: string; title: string; text: string }[];
  programs: { title: string; slot: string; text: string }[];
  socials: { label: string; url: string }[];
};

/** Ҳафта куни: 1 — Душанба … 7 — Якшанба */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScheduleSlot = {
  id: string;
  day: Weekday;
  /** «ЧЧ:ДД», Тошкент вақти */
  start: string;
  end: string;
  title: string;
  /** Бошловчининг ўз (муаллифлик) дастурими */
  own: boolean;
};

export type Episode = {
  id: string;
  title: string;
  rubric: string;
  /** «ЙЙЙЙ-ОО-КК» */
  date: string;
  /** Сонияда */
  duration: number;
  description: string;
  /** /api/audio/<файл> ёки ташқи URL */
  audio: string;
};

export type GalleryItem = {
  id: string;
  type: "photo" | "video";
  title: string;
  /** Сурат манзили (photo) ёки видео превьюси */
  src: string;
  /** Видео учун: YouTube ID ёки mp4 манзили */
  video?: string;
  date: string;
};

export type Announcement = {
  id: string;
  title: string;
  date: string;
  text: string;
};

/** Расмий оқим бўлмаганда жонли эфирни тинглаш мумкин бўлган ташқи саҳифа */
export type LiveFallback = { label: string; url: string };

export type SiteContent = {
  profile: Profile;
  /** Бўш бўлса — жонли эфир тугмалари liveFallback саҳифасига олиб боради */
  streams: StreamQuality[];
  liveFallback?: LiveFallback | null;
  schedule: ScheduleSlot[];
  rubrics: string[];
  episodes: Episode[];
  gallery: GalleryItem[];
  announcements: Announcement[];
};
