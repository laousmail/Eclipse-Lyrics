# Eclipse Lyrics

Free, no-login, browser-only tool to **time song lyrics**, export subtitles, and render animated lyric videos.

**Live:** https://lyrics.eclipsetone.com/ · an [EclipseTone](https://eclipsetone.com/) tool, made by [laousmail](https://laousmail.com). Audio never leaves your device.

Hosted on GitHub Pages from `main`; the custom domain is set by `CNAME` (DNS: `lyrics` CNAME → `laousmail.github.io`).

## Try it

Open `index.html` locally (any static server):

```bash
# from this folder
python3 -m http.server 8080
# → http://localhost:8080
```

ES modules require HTTP (not `file://`).

Phone-first app shell: bottom tabs (Audio → Lyrics → Sync → Export → Film), sticky thumb-friendly Tap dock on Sync, scrubber for deliberate seeking, FR/EN UI, Google Docs import, and audio-from-URL. Desktop gets the same flow in a centered phone frame.

Viewport is locked (no pinch-zoom) for an app-like feel. Haptics via the Vibration API when available.

## How it works (guided form)

The app opens on a step-by-step form (one question per screen, Typeform-style):

1. **Your song**: pick the audio file. The title is filled from the file name; if it looks like a default name ("New Recording 12", "AUD-2024…"), the form asks whether it's the real song name.
2. **Artist** (optional).
3. **Lyrics**: a check that each sung line is on its own line (with a do / don't example), then paste them or fetch them from a public Google Doc.
4. **Translation** (optional): French, English or both, pasted next to the lyrics with a line-count check.
5. **What to make** (pick any): subtitles (.srt), lyrics on a transparent layer, on black, on green, or the finished lyric video.
6. **Tap along**: one big button; tap as each line starts, undo, start over, watch it back.
7. **The look**: shape (9:16, 4:5, 1:1, 16:9), font (10 Google Fonts, self-hosted), colour, size, position, animation, translation on/off, with a live video player.
8. **Export**: each file renders on the device in its own tile that fills up, then Download / Share, or Download all (.zip).

Two modes, same song, switch any time with the **Guided | Pro** switch in the top bar:

- **Guided**: the form above, one question at a time. The default for new visitors.
- **Pro**: the full editor, every tool on one screen (waveform, nudging, line menu, every export option). Also on the welcome screen ("Know what you're doing?").

The last mode used is remembered. Links can pick one: `/#guided` or `/#pro`.

## Keyboard

| Key | Action |
|-----|--------|
| Space | Tap current line |
| P / K | Play / pause |
| Backspace | Undo last tap |
| ↑ / ↓ | Select line |
| ← / → | Nudge (±0.05 s, Shift ±0.5 s) |
| J / L | Seek ±5 s |
| , / . | Playback speed |

## Stack

Plain HTML, CSS, and vanilla JS (ES modules). No build step, no backend, no accounts.

Self-hosted **Noto Sans** + **Noto Sans Tifinagh** for Kabyle Latin and Tifinagh, plus **Cormorant Garamond** and **JetBrains Mono** to match laousmail.com.

## Project layout

```
index.html
css/tokens.css
css/app.css
css/brand.css   # laousmail.com look: serif titles, mono labels, gradient pills
js/main.js
js/audio.js
js/waveform.js
js/sync.js
js/storage.js
js/export.js
js/video.js
js/styles/   # fadeUp, glowSweep, smoke
js/flow/     # guided form: flow.js (shell + steps), sync-step, look-step, player, export-step, strings, helpers
css/flow.css, css/fonts-video.css
fonts/
```

## Privacy

Everything runs in the browser. Projects auto-save to `localStorage`; audio can be restored from IndexedDB after refresh.
