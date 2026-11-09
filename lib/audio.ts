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

/** Юклаш учун энг катта ҳажм: 500 МБ */
export const MAX_UPLOAD = 500 * 1024 * 1024;
