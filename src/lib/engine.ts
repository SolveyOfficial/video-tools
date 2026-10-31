// Runs ffmpeg (compiled to WebAssembly) in a worker. The engine is loaded the
// first time a job starts, from the app's own files.
import { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import workerURL from "@ffmpeg/ffmpeg/worker?worker&url";

import { UserError } from "./errors";
import { parseMediaInfo, parseProgressTime, type MediaInfo } from "./probe";

/** Thrown when the user stops a job. */
export class Cancelled extends Error {
  override name = "Cancelled";
}

export interface JobPlan {
  args: string[];
  /** Name of the result file inside ffmpeg's file system. */
  output: string;
  /** Length of the result in seconds, used to show progress. */
  duration: number;
}

export interface JobCallbacks {
  /** Called with a message, and a fraction from 0 to 1 when it is known. */
  onStatus: (message: string, fraction?: number) => void;
}

const assetBase = () => new URL(`${import.meta.env.BASE_URL}ffmpeg/`, location.href).href;
// size of ffmpeg-core.wasm (set at build time), to show download progress
// even when the server compresses it and does not send its length
const WASM_SIZE = __FFMPEG_WASM_SIZE__;

let instance: FFmpeg | null = null;
let wasmBlobURL: string | null = null;
let logHandler: ((line: string) => void) | null = null;
let cancelCurrent: (() => void) | null = null;

const fetchWasm = async (onProgress: (fraction: number) => void) => {
  if (wasmBlobURL) {
    return wasmBlobURL;
  }
  const response = await fetch(`${assetBase()}ffmpeg-core.wasm`);
  if (!response.ok || !response.body) {
    throw new UserError(
      "The video engine could not be downloaded. Check your connection and try again.",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / WASM_SIZE));
  }
  wasmBlobURL = URL.createObjectURL(
    new Blob(chunks as BlobPart[], { type: "application/wasm" }),
  );
  return wasmBlobURL;
};

const load = async (onStatus: JobCallbacks["onStatus"]) => {
  if (instance) {
    return instance;
  }
  const message = "Loading the video engine (about 30 MB, once)…";
  onStatus(message);
  const wasmURL = await fetchWasm((fraction) => onStatus(message, fraction));
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => logHandler?.(message));
  await ffmpeg.load({
    classWorkerURL: workerURL,
    coreURL: `${assetBase()}ffmpeg-core.js`,
    wasmURL,
  });
  instance = ffmpeg;
  return ffmpeg;
};

/** Stops the running job and throws the engine away; the next job reloads it. */
const reset = () => {
  instance?.terminate();
  instance = null;
};

/** Runs ffmpeg and returns its log; fails when ffmpeg reports an error. */
const exec = async (
  ffmpeg: FFmpeg,
  args: string[],
  onLine?: (line: string) => void,
): Promise<{ code: number; log: string[] }> => {
  const log: string[] = [];
  logHandler = (line) => {
    log.push(line);
    onLine?.(line);
  };
  try {
    const code = await ffmpeg.exec(["-hide_banner", "-nostdin", "-y", ...args]);
    return { code, log };
  } finally {
    logHandler = null;
  }
};

const probe = async (ffmpeg: FFmpeg, path: string, knownDuration?: number) => {
  // "ffmpeg -i" with no output prints the file's details and exits with an error
  const { log } = await exec(ffmpeg, ["-i", path]);
  const info = parseMediaInfo(log.join("\n"));
  if (!info.video && !info.audio) {
    throw new UserError(
      "This file could not be read as a video. It may be damaged or in an unsupported format.",
    );
  }
  if (!Number.isFinite(info.duration)) {
    if (knownDuration && Number.isFinite(knownDuration)) {
      info.duration = knownDuration;
    } else {
      // some recordings do not store their length: read through the file
      let last = 0;
      await exec(
        ffmpeg,
        ["-i", path, "-map", "0", "-c", "copy", "-f", "null", "-"],
        (line) => {
          last = parseProgressTime(line) ?? last;
        },
      );
      info.duration = last || Number.NaN;
    }
  }
  return info;
};

const describeFailure = (log: string[]) => {
  const text = log.join("\n");
  if (/Aborted\(|out of memory|Cannot enlarge memory|OOM/i.test(text)) {
    return "The browser ran out of memory. Try a shorter or smaller video, or close other tabs.";
  }
  const lines = log
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !/^(frame=|size=|video:|\[out|Press|Stream|Output|Input)/.test(line),
    );
  return `The video could not be processed${lines.length ? `: ${lines[lines.length - 1]}` : "."}`;
};

/**
 * Runs one job: loads the engine if needed, reads the file's details, builds
 * the command with `plan`, runs it and returns the result's bytes.
 */
export const runJob = async (
  file: File,
  callbacks: JobCallbacks & { knownDuration?: number },
  plan: (input: string, info: MediaInfo) => JobPlan | Promise<JobPlan>,
): Promise<{ bytes: Uint8Array; info: MediaInfo }> => {
  let cancelled = false;
  const stopped = new Promise<never>((_, reject) => {
    cancelCurrent = () => {
      cancelled = true;
      reset();
      reject(new Cancelled("Stopped."));
    };
  });
  stopped.catch(() => undefined);

  const work = async () => {
    const ffmpeg = await load(callbacks.onStatus);
    const directory = "/input";
    const extension = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1] ?? "mp4";
    const input = `${directory}/input.${extension.toLowerCase()}`;
    await ffmpeg.createDir(directory).catch(() => undefined);
    // the file is read from disk as needed, rather than copied into memory
    await ffmpeg.mount(
      FFFSType.WORKERFS,
      { blobs: [{ name: input.slice(7), data: file }] },
      directory,
    );
    try {
      callbacks.onStatus("Reading the video…");
      const info = await probe(ffmpeg, input, callbacks.knownDuration);
      const job = await plan(input, info);
      const started = Date.now();
      callbacks.onStatus("Starting…", 0);
      const { code, log } = await exec(ffmpeg, job.args, (line) => {
        const time = parseProgressTime(line);
        if (time !== undefined && job.duration > 0) {
          const fraction = Math.min(1, time / job.duration);
          const elapsed = (Date.now() - started) / 1000;
          const left =
            fraction > 0.02 ? Math.max(0, elapsed / fraction - elapsed) : undefined;
          callbacks.onStatus(
            `Working… ${Math.round(fraction * 100)}%${left === undefined ? "" : ` · about ${formatWait(left)} left`}`,
            fraction,
          );
        }
      });
      if (code !== 0) {
        throw new UserError(describeFailure(log));
      }
      const bytes = (await ffmpeg.readFile(job.output)) as Uint8Array;
      await ffmpeg.deleteFile(job.output);
      if (!bytes.length) {
        throw new UserError(describeFailure(log));
      }
      return { bytes, info };
    } finally {
      await ffmpeg.unmount(directory).catch(() => undefined);
    }
  };

  try {
    return await Promise.race([work(), stopped]);
  } catch (error) {
    if (cancelled) {
      throw new Cancelled("Stopped.");
    }
    // a crashed engine can't be reused
    if (!(error instanceof UserError) || /memory/.test(error.message)) {
      reset();
    }
    throw error;
  } finally {
    cancelCurrent = null;
  }
};

/** Stops the running job, if any. */
export const cancelJob = () => cancelCurrent?.();

const formatWait = (seconds: number) =>
  seconds < 60
    ? `${Math.max(1, Math.round(seconds))} s`
    : `${Math.round(seconds / 60)} min`;
