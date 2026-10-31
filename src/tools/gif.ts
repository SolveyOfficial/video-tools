import { gifArgs } from "../lib/args";
import { UserError } from "../lib/errors";
import { field, h, select } from "../ui";

import { timeField } from "./time-field";
import { outputPath, videoTool } from "./video-tool";

const MAX_SECONDS = 60;

export const gif = videoTool({
  id: "gif",
  title: "Video to GIF",
  heading: "Make a GIF",
  description:
    "Turn part of a video into an animated GIF. Short, narrow GIFs with few frames a second stay small.",
  buttonLabel: "Make GIF",
  setup({ preview }) {
    const fps = select<"5" | "10" | "15" | "20">(
      "Frames a second",
      [
        { value: "5", label: "5" },
        { value: "10", label: "10" },
        { value: "15", label: "15" },
        { value: "20", label: "20" },
      ],
      "10",
    );
    const width = select<"240" | "320" | "480" | "640" | "0">(
      "Width",
      [
        { value: "240", label: "240 pixels" },
        { value: "320", label: "320 pixels" },
        { value: "480", label: "480 pixels" },
        { value: "640", label: "640 pixels" },
        { value: "0", label: "Same as the video" },
      ],
      "480",
    );
    const start = timeField("Start", preview);
    const length = h("input", {
      type: "number",
      min: 0.5,
      max: MAX_SECONDS,
      step: 0.5,
      value: 5,
      inputMode: "decimal",
    });
    return {
      controls: [
        h(
          "div",
          { class: "options--inline" },
          start.element,
          field("Length in seconds", length),
        ),
        h(
          "p",
          { class: "note" },
          `The start is in minutes and seconds, for example 1:05.5. The length can be up to ${MAX_SECONDS} seconds.`,
        ),
        h("div", { class: "options--inline" }, fps.element, width.element),
      ],
      plan: (input, info) => {
        const from = start.read();
        const seconds = Number(length.value);
        if (!(seconds > 0) || seconds > MAX_SECONDS) {
          throw new UserError(`Choose a length between 0.5 and ${MAX_SECONDS} seconds.`);
        }
        if (from >= (info.duration || Infinity)) {
          throw new UserError("The start is after the end of the video.");
        }
        const duration = Math.min(seconds, (info.duration || Infinity) - from);
        return {
          args: gifArgs({
            input,
            output: outputPath("gif"),
            info,
            fps: Number(fps.value),
            width: Number(width.value),
            start: from,
            duration,
          }),
          extension: "gif",
          suffix: "animation",
          duration,
        };
      },
    };
  },
});
