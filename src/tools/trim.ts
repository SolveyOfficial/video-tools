import { trimArgs, trimContainer } from "../lib/args";
import { UserError } from "../lib/errors";
import { choice, h } from "../ui";

import { timeField, timeHint } from "./time-field";
import { outputPath, videoTool } from "./video-tool";

export const trim = videoTool({
  id: "trim",
  title: "Trim",
  heading: "Trim a video",
  description:
    "Keep only part of a video. Play the preview and use the buttons to set the start and the end.",
  buttonLabel: "Trim",
  setup({ preview }) {
    const start = timeField("Start", preview);
    const end = timeField("End", preview);
    const mode = choice<"fast" | "exact">(
      "trim-mode",
      "How to cut",
      [
        {
          value: "fast",
          label: "Fast",
          hint: "No quality loss; the cut may move to the nearest key frame",
        },
        {
          value: "exact",
          label: "Exact",
          hint: "Cuts at the exact time; slower, saves the video again",
        },
      ],
      "fast",
    );
    preview.addEventListener("loadedmetadata", () => {
      start.set(0);
      if (Number.isFinite(preview.duration)) {
        end.set(preview.duration);
      }
    });
    return {
      controls: [
        h("div", { class: "options--inline" }, start.element, end.element),
        timeHint(),
        mode.element,
      ],
      plan: (input, info, file) => {
        const from = start.read();
        const to = Math.min(end.read(), info.duration || Infinity);
        if (from >= (info.duration || Infinity)) {
          throw new UserError("The start is after the end of the video.");
        }
        const exact = mode.value === "exact";
        const extension = trimContainer(file.name, exact);
        return {
          args: trimArgs({
            input,
            output: outputPath(extension),
            info,
            start: from,
            end: to,
            exact,
          }),
          extension,
          suffix: "trimmed",
          duration: to - from,
        };
      },
    };
  },
});
