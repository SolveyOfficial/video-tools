/**
 * Reads a time typed by the user: "75", "75.5", "1:15", "1:15.5" or
 * "0:01:15". Returns seconds, or NaN if the text is not a time.
 */
export const parseTime = (text: string): number => {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(trimmed)) {
    return Number.NaN;
  }
  const parts = trimmed.split(":").map(Number);
  // minutes and seconds after the first part must be below 60
  if (parts.slice(1).some((part) => part >= 60)) {
    return Number.NaN;
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
};

/** Reads an ffmpeg time such as "00:01:02.50" into seconds. */
export const parseClock = (text: string): number => {
  const match = /^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text.trim());
  if (!match) {
    return Number.NaN;
  }
  const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]);
  return match[1] ? -seconds : seconds;
};

/**
 * Shows seconds as "m:ss.s" (or "h:mm:ss.s"), the format parseTime reads.
 * Tenths are only shown when they are not zero.
 */
export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const tenths = Math.round(seconds * 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = `${String(s).padStart(2, "0")}${fraction ? `.${fraction}` : ""}`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** Seconds as an ffmpeg argument, with at most three decimals. */
export const secondsArg = (seconds: number): string =>
  String(Math.round(Math.max(0, seconds) * 1000) / 1000);
