// Builds ffmpeg command lines for each tool. Everything here is pure, so it
// can be tested without running ffmpeg.
import { UserError } from "./errors";
import type { MediaInfo } from "./probe";
import { secondsArg } from "./time";

export const MB = 1024 * 1024;

/** Containers that keep their format when a video is trimmed or muted. */
const KEEP_CONTAINERS = ["mp4", "m4v", "mov", "webm", "mkv"] as const;
export type Container = (typeof KEEP_CONTAINERS)[number];

/** File extension, lower case, without the dot. */
export const extensionOf = (name: string) =>
  /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";

/**
 * The container to keep when copying streams without re-encoding: the same as
 * the input when it is a common one, otherwise Matroska, which takes any codec.
 */
export const copyContainer = (name: string): Container => {
  const extension = extensionOf(name);
  return (KEEP_CONTAINERS as readonly string[]).includes(extension)
    ? (extension as Container)
    : "mkv";
};

export const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  gif: "image/gif",
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * The size of a video whose shorter side is at most `maxShortSide` pixels,
 * keeping the shape and rounding to even numbers (which H.264 needs). Videos
 * are never made bigger.
 */
export const fitSize = (width: number, height: number, maxShortSide?: number) => {
  const short = Math.min(width, height);
  const scale = maxShortSide && short > maxShortSide ? maxShortSide / short : 1;
  return { width: even(width * scale), height: even(height * scale) };
};

/** A scale filter for fitSize, or undefined when nothing would change. */
export const scaleFilter = (
  width: number,
  height: number,
  maxShortSide?: number,
): string | undefined => {
  const size = fitSize(width, height, maxShortSide);
  return size.width === width && size.height === height
    ? undefined
    : `scale=${size.width}:${size.height}`;
};

/**
 * Splits a size limit into video and audio bitrates (in kbit/s) for a video
 * of the given length, keeping a margin for the container and for the
 * encoder overshooting a little.
 */
export const planBitrates = (options: {
  duration: number;
  targetBytes: number;
  hasAudio: boolean;
}) => {
  const { duration, targetBytes, hasAudio } = options;
  if (!(duration > 0)) {
    throw new UserError("The length of this video is unknown, so it can't be sized.");
  }
  const totalKbps = (targetBytes * 8 * 0.92) / duration / 1000;
  const audioKbps = !hasAudio
    ? 0
    : totalKbps >= 1000
      ? 128
      : totalKbps >= 400
        ? 96
        : totalKbps >= 150
          ? 64
          : 32;
  const videoKbps = Math.floor(totalKbps - audioKbps);
  if (videoKbps < 60) {
    throw new UserError(
      "This video is too long to fit in that size with watchable quality. Choose a bigger size, or trim it first.",
    );
  }
  return { videoKbps, audioKbps };
};

/** H.264 video at a constant quality, fast enough for the browser. */
const h264 = (crf: number) => [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  String(crf),
  "-pix_fmt",
  "yuv420p",
];

/** Audio for an MP4: copied when it already fits, otherwise AAC. */
export const mp4Audio = (info: MediaInfo, kbps = 160) =>
  !info.audio
    ? ["-an"]
    : ["aac", "mp3"].includes(info.audio.codec)
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", `${kbps}k`];

/** A bitrate for VP8 that suits the picture size, in kbit/s. */
export const vp8Kbps = (info: MediaInfo) => {
  const { width = 640, height = 360, fps = 30 } = info.video ?? {};
  const kbps = (width * height * Math.min(fps || 30, 60) * 0.1) / 1000;
  return Math.round(Math.min(8000, Math.max(300, kbps)));
};

/** VP8 video and Opus audio for WebM, tuned for speed. */
const webmCodecs = (info: MediaInfo) => [
  "-c:v",
  "libvpx",
  "-deadline",
  "realtime",
  "-cpu-used",
  "8",
  "-b:v",
  `${vp8Kbps(info)}k`,
  "-crf",
  "10",
  "-qmin",
  "4",
  "-qmax",
  "48",
  ...(info.audio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"]),
];

const firstStreams = ["-map", "0:v:0?", "-map", "0:a:0?"];
const fastStart = ["-movflags", "+faststart"];
const withFilters = (filters: (string | undefined)[]) => {
  const chain = filters.filter(Boolean).join(",");
  return chain ? ["-vf", chain] : [];
};

const needVideo = (info: MediaInfo) => {
  if (!info.video) {
    throw new UserError("This file has no video picture.");
  }
  return info.video;
};

const needAudio = (info: MediaInfo) => {
  if (!info.audio) {
    throw new UserError("This video has no sound to save.");
  }
  return info.audio;
};

export type CompressQuality = "high" | "medium" | "small";
export const CRF: Record<CompressQuality, number> = { high: 23, medium: 28, small: 32 };

export type CompressSetting =
  | { kind: "size"; videoKbps: number; audioKbps: number }
  | { kind: "quality"; quality: CompressQuality };

export const compressArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  setting: CompressSetting;
  maxShortSide?: number;
}) => {
  const { input, output, info, setting, maxShortSide } = options;
  const video = needVideo(info);
  const rate =
    setting.kind === "size"
      ? [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-b:v",
          `${setting.videoKbps}k`,
          "-maxrate",
          `${Math.round(setting.videoKbps * 1.25)}k`,
          "-bufsize",
          `${setting.videoKbps * 2}k`,
        ]
      : h264(CRF[setting.quality]);
  const audioKbps = setting.kind === "size" ? setting.audioKbps : 128;
  return [
    "-i",
    input,
    ...firstStreams,
    ...withFilters([scaleFilter(video.width, video.height, maxShortSide)]),
    ...rate,
    ...(info.audio ? ["-c:a", "aac", "-b:a", `${audioKbps}k`] : ["-an"]),
    ...fastStart,
    output,
  ];
};

/** Converting to GIF keeps at most this many seconds from the start. */
export const GIF_MAX_SECONDS = 60;

export type ConvertTarget = "mp4" | "webm" | "mp3" | "m4a" | "gif";

export const audioArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  format: "mp3" | "m4a";
}) => {
  const { input, output, info, format } = options;
  const audio = needAudio(info);
  const codec =
    format === "mp3"
      ? ["-c:a", "libmp3lame", "-q:a", "2"]
      : audio.codec === "aac"
        ? ["-c:a", "copy"]
        : ["-c:a", "aac", "-b:a", "192k"];
  return [
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    ...codec,
    ...(format === "m4a" ? fastStart : []),
    output,
  ];
};

export const gifArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  fps: number;
  /** Width in pixels, or 0 to keep the video's width. */
  width: number;
  start: number;
  duration: number;
}) => {
  const { input, output, info, fps, width, start, duration } = options;
  const video = needVideo(info);
  const scale =
    width && width < video.width ? `scale=${width}:-2:flags=lanczos` : undefined;
  const filters = [`fps=${fps}`, scale].filter(Boolean).join(",");
  return [
    "-ss",
    secondsArg(start),
    "-t",
    secondsArg(duration),
    "-i",
    input,
    "-filter_complex",
    `[0:v:0]${filters},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`,
    "-loop",
    "0",
    output,
  ];
};

export const convertArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  target: ConvertTarget;
}) => {
  const { input, output, info, target } = options;
  switch (target) {
    case "mp3":
    case "m4a":
      return audioArgs({ input, output, info, format: target });
    case "gif": {
      const video = needVideo(info);
      return gifArgs({
        input,
        output,
        info,
        fps: 10,
        width: Math.min(480, video.width),
        start: 0,
        duration: Math.min(GIF_MAX_SECONDS, info.duration || GIF_MAX_SECONDS),
      });
    }
    case "webm": {
      const video = needVideo(info);
      const copy =
        ["vp8", "vp9", "av1"].includes(video.codec) &&
        (!info.audio || ["opus", "vorbis"].includes(info.audio.codec));
      return [
        "-i",
        input,
        ...firstStreams,
        ...(copy
          ? ["-c", "copy"]
          : [
              ...withFilters([scaleFilter(video.width, video.height)]),
              ...webmCodecs(info),
            ]),
        output,
      ];
    }
    case "mp4": {
      const video = needVideo(info);
      const copy =
        video.codec === "h264" &&
        video.width % 2 === 0 &&
        (!info.audio || ["aac", "mp3"].includes(info.audio.codec));
      return [
        "-i",
        input,
        ...firstStreams,
        ...(copy
          ? ["-c", "copy"]
          : [
              ...withFilters([scaleFilter(video.width, video.height)]),
              ...h264(23),
              ...mp4Audio(info),
            ]),
        ...fastStart,
        output,
      ];
    }
  }
};

/** The container a trimmed video is saved in. */
export const trimContainer = (name: string, exact: boolean): Container => {
  const container = copyContainer(name);
  return exact && container !== "webm" ? "mp4" : container;
};

export const trimArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  start: number;
  end: number;
  exact: boolean;
}) => {
  const { input, output, info, start, end, exact } = options;
  if (!(end > start)) {
    throw new UserError("The end must be after the start.");
  }
  const container = extensionOf(output);
  const codecs = !exact
    ? ["-map", "0:v?", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero"]
    : [
        ...firstStreams,
        ...(container === "webm"
          ? webmCodecs(info)
          : [
              ...withFilters([
                info.video && scaleFilter(info.video.width, info.video.height),
              ]),
              ...h264(20),
              ...(info.audio ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"]),
            ]),
      ];
  return [
    "-ss",
    secondsArg(start),
    "-i",
    input,
    "-t",
    secondsArg(end - start),
    ...codecs,
    ...(["mp4", "m4v", "mov"].includes(container) ? fastStart : []),
    output,
  ];
};

export const muteArgs = (options: { input: string; output: string; info: MediaInfo }) => {
  needVideo(options.info);
  const container = extensionOf(options.output);
  return [
    "-i",
    options.input,
    "-map",
    "0:v:0",
    "-c",
    "copy",
    "-an",
    ...(["mp4", "m4v", "mov"].includes(container) ? fastStart : []),
    options.output,
  ];
};

export type Rotation = 0 | 90 | 180 | 270;

export const transformArgs = (options: {
  input: string;
  output: string;
  info: MediaInfo;
  maxShortSide?: number;
  /** Clockwise. */
  rotate: Rotation;
  flip: boolean;
}) => {
  const { input, output, info, maxShortSide, rotate, flip } = options;
  const video = needVideo(info);
  const turned = rotate === 90 || rotate === 270;
  const width = turned ? video.height : video.width;
  const height = turned ? video.width : video.height;
  const scale = scaleFilter(width, height, maxShortSide);
  const filters = [
    rotate === 90 ? "transpose=clock" : undefined,
    rotate === 270 ? "transpose=cclock" : undefined,
    rotate === 180 ? "hflip,vflip" : undefined,
    flip ? "hflip" : undefined,
    scale,
  ];
  if (!rotate && !flip && !fitsChange(video.width, video.height, maxShortSide)) {
    throw new UserError(
      "Nothing to change: choose a smaller size, a rotation or a mirror image.",
    );
  }
  return [
    "-i",
    input,
    ...firstStreams,
    ...withFilters(filters),
    ...h264(20),
    ...mp4Audio(info),
    ...fastStart,
    output,
  ];
};

const fitsChange = (width: number, height: number, maxShortSide?: number) =>
  !!maxShortSide && Math.min(width, height) > maxShortSide;

/** The name of a result file, e.g. "holiday-compressed.mp4". */
export const outputName = (name: string, suffix: string, extension: string) =>
  `${name.replace(/\.[^.]+$/, "") || "video"}-${suffix}.${extension}`;
