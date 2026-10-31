import { convertArgs, GIF_MAX_SECONDS, type ConvertTarget } from "../lib/args";
import { choice } from "../ui";

import { outputPath, videoTool } from "./video-tool";

export const convert = videoTool({
  id: "convert",
  title: "Convert",
  heading: "Convert a video",
  description:
    "Save a video in another format: MP4 plays almost everywhere, WebM suits websites, MP3 and M4A keep only the sound, and GIF makes a silent animation.",
  buttonLabel: "Convert",
  setup() {
    const target = choice<ConvertTarget>(
      "convert-target",
      "Convert to",
      [
        { value: "mp4", label: "MP4", hint: "H.264 video, AAC sound" },
        { value: "webm", label: "WebM", hint: "VP8 video, Opus sound" },
        { value: "mp3", label: "MP3", hint: "Sound only" },
        { value: "m4a", label: "M4A", hint: "Sound only (AAC)" },
        {
          value: "gif",
          label: "GIF",
          hint: `Silent animation, first ${GIF_MAX_SECONDS} s`,
        },
      ],
      "mp4",
    );
    return {
      controls: [target.element],
      plan: (input, info) => ({
        args: convertArgs({
          input,
          output: outputPath(target.value),
          info,
          target: target.value,
        }),
        extension: target.value,
        suffix: "converted",
        duration:
          target.value === "gif"
            ? Math.min(GIF_MAX_SECONDS, info.duration || GIF_MAX_SECONDS)
            : info.duration,
      }),
    };
  },
});
