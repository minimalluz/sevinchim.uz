export const AUDIO_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
};

/** Файл номи: фақат лотин ҳарфлари, рақамлар, нуқта, чизиқча */
export const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

/** Юклаш учун энг катта ҳажм: 1 ГБ (бир неча соатлик эфир) */
export const MAX_UPLOAD = 1024 * 1024 * 1024;

/**
 * Битта бўлак ҳажми: 50 МБ. Cloudflare бепул тарифи 100 МБ дан катта
 * сўровларни ўтказмайди, шунинг учун катта файллар бўлаклаб юкланади.
 */
export const UPLOAD_CHUNK = 50 * 1024 * 1024;
/** Серверда қабул қилинадиган энг катта бўлак (заҳира билан) */
export const MAX_CHUNK = 64 * 1024 * 1024;
