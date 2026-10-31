import { compressArgs, MB, planBitrates, type CompressQuality } from "../lib/args";
import { UserError } from "../lib/errors";
import { formatBytes } from "../lib/files";
import { choice, field, h, select } from "../ui";

import { outputPath, videoTool } from "./video-tool";

type Mode = "whatsapp" | "email" | "custom" | "quality";
type Resolution = "keep" | "720" | "480";

const TARGETS: Record<"whatsapp" | "email", number> = { whatsapp: 16, email: 25 };

export const compress = videoTool({
  id: "compress",
  title: "Compress",
  heading: "Compress a video",
  description:
    "Make a video smaller so it can be sent on WhatsApp or by email. The result is an MP4 (H.264 and AAC) that plays everywhere.",
  buttonLabel: "Compress",
  setup() {
    const customSize = h("input", {
      type: "number",
      min: 1,
      step: "any",
      value: 10,
      inputMode: "decimal",
    });
    const customField = field("Size limit in MB", customSize);
    const quality = select<CompressQuality>(
      "Quality",
      [
        { value: "high", label: "High (bigger file)" },
        { value: "medium", label: "Medium" },
        { value: "small", label: "Low (smallest file)" },
      ],
      "medium",
    );
    const update = (value: Mode) => {
      customField.hidden = value !== "custom";
      quality.element.hidden = value !== "quality";
    };
    const mode = choice<Mode>(
      "compress-mode",
      "Make it",
      [
        { value: "whatsapp", label: "For WhatsApp", hint: "Under 16 MB" },
        { value: "email", label: "For email", hint: "Under 25 MB" },
        { value: "custom", label: "Under a size", hint: "Choose the limit" },
        { value: "quality", label: "By quality", hint: "Size depends on the video" },
      ],
      "whatsapp",
      update,
    );
    const resolution = select<Resolution>(
      "Picture size",
      [
        { value: "keep", label: "Keep the original size" },
        { value: "720", label: "720p (HD)" },
        { value: "480", label: "480p (smaller)" },
      ],
      "keep",
    );
    update(mode.value);
    return {
      controls: [
        mode.element,
        h(
          "div",
          { class: "options--inline" },
          customField,
          quality.element,
          resolution.element,
        ),
      ],
      plan: (input, info, file) => {
        const maxShortSide =
          resolution.value === "keep" ? undefined : Number(resolution.value);
        const extension = "mp4";
        if (mode.value === "quality") {
          return {
            args: compressArgs({
              input,
              output: outputPath(extension),
              info,
              setting: { kind: "quality", quality: quality.value },
              maxShortSide,
            }),
            extension,
            suffix: "compressed",
            duration: info.duration,
          };
        }
        const megabytes =
          mode.value === "custom" ? Number(customSize.value) : TARGETS[mode.value];
        if (!(megabytes > 0)) {
          throw new UserError("Enter a size limit in MB, for example 10.");
        }
        const targetBytes = megabytes * MB;
        if (file.size <= targetBytes) {
          throw new UserError(
            `This video is already smaller than ${formatBytes(targetBytes)}. Choose a smaller limit, or compress “By quality”.`,
          );
        }
        const bitrates = planBitrates({
          duration: info.duration,
          targetBytes,
          hasAudio: !!info.audio,
        });
        return {
          args: compressArgs({
            input,
            output: outputPath(extension),
            info,
            setting: { kind: "size", ...bitrates },
            maxShortSide,
          }),
          extension,
          suffix: "compressed",
          duration: info.duration,
          detail: (bytes) =>
            bytes <= targetBytes
              ? `Fits under ${formatBytes(targetBytes)} (video at ${bitrates.videoKbps} kbit/s).`
              : `It came out slightly above ${formatBytes(targetBytes)}. Try a smaller limit.`,
        };
      },
    };
  },
});
