# NovaPull

A video downloader for Windows. Electron shell, `yt-dlp` for parsing and downloading, FFmpeg for muxing, Deno as the JavaScript engine yt-dlp needs. The interface is a classic desktop download manager: menu bar, icon toolbar, category sidebar, task table and status bar.

Every engine ships with the app and **the system's own copies are never called** — what runs depends on this build, not on the machine it lands on.

[**Download the latest release →**](https://github.com/drush012/novapull/releases/latest)

## Features

**Main window**

- Paste a link on the home page and the result opens **in place** — no dialog
- Twelve site shortcuts, each opening in the built-in browser
- Shows the current download exit IP, which is the single biggest factor in whether a site like YouTube answers at all
- Task table: name, size, status, progress, speed, time left, multi-select
- Sidebar filters by status (all / downloading / completed / failed) and type (video / music)

**Parsing and downloading**

- Accepts a bare link, or a whole "title + link" share blurb with the URL buried in it
- Quality levels are named **8K / 4K / 2K / 1080P** rather than by raw pixel height, and sorted by resolution first
- Audio-only downloads (converted to mp3)
- Stopping keeps the partial file; resume and retry both work
- When the chosen quality is unavailable it says so instead of silently substituting another

**Three parsing routes**, chosen automatically per site:

| Route | Used for | What it does |
|---|---|---|
| yt-dlp | most sites | normal extraction |
| Player probe | Douyin | reads the quality table the page's own player holds, which yields 4K/8K **without the watermark** — yt-dlp falls back to `download_addr`, which is 720p with the watermark burned in |
| Media sniffer | when both fail | loads the page in the built-in browser and captures the stream it actually plays |

The sniffer is a fallback and can only reach whatever the player is currently streaming. The app says so plainly rather than presenting it as the best available quality.

**Also**

- Instant switching between English and 简体中文 — **including errors raised in the main process**
- Light and dark themes, applied to the native window buttons as well
- Update check: silent on startup (at most once a day), with a prompt when a newer release exists and a way to skip a version
- A filename template engine (currently hidden in the UI; the default rule still applies)

## Cookies and signing in

Before parsing, the app visits the target site once in the background to pick up its **anonymous cookies**. For most sites that is the end of it and the user does nothing.

For content that needs an account — member-only quality, age restrictions, or a bot check — open that site once from "Popular sites" on the home page and sign in:

1. It opens in a separate Electron session partition (`persist:novapull-login`) with no preload and no Node access
2. The sign-in page is the site's own; **no password passes through this program**
3. On close, the main process reads that partition through `session.cookies.get()` and writes `login-cookies.txt` in Netscape format into the userData folder, which is then handed to yt-dlp as `--cookies`
4. "Download → Clear site cookies" wipes the partition and deletes that file

> `login-cookies.txt` is equivalent to your credentials. **Do not ship it alongside the app.** It never leaves the machine on its own.

## Tested sites

Measured on one machine through one exit IP, **fully anonymous, with no cookies at all**:

| Site | Works anonymously | Best quality reached | Platform watermark |
|---|---|---|---|
| Douyin | yes | 4K / 8K | avoided |
| Vimeo | yes | 4K | none |
| Facebook | yes | 1080p AV1 | none |
| Instagram | yes | 1080×1920 | none |
| Bilibili | yes | 1080p30 (higher tiers need an account) | none |
| TikTok | yes | source resolution | avoided |
| X / Twitter | yes | source resolution | none |
| YouTube | depends on exit IP — see below | 4320p AV1 HDR | none |

A note on "watermark removal": Douyin and TikTok both offer a watermarked download alongside a clean playback stream, and the app picks the clean one. A watermark the **uploader** burned into the picture is part of the video itself and no downloader can remove it.

### YouTube

YouTube is the one site where the exit IP decides the outcome, so the app parses it in two passes:

1. **Signed out first.** On a clean exit this reaches the full ladder — 4320p AV1 HDR, measured. The clients that serve 4K/8K refuse cookies, so this pass deliberately sends none.
2. **Signed in, only when YouTube asks for it.** On a flagged exit the first pass is refused with `Sign in to confirm you're not a bot`; the second pass brings the login cookies from the built-in browser and typically reaches 1080p60.

Whichever pass the parse used, the download repeats — a format found signed out may not exist in a signed-in request.

Counter-intuitively, cookies make a clean exit *worse*: on the same video through the same exit, signed out reached 4320p while signed in stopped at 1080p60.

Both passes need Deno. YouTube signs every stream URL with an `n` parameter computed by its own player script; yt-dlp has no JavaScript engine of its own, and without one it fails with `n challenge solving failed`. Deno is an **optional** dependency — missing it affects YouTube only.

Datacenter IPs are flagged as bots far more readily. If a video only reaches 1080p, switching to a cleaner exit node does more than anything else.

## Privacy

NovaPull contacts a few services, each tied to something the app visibly does. Parsing and downloading never pass through any server of ours — nothing about what you download is ever sent to us.

| Service | When | What it receives |
|---|---|---|
| The site a pasted link points to | parsing and downloading | the requests themselves; that site's cookies from the built-in browser are added only when a signed-in pass is needed |
| `pull.qike.ccwu.cc` (the NovaPull account server) | when you register, sign in or activate; and on each start **only if this device is activated**, to re-check that its code is still valid | your username and password (the password travels over HTTPS and the server keeps only a scrypt hash of it), the activation code, and a random id the app generated on first run. **No hardware information, and nothing about what you download.** |
| `ipapi.co`, falling back to `api.ipify.org` | on startup, to show the current exit IP on the home page | your IP address — which is what they send back |
| `api.github.com` | the update check: on startup at most once a day (can be switched off in settings), or when you choose *Check for updates* | a request for the latest NovaPull release |

A device that has never signed in or activated never contacts the account server at all.

The random device id lives in `device-id.txt` in the userData folder; deleting it makes the app look like a new installation, which also detaches any activation from it. The account server is reached through Cloudflare, which terminates TLS and so can see the requests in transit.

Login cookies for video sites are written to your own userData folder and read only by the bundled yt-dlp. The app never uploads them anywhere.

## Running locally

1. Install Node.js 20 or newer
2. Put the engines into `vendor/` as described in [`vendor/README.md`](vendor/README.md)
3. Then:

```powershell
npm install
npm start
```

To preview the interface only, with no engines needed:

```powershell
node scripts/preview-server.js
```

then open http://127.0.0.1:8765 .

## Tests

```powershell
npm run check
npm test
```

Coverage includes share-blurb parsing, quality naming, the filename template engine, the player probe, update checking and dictionary completeness. Several tests exist to prevent specific regressions: the English and Chinese dictionaries must stay key-for-key identical with matching placeholders; control flow must never branch on translated text; and the JS runtime flag must be attached to both the parse and the download paths.

## Icon

`assets/icon.ico` is generated from code rather than kept as a hand-maintained binary:

```powershell
npm run icon
```

[`scripts/make-icon.js`](scripts/make-icon.js) draws it with plain arithmetic and writes the PNG and ICO containers by hand — no dependencies — packing 256/128/64/48/32/16 into one file. Changing the colours or the shape means editing a few constants and rerunning it.

## Packaging

```powershell
npm run dist
```

Produces both an NSIS installer and a portable build, and moves the finished installers to the repository root.

CI ([`.github/workflows/build.yml`](.github/workflows/build.yml)) downloads yt-dlp, FFmpeg and Deno, **verifies each against the checksum its upstream publishes**, bundles their licences, and checks the built installers exist and are of a plausible size before publishing anything. Pushing a `v`-prefixed tag creates the release and uploads the artifacts.

Read [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) before distributing.

> There is no code signing, so first-run SmartScreen warnings are expected.

## Legal

Download only what you have the right to keep, and respect the terms of the sites you use and the law where you are. This project contains nothing for circumventing DRM.

## Licence

MIT — see [`LICENSE`](LICENSE). The bundled third-party executables carry their own licences; see `THIRD_PARTY_NOTICES.md`.
