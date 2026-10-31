import { parseClock } from "./time";

/** What ffmpeg reports about an input file. */
export interface MediaInfo {
  /** Seconds, or NaN when the file does not say. */
  duration: number;
  /** Container names, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  format: string;
  video?: {
    codec: string;
    /** Size as shown, after any rotation stored in the file. */
    width: number;
    height: number;
    fps: number;
  };
  audio?: {
    codec: string;
  };
}

/**
 * Reads the summary ffmpeg prints for "ffmpeg -i file". Only the first input
 * and its first video and audio streams are used.
 */
export const parseMediaInfo = (log: string): MediaInfo => {
  const info: MediaInfo = { duration: Number.NaN, format: "" };
  let rotation = 0;
  let inInput = false;
  let lastStream: "video" | "audio" | "other" | null = null;
  for (const line of log.split("\n")) {
    const input = /^Input #(\d+), ([^ ]+), from /.exec(line);
    if (input) {
      inInput = input[1] === "0";
      if (inInput) {
        info.format = input[2].replace(/,$/, "");
      }
      continue;
    }
    if (/^Output #\d+/.test(line)) {
      inInput = false;
    }
    if (!inInput) {
      continue;
    }
    const duration = /^\s+Duration: ([\d:.]+|N\/A)/.exec(line);
    if (duration) {
      info.duration = parseClock(duration[1]);
      continue;
    }
    const stream = /^\s+Stream #0:\d+[^:]*: (Video|Audio|\w+): (\w+)(.*)$/.exec(line);
    if (stream) {
      const [, kind, codec, rest] = stream;
      lastStream = "other";
      if (kind === "Video" && !info.video && !/\(attached pic\)/.test(rest)) {
        const size = /, (\d{2,5})x(\d{2,5})/.exec(rest);
        const fps = /, ([\d.]+)(k?) fps/.exec(rest) ?? /, ([\d.]+)(k?) tbr/.exec(rest);
        info.video = {
          codec,
          width: size ? Number(size[1]) : 0,
          height: size ? Number(size[2]) : 0,
          fps: fps ? Number(fps[1]) * (fps[2] ? 1000 : 1) : 0,
        };
        lastStream = "video";
      } else if (kind === "Audio" && !info.audio) {
        info.audio = { codec };
        lastStream = "audio";
      }
      continue;
    }
    const matrix = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(line);
    if (matrix && lastStream === "video") {
      rotation = Math.round(Number(matrix[1]));
    }
  }
  if (info.video && Math.abs(rotation) % 180 === 90) {
    const { width, height } = info.video;
    info.video.width = height;
    info.video.height = width;
  }
  return info;
};

/**
 * Reads the output time from an ffmpeg progress line such as
 * "frame=   50 fps= 12 q=28.0 size=     256kB time=00:00:02.00 bitrate=…".
 */
export const parseProgressTime = (line: string): number | undefined => {
  const match = /time=\s*(-?[\d:.]+)/.exec(line);
  if (!match) {
    return undefined;
  }
  const seconds = parseClock(match[1]);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
};
