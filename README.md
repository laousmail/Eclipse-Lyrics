# Eclipse Lyrics

Free, no-login, browser-only tool to **time song lyrics**, export subtitles, and render animated lyric videos.

Made by [laousmail](https://laousmail.com). Audio never leaves your device.

## Try it

Open `index.html` locally (any static server), or use GitHub Pages after merge:

```bash
# from this folder
python3 -m http.server 8080
# → http://localhost:8080
```

ES modules require HTTP (not `file://`).

Phone-first app shell: bottom tabs (Audio → Lyrics → Sync → Export → Film), sticky thumb-friendly Tap dock on Sync, scrubber for deliberate seeking, FR/EN UI, Google Docs import, and audio-from-URL. Desktop gets the same flow in a centered phone frame.

Viewport is locked (no pinch-zoom) for an app-like feel. Haptics via the Vibration API when available.

## Workflow

1. **Load audio** — drag-and-drop or pick MP3 / WAV / M4A / OGG  
2. **Paste lyrics** — one line per row; optional French / English columns  
3. **Tap to sync** — play, then press **Space** at the start of each line  
4. **Fine-tune** — arrow keys (±0.05 s, Shift ±0.5 s) or drag waveform markers  
5. **Export** — LRC, SRT, VTT, or JSON  
6. **Lyric video** — preview styles and record (real-time) to WebM/MP4  

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

Self-hosted **Noto Sans** + **Noto Sans Tifinagh** for Kabyle Latin and Tifinagh.

## Project layout

```
index.html
css/app.css
js/main.js
js/audio.js
js/waveform.js
js/sync.js
js/storage.js
js/export.js
js/video.js
js/styles/   # fadeUp, glowSweep, smoke
fonts/
```

## Privacy

Everything runs in the browser. Projects auto-save to `localStorage`; audio can be restored from IndexedDB after refresh.
