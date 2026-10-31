// Copies the ffmpeg WebAssembly build (@ffmpeg/core) into public/ffmpeg, so
// the app serves it itself instead of loading it from a CDN. The licences of
// the build are in licenses/ffmpeg-core and THIRD_PARTY_NOTICES.md.
import fs from "node:fs";
import path from "node:path";

const source = path.join("node_modules", "@ffmpeg", "core", "dist", "esm");
const target = path.join("public", "ffmpeg");
// GitHub rejects files of 100 MB or more
const LIMIT = 100 * 1000 * 1000;

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const from = path.join(source, name);
  if (fs.statSync(from).size >= LIMIT) {
    throw new Error(`${name} is larger than 100 MB`);
  }
  fs.copyFileSync(from, path.join(target, name));
}
fs.copyFileSync(
  path.join("licenses", "ffmpeg-core", "GPL-2.0.txt"),
  path.join(target, "COPYING.GPLv2.txt"),
);
console.log(`Copied the ffmpeg core to ${target}`);
