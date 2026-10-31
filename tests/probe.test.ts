import { describe, expect, it } from "vitest";

import { parseMediaInfo, parseProgressTime } from "../src/lib/probe";

const MP4 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/input/input.mp4':
  Metadata:
    major_brand     : isom
    encoder         : Lavf59.27.100
  Duration: 00:00:04.02, start: 0.000000, bitrate: 312 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 320x240 [SAR 1:1 DAR 4:3], 180 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
    Metadata:
      handler_name    : VideoHandler
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;

const PHONE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/input/input.mov':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 8000 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)
    Side data:
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 256 kb/s (default)
  Stream #0:2[0x3](und): Data: none (mebx / 0x7862656D), 0 kb/s (default)`;

const RECORDING = `Input #0, matroska,webm, from '/input/input.webm':
  Metadata:
    encoder         : Chrome
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0(eng): Video: vp8, yuv420p(progressive), 640x360, SAR 1:1 DAR 16:9, 1k tbr, 1k tbn (default)`;

const AUDIO = `Input #0, mp3, from '/input/input.mp3':
  Duration: 00:03:00.05, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)`;

describe("parseMediaInfo", () => {
  it("reads an MP4 with video and audio", () => {
    expect(parseMediaInfo(MP4)).toEqual({
      duration: 4.02,
      format: "mov,mp4,m4a,3gp,3g2,mj2",
      video: { codec: "h264", width: 320, height: 240, fps: 25 },
      audio: { codec: "aac" },
    });
  });

  it("swaps the size of rotated phone videos", () => {
    const info = parseMediaInfo(PHONE);
    expect(info.duration).toBe(62.5);
    expect(info.video).toEqual({ codec: "hevc", width: 1080, height: 1920, fps: 29.97 });
  });

  it("handles recordings without a length and without sound", () => {
    const info = parseMediaInfo(RECORDING);
    expect(info.duration).toBeNaN();
    expect(info.format).toBe("matroska,webm");
    expect(info.video).toEqual({ codec: "vp8", width: 640, height: 360, fps: 1000 });
    expect(info.audio).toBeUndefined();
  });

  it("ignores cover pictures in audio files", () => {
    const info = parseMediaInfo(AUDIO);
    expect(info.video).toBeUndefined();
    expect(info.audio).toEqual({ codec: "mp3" });
  });

  it("only reads the input, not the output", () => {
    const info = parseMediaInfo(
      `${MP4}\nOutput #0, mp4, to '/output.mp4':\n  Stream #0:0: Video: h264, yuv420p, 160x120, q=2-31, 25 fps`,
    );
    expect(info.video?.width).toBe(320);
  });

  it("returns nothing for a file ffmpeg can't read", () => {
    const info = parseMediaInfo(
      "/input/input.mp4: Invalid data found when processing input",
    );
    expect(info).toEqual({ duration: Number.NaN, format: "" });
  });
});

describe("parseProgressTime", () => {
  it("reads the time from progress lines", () => {
    expect(
      parseProgressTime(
        "frame=   50 fps= 12 q=28.0 size=     256kB time=00:00:02.00 bitrate=1048.6kbits/s speed=0.5x",
      ),
    ).toBe(2);
    expect(parseProgressTime("size=N/A time=00:01:00.50 bitrate=N/A")).toBe(60.5);
    expect(parseProgressTime("time=-00:00:00.04")).toBe(0);
  });

  it("ignores other lines", () => {
    expect(parseProgressTime("Stream mapping:")).toBeUndefined();
    expect(parseProgressTime("time=N/A")).toBeUndefined();
  });
});
