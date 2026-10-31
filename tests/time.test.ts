import { describe, expect, it } from "vitest";

import { formatTime, parseClock, parseTime, secondsArg } from "../src/lib/time";

describe("parseTime", () => {
  it("reads seconds, minutes and hours", () => {
    expect(parseTime("75")).toBe(75);
    expect(parseTime("75.5")).toBe(75.5);
    expect(parseTime("1:15")).toBe(75);
    expect(parseTime(" 1:05.25 ")).toBe(65.25);
    expect(parseTime("0:01:15")).toBe(75);
    expect(parseTime("2:00:00")).toBe(7200);
    expect(parseTime("1,5")).toBe(1.5);
  });

  it("rejects text that is not a time", () => {
    for (const text of ["", "abc", "1:2:3:4", "1:75", "-5", "1:", ":30", "1.2.3"]) {
      expect(parseTime(text), text).toBeNaN();
    }
  });
});

describe("parseClock", () => {
  it("reads ffmpeg times", () => {
    expect(parseClock("00:00:05.00")).toBe(5);
    expect(parseClock("01:02:03.5")).toBe(3723.5);
    expect(parseClock("-00:00:00.02")).toBe(-0.02);
    expect(parseClock("N/A")).toBeNaN();
  });
});

describe("formatTime", () => {
  it("shows minutes and seconds, with tenths when needed", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65.25)).toBe("1:05.3");
    expect(formatTime(59.96)).toBe("1:00");
    expect(formatTime(3723.5)).toBe("1:02:03.5");
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
  });

  it("round-trips through parseTime", () => {
    for (const seconds of [0, 1.5, 59.9, 61, 3599.9, 3600, 7322.4]) {
      expect(parseTime(formatTime(seconds))).toBeCloseTo(seconds, 5);
    }
  });
});

describe("secondsArg", () => {
  it("rounds to milliseconds and never goes below zero", () => {
    expect(secondsArg(1.23456)).toBe("1.235");
    expect(secondsArg(10)).toBe("10");
    expect(secondsArg(-1)).toBe("0");
  });
});
