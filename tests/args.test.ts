import { describe, expect, it } from "vitest";

import {
  audioArgs,
  compressArgs,
  convertArgs,
  copyContainer,
  extensionOf,
  fitSize,
  gifArgs,
  MB,
  mp4Audio,
  muteArgs,
  outputName,
  planBitrates,
  scaleFilter,
  transformArgs,
  trimArgs,
  trimContainer,
  vp8Kbps,
} from "../src/lib/args";
import { UserError } from "../src/lib/errors";
import type { MediaInfo } from "../src/lib/probe";

const info = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
  duration: 60,
  format: "mov,mp4,m4a,3gp,3g2,mj2",
  video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
  audio: { codec: "aac" },
  ...overrides,
});
const silent = info({ audio: undefined });
const io = { input: "/input/input.mp4", output: "/output.mp4" };

/** The value after an option, e.g. after("-vf"). */
const after = (args: string[], option: string) => args[args.indexOf(option) + 1];

describe("file names", () => {
  it("reads extensions", () => {
    expect(extensionOf("Holiday.MP4")).toBe("mp4");
    expect(extensionOf("no-extension")).toBe("");
  });

  it("keeps common containers and uses Matroska otherwise", () => {
    expect(copyContainer("a.mov")).toBe("mov");
    expect(copyContainer("a.webm")).toBe("webm");
    expect(copyContainer("a.avi")).toBe("mkv");
    expect(trimContainer("a.mov", true)).toBe("mp4");
    expect(trimContainer("a.webm", true)).toBe("webm");
    expect(trimContainer("a.mov", false)).toBe("mov");
  });

  it("names results", () => {
    expect(outputName("trip.final.mov", "compressed", "mp4")).toBe(
      "trip.final-compressed.mp4",
    );
    expect(outputName(".mp4", "muted", "mp4")).toBe("video-muted.mp4");
  });
});

describe("fitSize and scaleFilter", () => {
  it("limits the shorter side and keeps the shape", () => {
    expect(fitSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(fitSize(1080, 1920, 480)).toEqual({ width: 480, height: 854 });
    expect(fitSize(1440, 1080, 480)).toEqual({ width: 640, height: 480 });
  });

  it("never makes videos bigger, but makes odd sizes even", () => {
    expect(fitSize(640, 360, 720)).toEqual({ width: 640, height: 360 });
    expect(fitSize(641, 361)).toEqual({ width: 642, height: 362 });
    expect(scaleFilter(640, 360, 720)).toBeUndefined();
    expect(scaleFilter(641, 360)).toBe("scale=642:360");
    expect(scaleFilter(1920, 1080, 720)).toBe("scale=1280:720");
  });
});

describe("planBitrates", () => {
  it("fits video and audio into the size limit", () => {
    const { videoKbps, audioKbps } = planBitrates({
      duration: 60,
      targetBytes: 16 * MB,
      hasAudio: true,
    });
    expect(audioKbps).toBe(128);
    // 16 MB over 60 s is about 2237 kbit/s; 92% of it is kept
    expect(videoKbps).toBe(Math.floor((16 * MB * 8 * 0.92) / 60 / 1000) - 128);
    expect(((videoKbps + audioKbps) * 1000 * 60) / 8).toBeLessThan(16 * MB);
  });

  it("lowers the audio bitrate for long videos", () => {
    expect(
      planBitrates({ duration: 200, targetBytes: 16 * MB, hasAudio: true }).audioKbps,
    ).toBe(96);
    expect(
      planBitrates({ duration: 600, targetBytes: 25 * MB, hasAudio: true }).audioKbps,
    ).toBe(64);
    expect(
      planBitrates({ duration: 1200, targetBytes: 16 * MB, hasAudio: true }).audioKbps,
    ).toBe(32);
  });

  it("gives everything to the picture when there is no sound", () => {
    const plan = planBitrates({ duration: 10, targetBytes: MB, hasAudio: false });
    expect(plan.audioKbps).toBe(0);
    expect(plan.videoKbps).toBe(Math.floor((MB * 8 * 0.92) / 10 / 1000));
  });

  it("refuses sizes that are too small or unknown lengths", () => {
    expect(() =>
      planBitrates({ duration: 3600, targetBytes: 16 * MB, hasAudio: true }),
    ).toThrow(UserError);
    expect(() =>
      planBitrates({ duration: Number.NaN, targetBytes: 16 * MB, hasAudio: true }),
    ).toThrow(/length/);
  });
});

describe("compressArgs", () => {
  it("encodes to a bitrate with a downscale", () => {
    const args = compressArgs({
      ...io,
      info: info(),
      setting: { kind: "size", videoKbps: 1000, audioKbps: 96 },
      maxShortSide: 720,
    });
    expect(args).toEqual([
      "-i",
      "/input/input.mp4",
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-vf",
      "scale=1280:720",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "1000k",
      "-maxrate",
      "1250k",
      "-bufsize",
      "2000k",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "/output.mp4",
    ]);
  });

  it("encodes at a quality, without sound when there is none", () => {
    const args = compressArgs({
      ...io,
      info: silent,
      setting: { kind: "quality", quality: "small" },
    });
    expect(after(args, "-crf")).toBe("32");
    expect(args).toContain("-an");
    expect(args).not.toContain("-vf");
    expect(args.at(-1)).toBe("/output.mp4");
  });

  it("needs a picture", () => {
    expect(() =>
      compressArgs({
        ...io,
        info: info({ video: undefined }),
        setting: { kind: "quality", quality: "high" },
      }),
    ).toThrow(/no video/);
  });
});

describe("convertArgs", () => {
  it("copies H.264 and AAC into MP4 without re-encoding", () => {
    const args = convertArgs({ ...io, info: info(), target: "mp4" });
    expect(after(args, "-c")).toBe("copy");
    expect(args).not.toContain("libx264");
  });

  it("re-encodes other codecs to H.264", () => {
    const args = convertArgs({
      input: "/input/input.webm",
      output: "/output.mp4",
      info: info({
        video: { codec: "vp8", width: 641, height: 360, fps: 30 },
        audio: { codec: "opus" },
      }),
      target: "mp4",
    });
    expect(after(args, "-c:v")).toBe("libx264");
    expect(after(args, "-vf")).toBe("scale=642:360");
    expect(after(args, "-c:a")).toBe("aac");
  });

  it("makes WebM with VP8 and Opus, or copies when it already fits", () => {
    const args = convertArgs({
      ...io,
      output: "/output.webm",
      info: info(),
      target: "webm",
    });
    expect(after(args, "-c:v")).toBe("libvpx");
    expect(after(args, "-c:a")).toBe("libopus");
    const copied = convertArgs({
      ...io,
      output: "/output.webm",
      info: info({
        video: { codec: "vp9", width: 640, height: 360, fps: 30 },
        audio: { codec: "opus" },
      }),
      target: "webm",
    });
    expect(after(copied, "-c")).toBe("copy");
  });

  it("saves only the sound as MP3 or M4A", () => {
    const mp3 = convertArgs({
      ...io,
      output: "/output.mp3",
      info: info(),
      target: "mp3",
    });
    expect(mp3).toContain("-vn");
    expect(after(mp3, "-c:a")).toBe("libmp3lame");
    const m4a = convertArgs({
      ...io,
      output: "/output.m4a",
      info: info(),
      target: "m4a",
    });
    expect(after(m4a, "-c:a")).toBe("copy");
    expect(() => convertArgs({ ...io, info: silent, target: "mp3" })).toThrow(/no sound/);
  });

  it("makes a GIF of at most 60 seconds", () => {
    const args = convertArgs({
      ...io,
      output: "/output.gif",
      info: info({ duration: 300 }),
      target: "gif",
    });
    expect(after(args, "-t")).toBe("60");
    expect(after(args, "-filter_complex")).toContain("scale=480:-2");
  });
});

describe("audioArgs", () => {
  it("re-encodes non-AAC audio for M4A", () => {
    const args = audioArgs({
      ...io,
      output: "/output.m4a",
      info: info({ audio: { codec: "opus" } }),
      format: "m4a",
    });
    expect(after(args, "-c:a")).toBe("aac");
    expect(after(args, "-b:a")).toBe("192k");
  });
});

describe("gifArgs", () => {
  it("builds a palette for good colours", () => {
    const args = gifArgs({
      ...io,
      output: "/output.gif",
      info: info(),
      fps: 15,
      width: 320,
      start: 1.5,
      duration: 3,
    });
    expect(args.slice(0, 6)).toEqual(["-ss", "1.5", "-t", "3", "-i", "/input/input.mp4"]);
    const graph = after(args, "-filter_complex");
    expect(graph).toBe(
      "[0:v:0]fps=15,scale=320:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
    );
    expect(after(args, "-loop")).toBe("0");
  });

  it("does not enlarge narrow videos", () => {
    const args = gifArgs({
      ...io,
      output: "/output.gif",
      info: info({ video: { codec: "h264", width: 200, height: 100, fps: 25 } }),
      fps: 10,
      width: 480,
      start: 0,
      duration: 2,
    });
    expect(after(args, "-filter_complex")).toMatch(/^\[0:v:0\]fps=10,split/);
  });
});

describe("trimArgs", () => {
  it("copies streams for a fast cut", () => {
    const args = trimArgs({ ...io, info: info(), start: 2, end: 7.5, exact: false });
    expect(args.slice(0, 6)).toEqual(["-ss", "2", "-i", "/input/input.mp4", "-t", "5.5"]);
    expect(after(args, "-c")).toBe("copy");
    expect(args).toContain("+faststart");
  });

  it("re-encodes for an exact cut", () => {
    const args = trimArgs({ ...io, info: info(), start: 0, end: 1, exact: true });
    expect(after(args, "-c:v")).toBe("libx264");
    const webm = trimArgs({
      ...io,
      output: "/output.webm",
      info: info({ audio: { codec: "opus" } }),
      start: 0,
      end: 1,
      exact: true,
    });
    expect(after(webm, "-c:v")).toBe("libvpx");
    expect(webm).not.toContain("+faststart");
  });

  it("needs the end after the start", () => {
    expect(() =>
      trimArgs({ ...io, info: info(), start: 5, end: 5, exact: false }),
    ).toThrow(/end must be after/);
  });
});

describe("muteArgs", () => {
  it("copies the picture and drops the sound", () => {
    expect(muteArgs({ ...io, info: info() })).toEqual([
      "-i",
      "/input/input.mp4",
      "-map",
      "0:v:0",
      "-c",
      "copy",
      "-an",
      "-movflags",
      "+faststart",
      "/output.mp4",
    ]);
  });
});

describe("transformArgs", () => {
  it("rotates, mirrors and scales", () => {
    const args = transformArgs({
      ...io,
      info: info(),
      maxShortSide: 720,
      rotate: 90,
      flip: true,
    });
    expect(after(args, "-vf")).toBe("transpose=clock,hflip,scale=720:1280");
    expect(after(args, "-c:a")).toBe("copy");
  });

  it("turns upside down and to the left", () => {
    expect(
      after(transformArgs({ ...io, info: info(), rotate: 180, flip: false }), "-vf"),
    ).toBe("hflip,vflip");
    expect(
      after(transformArgs({ ...io, info: info(), rotate: 270, flip: false }), "-vf"),
    ).toBe("transpose=cclock");
  });

  it("refuses when nothing would change", () => {
    expect(() =>
      transformArgs({ ...io, info: info(), maxShortSide: 1080, rotate: 0, flip: false }),
    ).toThrow(/Nothing to change/);
  });
});

describe("codec helpers", () => {
  it("copies MP4-friendly audio and converts the rest", () => {
    expect(mp4Audio(info())).toEqual(["-c:a", "copy"]);
    expect(mp4Audio(info({ audio: { codec: "vorbis" } }))).toEqual([
      "-c:a",
      "aac",
      "-b:a",
      "160k",
    ]);
    expect(mp4Audio(silent)).toEqual(["-an"]);
  });

  it("picks a VP8 bitrate by picture size", () => {
    expect(vp8Kbps(info())).toBe(6221);
    expect(
      vp8Kbps(info({ video: { codec: "h264", width: 160, height: 120, fps: 10 } })),
    ).toBe(300);
    expect(
      vp8Kbps(info({ video: { codec: "h264", width: 3840, height: 2160, fps: 60 } })),
    ).toBe(8000);
  });
});
