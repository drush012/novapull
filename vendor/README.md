# Runtime binaries

Place the official Windows binaries below before development or packaging:

- `yt-dlp.exe` — parsing and downloading
- `ffmpeg.exe` / `ffprobe.exe` — muxing, and reading a stream's real dimensions
- `deno.exe` — a JavaScript engine for yt-dlp. YouTube signs every stream URL
  with an `n` parameter computed by its own player script; without an engine to
  run that script, YouTube parsing fails. Optional: every other site works
  without it, so a missing `deno.exe` degrades YouTube rather than breaking the
  app.

They are intentionally not committed to Git. CI downloads verified upstream
releases and checks their published checksums.
