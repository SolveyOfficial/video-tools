import { UserError } from "../lib/errors";
import { formatTime, parseTime } from "../lib/time";
import { h } from "../ui";

let count = 0;

/** Explains the format of time fields; shown once under them. */
export const timeHint = () =>
  h("p", { class: "note" }, "Times are minutes and seconds, for example 1:05.5.");

/** A time input with a button that copies the preview's current position. */
export const timeField = (label: string, preview: HTMLVideoElement, initial = "0:00") => {
  const id = `time-${++count}`;
  const input = h("input", {
    id,
    type: "text",
    value: initial,
    inputMode: "decimal",
    autocomplete: "off",
    spellcheck: false,
    placeholder: "m:ss",
  });
  const use = h(
    "button",
    {
      type: "button",
      "aria-label": `Use current position for ${label.toLowerCase()}`,
      on: {
        click: () => {
          input.value = formatTime(preview.currentTime);
        },
      },
    },
    "Use current position",
  );
  return {
    element: h(
      "div",
      { class: "field time-field" },
      h("label", { for: id }, label),
      h("div", { class: "time-field__row" }, input, use),
    ),
    set: (seconds: number) => {
      input.value = formatTime(seconds);
    },
    /** The time in seconds; throws a message for the user if it can't be read. */
    read: () => {
      const seconds = parseTime(input.value);
      if (Number.isNaN(seconds)) {
        input.focus();
        throw new UserError(`“${input.value}” is not a time. Write it like 1:05 or 65.`);
      }
      return seconds;
    },
  };
};
