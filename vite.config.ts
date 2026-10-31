import fs from "node:fs";

import license from "rollup-plugin-license";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // the site is served from a sub-path on GitHub Pages
  base: process.env.BASE_PATH ?? "/",
  define: {
    // shown as download progress while the video engine loads
    __FFMPEG_WASM_SIZE__: JSON.stringify(
      fs.statSync("node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm").size,
    ),
  },
  build: {
    target: "es2022",
    rollupOptions: {
      plugins: [
        // collect the licences of the bundled packages for
        // scripts/third-party-notices.js
        license({
          thirdParty: {
            includePrivate: false,
            output: {
              file: "node_modules/.cache/third-party-licences.json",
              template: (dependencies) =>
                JSON.stringify(
                  dependencies.map(
                    ({
                      name,
                      version,
                      license: id,
                      licenseText,
                      noticeText,
                      repository,
                    }) => ({
                      name,
                      version,
                      license: id,
                      licenseText,
                      noticeText,
                      repository:
                        typeof repository === "string" ? repository : repository?.url,
                    }),
                  ),
                  null,
                  2,
                ),
            },
          },
        }),
      ],
    },
  },
  worker: {
    format: "es",
  },
  // ffmpeg.wasm starts its own worker, which the dependency optimiser breaks
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
