import { transformArgs, type Rotation } from "../lib/args";
import { choice, h, select } from "../ui";

import { outputPath, videoTool } from "./video-tool";

type Size = "keep" | "1080" | "720" | "480" | "360";

export const resize = videoTool({
  id: "resize",
  title: "Resize & rotate",
  heading: "Resize or rotate a video",
  description:
    "Make the picture smaller, turn a sideways video upright, or mirror it. The result is an MP4.",
  buttonLabel: "Save video",
  setup() {
    const size = select<Size>(
      "Picture size",
      [
        { value: "keep", label: "Keep the original size" },
        { value: "1080", label: "1080p (Full HD)" },
        { value: "720", label: "720p (HD)" },
        { value: "480", label: "480p" },
        { value: "360", label: "360p" },
      ],
      "keep",
    );
    const rotate = choice<"0" | "90" | "180" | "270">(
      "resize-rotate",
      "Rotate",
      [
        { value: "0", label: "Don't rotate" },
        { value: "90", label: "90° right" },
        { value: "270", label: "90° left" },
        { value: "180", label: "180°" },
      ],
      "0",
    );
    const flip = h("input", { type: "checkbox" });
    return {
      controls: [
        size.element,
        rotate.element,
        h(
          "label",
          { class: "checkbox" },
          flip,
          "Mirror the picture (flip left to right)",
        ),
      ],
      plan: (input, info) => ({
        args: transformArgs({
          input,
          output: outputPath("mp4"),
          info,
          maxShortSide: size.value === "keep" ? undefined : Number(size.value),
          rotate: Number(rotate.value) as Rotation,
          flip: flip.checked,
        }),
        extension: "mp4",
        suffix: "resized",
        duration: info.duration,
      }),
    };
  },
});
