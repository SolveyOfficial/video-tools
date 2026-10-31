# Solvey Video Tools

Free video tools that run entirely in your browser.

Live: https://solveyofficial.github.io/video-tools/

- **Compress**: make a video small enough for WhatsApp (under 16 MB), email
  (under 25 MB) or a size you choose, or compress by quality; optionally
  scale it down to 720p or 480p. The result is an MP4 (H.264 and AAC)
- **Convert**: to MP4, WebM (VP8 and Opus), MP3 or M4A (sound only) or GIF
- **Trim**: set the start and end on a preview; a fast cut copies the video
  without re-encoding, an exact cut re-encodes it
- **Extract audio**: save the sound as MP3 or M4A
- **Video to GIF**: choose the start, length, frames a second and width
- **Mute**: remove the sound without re-encoding the picture
- **Resize & rotate**: scale down to 1080p, 720p, 480p or 360p, rotate by 90°
  or 180°, or mirror the picture

Each job shows its progress and can be stopped, and the result shows the size
before and after. Videos above 500 MB get a warning: the browser may run out of
memory.

## Private by design

Your videos are never uploaded. The app has no analytics or tracking, and it
serves its own fonts and video engine, so it loads nothing from other sites.

Built with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm), the
WebAssembly build of [FFmpeg](https://ffmpeg.org). GitHub Pages can't send the
headers that multi-threaded WebAssembly needs, so the single-threaded build is
used: it is slower than desktop FFmpeg, especially for long or high-resolution
videos. The engine (about 30 MB) is only downloaded when the first job starts.

## Development

You need Node.js 22.13 or later.

```sh
npm install
npm run dev        # development server
npm run lint       # Prettier and ESLint
npm run typecheck  # TypeScript
npm test           # unit tests
npm run build      # production build in dist/
```

Set `BASE_PATH` (for example `BASE_PATH=/video-tools/`) when the app is served
from a sub-path. The build copies the ffmpeg core from `node_modules` into
`ffmpeg/` and writes `THIRD_PARTY_NOTICES.md`, listing every bundled package,
font and library with its licence; the app links to it as "Licences".

When the repository is public, every push to `main` is published to GitHub
Pages.

## Licence

The app's own code is MIT, see LICENSE.

The video engine it serves (`ffmpeg-core.js` and `ffmpeg-core.wasm` from
`@ffmpeg/core`) is FFmpeg built with GPL components such as x264, and is
licensed under the GNU GPL version 2 or later. Its source code is FFmpeg n5.1.4
and the ffmpeg.wasm build scripts at the matching release; THIRD_PARTY_NOTICES.md
has the links and the licence texts of every library in it (also kept in
`licenses/ffmpeg-core/`).
