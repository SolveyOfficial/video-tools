import { copyContainer, muteArgs } from "../lib/args";
import { h } from "../ui";

import { outputPath, videoTool } from "./video-tool";

export const mute = videoTool({
  id: "mute",
  title: "Mute",
  heading: "Remove the sound",
  description:
    "Take the sound out of a video. The picture is copied as it is, so this is quick and loses no quality.",
  buttonLabel: "Remove sound",
  setup() {
    return {
      controls: [
        h("p", { class: "note" }, "The video keeps its format, picture and length."),
      ],
      plan: (input, info, file) => {
        const extension = copyContainer(file.name);
        return {
          args: muteArgs({ input, output: outputPath(extension), info }),
          extension,
          suffix: "muted",
          duration: info.duration,
        };
      },
    };
  },
});
