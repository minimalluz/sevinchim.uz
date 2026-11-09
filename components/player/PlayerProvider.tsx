"use client";

/**
 * Узлуксиз плеер.
 * <audio> элементи илдиз layout ичида яшайди, шунинг учун саҳифалар ўртасида
 * ўтганда (SPA навигация) овоз узилмайди. Жонли эфир (Icecast/HLS) ва архив
 * эшиттиришлар шу битта плеер орқали ижро этилади.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import type Hls from "hls.js";
import type { Episode, StreamQuality } from "@/lib/types";

export type Track =
  | { kind: "live"; id: "live"; title: string; subtitle: string }
  | { kind: "episode"; id: string; title: string; subtitle: string; src: string; duration: number };

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

type PlayerApi = {
  track: Track | null;
  status: PlayerStatus;
  error: string | null;
  currentTime: number;
  duration: number;
  rate: number;
  qualities: StreamQuality[];
  quality: string;
  playLive: () => void;
  playEpisode: (ep: Episode) => void;
  toggle: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  skip: (delta: number) => void;
  setRate: (r: number) => void;
  setQuality: (id: string) => void;
  isCurrent: (id: string) => boolean;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer PlayerProvider ичида ишлатилиши керак");
  return ctx;
}

const store = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* хотира ёпиқ бўлиши мумкин */ }
  },
};

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

export function PlayerProvider({
  children, streams, hostName, station,
}: {
  children: ReactNode;
  streams: StreamQuality[];
  hostName: string;
  station: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryRef = useRef<{ n: number; timer?: ReturnType<typeof setTimeout> }>({ n: 0 });
  const lastSaveRef = useRef(0);

  const [track, setTrack] = useState<Track | null>(null);
  const trackRef = useRef<Track | null>(null);
  trackRef.current = track;

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  const [quality, setQualityState] = useState(streams[0]?.id ?? "");
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useEffect(() => {
    const saved = store.get("sv-quality");
    if (saved && streams.some((s) => s.id === saved)) setQualityState(saved);
  }, [streams]);

  const streamUrl = useCallback(
    (id = qualityRef.current) => (streams.find((s) => s.id === id) ?? streams[0])?.url ?? "",
    [streams],
  );

  const teardownHls = () => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  };

  /** Манбани улаш (HLS бўлса — hls.js орқали, Safari'да эса натив) */
  const attach = useCallback(async (url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    teardownHls();
    if (isHls(url) && !audio.canPlayType("application/vnd.apple.mpegurl")) {
      const { default: HlsLib } = await import("hls.js");
      if (HlsLib.isSupported()) {
        const hls = new HlsLib({ lowLatencyMode: true, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (data.fatal) audio.dispatchEvent(new Event("error"));
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
        return;
      }
    }
    audio.src = url;
  }, []);

  const startPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
    } catch (e) {
      // Манба хатолари (тармоқ, формат) <audio> нинг «error» ҳодисасида
      // қайта уланиш билан бирга ишланади; бу ерда фақат браузер тақиқи.
      if ((e as DOMException)?.name === "NotAllowedError") {
        setStatus("paused");
        setError("Тинглаш учун ижро тугмасини босинг.");
      }
    }
  }, []);

  const loadLive = useCallback(async () => {
    const url = streamUrl();
    setError(null);
    if (!url) {
      setStatus("error");
      setError("Радио оқими ҳали уланмаган.");
      return;
    }
    setStatus("loading");
    // Icecast: ҳар сафар янги уланиш — эфирнинг айни дақиқасидан бошланади
    const fresh = isHls(url) ? url : url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
    await attach(fresh);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = 1;
    await startPlayback();
  }, [attach, startPlayback, streamUrl]);

  const playLive = useCallback(() => {
    clearTimeout(retryRef.current.timer);
    retryRef.current.n = 0;
    setTrack({ kind: "live", id: "live", title: "Жонли эфир", subtitle: `${station} • ${hostName}` });
    setCurrentTime(0);
    setDuration(0);
    void loadLive();
  }, [hostName, loadLive, station]);

  const playEpisode = useCallback((ep: Episode) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearTimeout(retryRef.current.timer);
    if (trackRef.current?.id === ep.id) {
      if (audio.paused) void startPlayback();
      return;
    }
    setTrack({ kind: "episode", id: ep.id, title: ep.title, subtitle: ep.rubric, src: ep.audio, duration: ep.duration });
    setError(null);
    setStatus("loading");
    setCurrentTime(0);
    setDuration(ep.duration || 0);
    void attach(ep.audio).then(() => {
      // Олдин тўхтатилган жойдан давом эттирамиз
      const saved = Number(store.get("sv-pos-" + ep.id) || 0);
      const resume = () => {
        if (saved > 10 && saved < (audio.duration || ep.duration) - 15) audio.currentTime = saved;
        audio.playbackRate = rateRef.current;
      };
      audio.addEventListener("loadedmetadata", resume, { once: true });
      void startPlayback();
    });
  }, [attach, startPlayback]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    const t = trackRef.current;
    if (!audio || !t) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    // Жонли эфирни давом эттирганда — эфирнинг ҳозирги дақиқасига қайтамиз
    if (t.kind === "live") void loadLive();
    else void startPlayback();
  }, [loadLive, startPlayback]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    clearTimeout(retryRef.current.timer);
    teardownHls();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setTrack(null);
    setStatus("idle");
    setError(null);
  }, []);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (!audio || trackRef.current?.kind !== "episode") return;
    const max = audio.duration || trackRef.current.duration || 0;
    audio.currentTime = Math.max(0, Math.min(t, max - 0.25));
    setCurrentTime(audio.currentTime);
  }, []);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + delta);
  }, [seek]);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    const audio = audioRef.current;
    if (audio && trackRef.current?.kind === "episode") audio.playbackRate = r;
  }, []);

  const setQuality = useCallback((id: string) => {
    setQualityState(id);
    qualityRef.current = id;
    store.set("sv-quality", id);
    const audio = audioRef.current;
    if (trackRef.current?.kind === "live" && audio && !audio.paused) void loadLive();
  }, [loadLive]);

  /* ---------- <audio> ҳодисалари ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      retryRef.current.n = 0;
      setStatus("playing");
      setError(null);
    };
    const onWaiting = () => setStatus("loading");
    const onPause = () => setStatus((s) => (s === "error" ? s : "paused"));
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      const t = trackRef.current;
      if (t?.kind === "episode" && Date.now() - lastSaveRef.current > 4000) {
        lastSaveRef.current = Date.now();
        store.set("sv-pos-" + t.id, String(Math.floor(audio.currentTime)));
      }
    };
    const onDuration = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => {
      const t = trackRef.current;
      if (t?.kind === "episode") store.set("sv-pos-" + t.id, "0");
      setStatus("paused");
    };
    const onError = () => {
      const t = trackRef.current;
      if (!t || !audio.getAttribute("src") && !hlsRef.current) return;
      if (t.kind === "live" && retryRef.current.n < 5) {
        // Тармоқ узилса — қайта уланишга уринамиз (2, 4, 8 … сония)
        const delay = 2000 * 2 ** retryRef.current.n;
        retryRef.current.n += 1;
        setStatus("loading");
        setError("Эфирга қайта уланмоқда…");
        retryRef.current.timer = setTimeout(() => void loadLive(), delay);
        return;
      }
      setStatus("error");
      setError(t.kind === "live"
        ? "Эфирга уланиб бўлмади. Интернет алоқасини текшириб, қайта уриниб кўринг."
        : "Аудиони юклаб бўлмади. Бироздан сўнг қайта уриниб кўринг.");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [loadLive]);

  /* ---------- Media Session: қулф экранидан бошқариш ---------- */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: hostName,
      album: track.kind === "live" ? `${station} — жонли эфир` : `${station} — архив`,
      artwork: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    const isEp = track.kind === "episode";
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, handler); } catch { /* қўллаб-қувватланмайди */ }
    };
    set("play", () => toggle());
    set("pause", () => pause());
    set("stop", () => stop());
    set("seekbackward", isEp ? (d) => skip(-(d.seekOffset || 15)) : null);
    set("seekforward", isEp ? (d) => skip(d.seekOffset || 15) : null);
    set("seekto", isEp ? (d) => d.seekTime != null && seek(d.seekTime) : null);
  }, [track, hostName, station, toggle, pause, stop, skip, seek]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      status === "playing" ? "playing" : status === "paused" ? "paused" : "none";
    const audio = audioRef.current;
    if (track?.kind === "episode" && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: Math.min(audio.currentTime, audio.duration),
          playbackRate: audio.playbackRate,
        });
      } catch { /* эътиборсиз */ }
    }
  }, [status, track, currentTime, rate]);

  useEffect(() => () => teardownHls(), []);

  const value = useMemo<PlayerApi>(() => ({
    track, status, error, currentTime, duration, rate, qualities: streams, quality,
    playLive, playEpisode, toggle, pause, stop, seek, skip, setRate, setQuality,
    isCurrent: (id: string) => track?.id === id,
  }), [track, status, error, currentTime, duration, rate, streams, quality,
    playLive, playEpisode, toggle, pause, stop, seek, skip, setRate, setQuality]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" playsInline hidden />
    </PlayerContext.Provider>
  );
}
