import { audioArgs } from "../lib/args";
import { choice } from "../ui";

import { outputPath, videoTool } from "./video-tool";

export const extractAudio = videoTool({
  id: "audio",
  title: "Extract audio",
  heading: "Extract the audio",
  description:
    "Save the sound of a video as an MP3 or M4A file, for example to keep a song or a talk.",
  buttonLabel: "Extract audio",
  setup() {
    const format = choice<"mp3" | "m4a">(
      "audio-format",
      "Format",
      [
        { value: "mp3", label: "MP3", hint: "Plays everywhere" },
        { value: "m4a", label: "M4A", hint: "AAC; copied without loss when possible" },
      ],
      "mp3",
    );
    return {
      controls: [format.element],
      plan: (input, info) => ({
        args: audioArgs({
          input,
          output: outputPath(format.value),
          info,
          format: format.value,
        }),
        extension: format.value,
        suffix: "audio",
        duration: info.duration,
      }),
    };
  },
});
