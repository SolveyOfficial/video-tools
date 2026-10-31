// Writes THIRD_PARTY_NOTICES.md (and a copy in dist/ that the app links to)
// from the licences collected during the build (see vite.config.ts), plus
// files that are copied rather than bundled: fonts and the ffmpeg
// WebAssembly build with the libraries compiled into it.
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n").trim();
const packageJson = (name) =>
  JSON.parse(fs.readFileSync(path.join("node_modules", name, "package.json"), "utf8"));
const licenceFile = (dir) => {
  const file = fs.readdirSync(dir).find((name) => /^licen[cs]e/i.test(name));
  return file ? read(path.join(dir, file)) : undefined;
};
const licences = "licenses/ffmpeg-core";
const licence = (file) => read(path.join(licences, file));

const collected = JSON.parse(
  fs.readFileSync("node_modules/.cache/third-party-licences.json", "utf8"),
);

// The ffmpeg.wasm packages do not ship their licence file; it is the MIT
// licence of their repository (licenses/ffmpeg-core/ffmpeg.wasm-LICENSE.txt).
for (const entry of collected) {
  if (entry.name.startsWith("@ffmpeg/") && !entry.licenseText) {
    entry.licenseText = licence("ffmpeg.wasm-LICENSE.txt");
  }
}

const fonts = [
  ["@fontsource-variable/inter", "Inter font"],
  ["@fontsource-variable/plus-jakarta-sans", "Plus Jakarta Sans font"],
].map(([name, title]) => {
  const meta = packageJson(name);
  return {
    name: title,
    version: meta.version,
    license: meta.license,
    licenseText: licenceFile(path.join("node_modules", name)),
  };
});

// The WebAssembly build of FFmpeg, served from ffmpeg/ffmpeg-core.js and
// ffmpeg/ffmpeg-core.wasm. Versions are those of the build scripts
// (Dockerfile) of the ffmpeg.wasm release that matches the package.
const core = packageJson("@ffmpeg/core");
const ffmpegWasmTag = `v${core.version}`;
const libraries = [
  [
    "FFmpeg",
    "n5.1.4",
    "GPL-2.0-or-later (built with --enable-gpl)",
    "https://github.com/FFmpeg/FFmpeg/tree/n5.1.4",
  ],
  [
    "x264",
    "branch 4-cores",
    "GPL-2.0-or-later",
    "https://github.com/ffmpegwasm/x264/tree/4-cores",
  ],
  ["x265", "3.4", "GPL-2.0-or-later", "https://github.com/ffmpegwasm/x265/tree/3.4"],
  [
    "libvpx",
    "1.13.1",
    "BSD-3-Clause",
    "https://github.com/ffmpegwasm/libvpx/tree/v1.13.1",
  ],
  ["LAME", "master branch", "LGPL-2.0-or-later", "https://github.com/ffmpegwasm/lame"],
  ["libogg", "1.3.4", "BSD-3-Clause", "https://github.com/ffmpegwasm/Ogg/tree/v1.3.4"],
  [
    "libtheora",
    "1.1.1",
    "BSD-3-Clause",
    "https://github.com/ffmpegwasm/theora/tree/v1.1.1",
  ],
  ["Opus", "1.3.1", "BSD-3-Clause", "https://github.com/ffmpegwasm/opus/tree/v1.3.1"],
  [
    "libvorbis",
    "1.3.3",
    "BSD-3-Clause",
    "https://github.com/ffmpegwasm/vorbis/tree/v1.3.3",
  ],
  ["zlib", "1.2.11", "Zlib", "https://github.com/ffmpegwasm/zlib/tree/v1.2.11"],
  [
    "libwebp",
    "1.3.2",
    "BSD-3-Clause",
    "https://github.com/ffmpegwasm/libwebp/tree/v1.3.2",
  ],
  [
    "FreeType",
    "2.10.4",
    "FTL",
    "https://github.com/ffmpegwasm/freetype2/tree/VER-2-10-4",
  ],
  [
    "FriBidi",
    "1.0.9",
    "LGPL-2.1-or-later",
    "https://github.com/fribidi/fribidi/tree/v1.0.9",
  ],
  [
    "HarfBuzz",
    "5.2.0",
    "MIT (Old MIT)",
    "https://github.com/harfbuzz/harfbuzz/tree/5.2.0",
  ],
  ["libass", "0.15.0", "ISC", "https://github.com/libass/libass/tree/0.15.0"],
  ["zimg", "3.0.5", "WTFPL", "https://github.com/sekrit-twc/zimg/tree/release-3.0.5"],
  [
    "Emscripten runtime",
    "3.1.40",
    "MIT",
    "https://github.com/emscripten-core/emscripten/tree/3.1.40",
  ],
];

const coreText = [
  `ffmpeg-core.js and ffmpeg-core.wasm are the WebAssembly build of FFmpeg from`,
  `the npm package @ffmpeg/core ${core.version}, copied unchanged. FFmpeg is built with`,
  `--enable-gpl and the GPL libraries x264 and x265, so the build as a whole is`,
  `licensed under the GNU General Public License version 2 or later (full text`,
  `below).`,
  ``,
  `Corresponding source code:`,
  `- FFmpeg n5.1.4: https://github.com/FFmpeg/FFmpeg/tree/n5.1.4`,
  `  (also https://ffmpeg.org/releases/ffmpeg-5.1.4.tar.xz)`,
  `- ffmpeg.wasm ${ffmpegWasmTag}, with the build scripts used for this build`,
  `  (Dockerfile, build/, src/bind/ and src/fftools/):`,
  `  https://github.com/ffmpegwasm/ffmpeg.wasm/tree/${ffmpegWasmTag}`,
  `- the package as published: https://www.npmjs.com/package/@ffmpeg/core/v/${core.version}`,
  ``,
  `Libraries compiled into the build (source of each at the address given):`,
  ...libraries.map(([name, version, id, url]) => `- ${name} ${version}, ${id}: ${url}`),
  ``,
  `The licence texts of the libraries that are not under the GPL follow in their`,
  `own sections of this file.`,
  ``,
  licence("GPL-2.0.txt"),
  ``,
  `---------------------------------------------------------------------------`,
  `FFmpeg licence summary (LICENSE.md of FFmpeg n5.1.4):`,
  ``,
  licence("FFmpeg-LICENSE.md"),
].join("\n");

const inCore = (name) => `${name} (in the ffmpeg WebAssembly build)`;
const coreParts = [
  {
    name: "@ffmpeg/core",
    license: core.license,
    licenseText: coreText,
    repository: `https://github.com/ffmpegwasm/ffmpeg.wasm/tree/${ffmpegWasmTag}`,
  },
  {
    name: inCore("Emscripten runtime"),
    version: "3.1.40",
    license: "MIT",
    file: "Emscripten-LICENSE.txt",
  },
  {
    name: inCore("FreeType"),
    version: "2.10.4",
    license: "FTL",
    file: "FreeType-FTL.txt",
  },
  {
    name: inCore("FFmpeg LGPL parts and FriBidi"),
    version: "",
    license: "LGPL-2.1-or-later",
    file: "LGPL-2.1.txt",
  },
  {
    name: inCore("HarfBuzz"),
    version: "5.2.0",
    license: "MIT",
    file: "HarfBuzz-COPYING.txt",
  },
  {
    name: inCore("LAME"),
    version: "",
    license: "LGPL-2.0-or-later",
    file: "LGPL-2.0-lame.txt",
  },
  {
    name: inCore("libass"),
    version: "0.15.0",
    license: "ISC",
    file: "libass-COPYING.txt",
  },
  {
    name: inCore("libogg"),
    version: "1.3.4",
    license: "BSD-3-Clause",
    file: "libogg-COPYING.txt",
  },
  {
    name: inCore("libtheora"),
    version: "1.1.1",
    license: "BSD-3-Clause",
    file: "libtheora-COPYING.txt",
  },
  {
    name: inCore("libvorbis"),
    version: "1.3.3",
    license: "BSD-3-Clause",
    file: "libvorbis-COPYING.txt",
  },
  {
    name: inCore("libvpx"),
    version: "1.13.1",
    license: "BSD-3-Clause",
    files: ["libvpx-LICENSE.txt", "libvpx-PATENTS.txt"],
  },
  {
    name: inCore("libwebp"),
    version: "1.3.2",
    license: "BSD-3-Clause",
    files: ["libwebp-COPYING.txt", "libwebp-PATENTS.txt"],
  },
  {
    name: inCore("Opus"),
    version: "1.3.1",
    license: "BSD-3-Clause",
    file: "opus-COPYING.txt",
  },
  { name: inCore("zimg"), version: "3.0.5", license: "WTFPL", file: "zimg-COPYING.txt" },
  { name: inCore("zlib"), version: "1.2.11", license: "Zlib", file: "zlib-LICENSE.txt" },
].map(({ file, files = file ? [file] : [], ...entry }) => ({
  version: core.version,
  ...entry,
  licenseText: entry.licenseText ?? files.map(licence).join("\n\n"),
}));

const seen = new Set();
const entries = [...collected, ...fonts, ...coreParts]
  .filter(({ name, version }) => {
    const key = `${name}@${version}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const missing = entries.filter((entry) => !entry.licenseText);
if (missing.length) {
  throw new Error(`No licence text for: ${missing.map((e) => e.name).join(", ")}`);
}

const sections = entries.map(
  ({ name, version, license, licenseText, noticeText, repository }) =>
    [
      `## ${name}${version ? ` ${version}` : ""}`,
      "",
      `- Licence: ${license ?? "see text below"}`,
      ...(repository ? [`- Source: ${repository}`] : []),
      "",
      "```text",
      licenseText.replace(/\r\n?/g, "\n").trim(),
      ...(noticeText ? ["", noticeText.replace(/\r\n?/g, "\n").trim()] : []),
      "```",
      "",
    ].join("\n"),
);

const text = [
  "# Third-party notices",
  "",
  "Solvey Video Tools includes the following third-party software and fonts.",
  "Each is listed with its full licence text. The video engine (@ffmpeg/core)",
  "is licensed under the GNU GPL version 2 or later; see its section for where",
  "to get its source code.",
  "",
  ...sections,
].join("\n");

fs.writeFileSync("THIRD_PARTY_NOTICES.md", text);
if (fs.existsSync("dist")) {
  fs.writeFileSync(path.join("dist", "THIRD_PARTY_NOTICES.txt"), text);
}
console.log(`Wrote ${entries.length} notices to THIRD_PARTY_NOTICES.md`);
