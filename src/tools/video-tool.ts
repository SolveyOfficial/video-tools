// The parts every tool shares: choosing a video, a preview, the action button,
// progress with a Stop button, and the result.
import { MIME_TYPES, outputName } from "../lib/args";
import { cancelJob, runJob } from "../lib/engine";
import { UserError } from "../lib/errors";
import { formatBytes, isVideo, LARGE_FILE } from "../lib/files";
import type { MediaInfo } from "../lib/probe";
import { formatTime } from "../lib/time";
import { dropZone, h, runTask, statusArea } from "../ui";

import type { Tool } from "./tool";

/** Where a tool writes its result inside ffmpeg's file system. */
export const outputPath = (extension: string) => `/output.${extension}`;

export interface Plan {
  /** Ends with outputPath(extension). */
  args: string[];
  /** Extension of the result, which also sets its file type. */
  extension: string;
  /** Added to the file name, e.g. "compressed". */
  suffix: string;
  /** Length of the result in seconds, for the progress bar. */
  duration: number;
  /** Extra line under the result, given the result's size. */
  detail?: (bytes: number) => string | undefined;
}

export interface VideoToolOptions {
  id: string;
  title: string;
  heading: string;
  description: string;
  buttonLabel: string;
  /** Builds the tool's own controls, called once when the tool is shown. */
  setup: (context: { preview: HTMLVideoElement }) => ToolControls;
}

export interface ToolControls {
  controls: HTMLElement[];
  /** Called when a new video is chosen. */
  onFile?: (file: File) => void;
  /** Builds the ffmpeg command once the video's details are known. */
  plan: (input: string, info: MediaInfo, file: File) => Plan;
}

const ACCEPT =
  "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.wmv,.flv,.3gp,.mpg,.mpeg,.ts,.mts,.m2ts,.ogv";

const percentChange = (before: number, after: number) => {
  const change = Math.round((1 - after / before) * 100);
  return change > 0 ? ` (${change}% smaller)` : change < 0 ? ` (${-change}% bigger)` : "";
};

export const videoTool = (options: VideoToolOptions): Tool => ({
  id: options.id,
  title: options.title,
  heading: options.heading,
  description: options.description,
  mount(container) {
    let file: File | null = null;
    let previewURL: string | null = null;
    const status = statusArea();
    const info = h("p", { class: "file-info" });
    const warning = h("p", { class: "warning" });
    const preview = h("video", {
      class: "preview",
      controls: true,
      playsInline: true,
      muted: true,
      preload: "metadata",
      "aria-label": "Preview of the chosen video",
    });

    const showInfo = () => {
      if (!file) {
        return;
      }
      const parts = [formatBytes(file.size)];
      if (Number.isFinite(preview.duration)) {
        parts.push(formatTime(preview.duration));
      }
      if (preview.videoWidth) {
        parts.push(`${preview.videoWidth} × ${preview.videoHeight}`);
      }
      info.replaceChildren(h("strong", {}, file.name), ` · ${parts.join(" · ")}`);
    };
    preview.addEventListener("loadedmetadata", showInfo);

    const button = h(
      "button",
      { type: "button", class: "primary", on: { click: () => void run() } },
      options.buttonLabel,
    );
    const tool = options.setup({ preview });
    const optionsPanel = h(
      "div",
      { class: "options" },
      h("div", { class: "file-summary" }, preview, h("div", {}, info, warning)),
      ...tool.controls,
      h("div", { class: "actions" }, button),
    );
    optionsPanel.hidden = true;

    const load = async (files: File[]) => {
      const [chosen] = files;
      if (!isVideo(chosen)) {
        status.error(new UserError(`"${chosen.name}" is not a video file.`));
        return;
      }
      file = chosen;
      if (previewURL) {
        URL.revokeObjectURL(previewURL);
      }
      previewURL = URL.createObjectURL(chosen);
      preview.src = previewURL;
      warning.textContent =
        chosen.size > LARGE_FILE
          ? "This is a large file. Your browser may run out of memory; if that happens, trim it first or use a computer with more memory."
          : "";
      warning.hidden = !warning.textContent;
      showInfo();
      tool.onFile?.(chosen);
      optionsPanel.hidden = false;
      status.clear();
    };

    const run = () =>
      runTask(status, [button], async () => {
        if (!file) {
          return;
        }
        const chosen = file;
        let plan: Plan | undefined;
        const { bytes } = await runJob(
          chosen,
          {
            knownDuration: preview.duration,
            onStatus: (message, fraction) =>
              status.progress(message, fraction, cancelJob),
          },
          (input, mediaInfo) => {
            plan = tool.plan(input, mediaInfo, chosen);
            return {
              args: plan.args,
              output: outputPath(plan.extension),
              duration: plan.duration,
            };
          },
        );
        const { extension, suffix, detail } = plan!;
        status.result({
          message: `Done: ${formatBytes(chosen.size)} → ${formatBytes(bytes.length)}${percentChange(chosen.size, bytes.length)}.`,
          detail: detail?.(bytes.length),
          file: {
            bytes,
            name: outputName(chosen.name, suffix, extension),
            type: MIME_TYPES[extension] ?? "application/octet-stream",
          },
        });
      });

    const zone = dropZone({
      accept: ACCEPT,
      multiple: false,
      label: "Choose a video",
      hint: "or drop it here",
      onFiles: load,
    });
    container.append(zone.element, optionsPanel, status.element);
  },
});
