# Eclipse Lyrics: Audit + v1.0 Plan

**Repo:** `laousmail/Eclipse-Lyrics` · **Live:** https://laousmail.github.io/Eclipse-Lyrics/
**Audited:** Oct 28, 2026 (code from `Eclipse-Lyrics-main.zip`, live site matches it)
**Goal:** move from a working MVP to a free, polished tool that artists actually use for every release.

---

## How to use this doc with Cursor

1. Do **Phase 0 (bugs)** first, in one branch. Nothing else matters if timings come out wrong.
2. Then go phase by phase (section 8). Each phase has a ready prompt you can paste into Cursor.
3. After each phase, run the acceptance checks in section 9 on a real phone **and** a laptop.

---

## 1. Verdict

The foundation is good: clean vanilla JS modules, no backend, real waveform, real exports, a real video recorder, FR/EN, Tifinagh font. Most "MVP tools" never get this far.

The parts that hold it back from being a real app:

1. **The timings are not trustworthy yet.** Humans tap 100 to 200 ms late, the app has no compensation, export rounding is broken on some values, and instrumental gaps are impossible to mark.
2. **The editing loop is fragile.** Changing one lyric line can shift every timing below it. Undo only covers taps. One project slot only, and "Start fresh" deletes it forever.
3. **The video export is a screen recording.** Real time only, low bitrate, breaks if the tab goes to the background, WebM with no duration on most browsers.
4. **Desktop is a phone in a box.** The screen where precision matters most (laptop + keyboard) gets a 720 px column and a tiny waveform.
5. **It's not an "app" yet:** no install (PWA), no offline, no icon, no share preview, no onboarding.

Fix those five and it's a product.

---

## 2. Keep (what's already right)

- No login, no upload, "your audio never leaves your device". This is the selling point. Say it everywhere.
- Step flow: Audio → Lyrics → Sync → Export → Film. Correct mental model.
- Big thumb **Tap line** dock on mobile, separate scrubber so seeking never marks a line by accident.
- Keyboard shortcuts (Space, P/K, J/L, arrows, `,` `.`).
- Self-hosted Noto Sans + Noto Sans Tifinagh. Kabyle and Tifinagh support is the niche nobody else serves.
- Eclipse palette and Outfit type. The brand already feels premium.
- Clean module split (`audio`, `sync`, `export`, `video`, `storage`, `waveform`, `styles/`).

---

## 3. Phase 0: bugs to fix first

| # | Where | Problem | Fix |
|---|---|---|---|
| B1 | `export.js` `toLrcTime`, `toSrtTime`, `toVttTime` | Rounding overflow. Verified: start `1.999` exports as `[00:01.100]` in LRC and `00:00:04,1000` in SRT. Breaks imports from 3-digit LRC/SRT and any non-snapped value. | Convert to integer ms first: `const total = Math.round(seconds * 1000)`, then derive h/m/s/ms from `total` with integer math. LRC: round to centiseconds the same way. Add unit tests. |
| B2 | `main.js` `setupKeyboard` | Shortcuts are global. Space on the Export or Film screen silently re-times a line. Backspace undoes, arrows nudge times and block page scrolling. | Only handle sync shortcuts when `state.screen === "sync"`. P/K play can stay global. Ignore when a dialog is open. |
| B3 | `sync.js` `applyLyrics` | Timings are preserved **by index**. Insert one line in the middle and every timing below shifts to the wrong line. | Match old lines to new lines with a diff (LCS on text). Keep timing for unchanged lines, keep timing for edited lines that stay in the same slot, new lines are untimed. Show "3 lines changed, 1 added" toast. |
| B4 | `waveform.js` marker drag | A marker can be dragged past its neighbours. `lineAtTime` assumes sorted starts, so preview, export and video then show the wrong line. | Clamp drag between previous and next marker (±10 ms). Same clamp in `nudgeLine`. |
| B5 | `sync.js` `tapLine` | After the last line, every further tap re-times the last line (`nextIndex` clamps). | After the last line, the next tap sets the **end** of the last line, then tapping stops with a "All lines timed ✓" state. |
| B6 | `main.js` `input-project` handler | `JSON.parse` without try/catch. A bad file throws an uncaught error. Import uses `alert()`. | try/catch + in-app toast. Validate shape (`lines` array, numbers or null for times). |
| B7 | `export.js` `importVTT` / `importSRT` | VTT times without hours (`01:23.456`) are valid and common, but rejected. Multi-line cues lose lines (line 2 goes into `fr`, line 3 dropped). | Accept `(hh:)?mm:ss.mmm`. Join multi-line cue text into `text`. Only map line 2 to translation when the user picks "second line is translation" in an import dialog. |
| B8 | `export.js` `importLRC` | Only 2-digit minutes, one timestamp per line. Multi-timestamp lines (`[00:12.00][01:30.00]chorus`) and `[offset:]` are ignored. | Parse all leading timestamps, duplicate the line per timestamp, sort. Apply `[offset:+/-ms]`. |
| B9 | All exports | Untimed lines are silently dropped, and exporting with zero timed lines downloads an empty file. | Pre-export check: "4 lines have no time. Export anyway / Go fix". Disable export when nothing is timed. |
| B10 | `video.js` recording | Uses `requestAnimationFrame`. If the tab goes to the background or the phone screen locks, frames stop and the video freezes while audio keeps going. | Short term: warn + pause recording on `visibilitychange`. Real fix: offline render (section 6.6). |
| B11 | `video.js` `MediaRecorder` | No `videoBitsPerSecond`, so the browser default (~2.5 Mbps) makes 1080p text blocky. | Set `videoBitsPerSecond: 10_000_000` for 1080p, 6M for square. |
| B12 | `video.js` / styles | Canvas draws before fonts load. The first frames (and Tifinagh, which only loads when used in the DOM) can render in a fallback font. | Before preview or record: `await document.fonts.load('600 48px "Noto Sans"')`, same for Tifinagh and any chosen font. |
| B13 | `styles/smoke.js` | No line wrapping. Long lines run off the canvas, translation too. | Reuse a shared `layoutText()` helper (section 7) for all styles. |
| B14 | `styles/glowSweep.js` | Sweep runs across the **canvas** width (10% to 90%), not the text. On short lines the glow starts halfway through the line. On wrapped lines all rows light at once. | Sweep per text row, using measured row widths, row by row in reading order. RTL aware later. |
| B15 | `docs.js` | `/<!DOCTYPE html|/i` has an empty alternative, so it always matches. Also, the Google Docs export URL may be blocked by CORS in some browsers. | Fix the regex. Test on Chrome, Safari, Firefox. If CORS fails, show "Copy the lyrics from the doc and paste them here" instead of a generic error. |
| B16 | `audio.js` load from URL | Most hosts (Drive, Dropbox, iCloud, SoundCloud) block CORS, so this fails almost every time. | Keep it, but label it "Direct .mp3 link (must allow downloads)" and give a clear error with "download the file and choose it instead". |
| B17 | `main.js` `restoreSession` | Restoring calls `handleAudioFile`, which jumps to the Audio screen and focuses Title. The user lands on the wrong screen. | After restore, go to the last screen the user was on (save `lastScreen` in the project). |
| B18 | `main.js` `updateActiveLine` | Runs `scrollIntoView` every animation frame while playing. Fights the user's own scrolling and costs battery. | Only scroll when the active index **changes**, and pause auto-scroll for 3 s after the user scrolls the list. |
| B19 | `waveform.js` `draw` | Full redraw (one `stroke()` per pixel column) every frame just to move the playhead. | Draw peaks once to an offscreen canvas per zoom level. Each frame: blit + draw playhead and markers only. |
| B20 | `index.html` | `user-scalable=no` + `gesturestart` blocking. Accessibility fail, and Lighthouse flags it. | Allow zoom. Prevent double-tap zoom on the Tap button only, with `touch-action: manipulation`. |
| B21 | i18n | Hard-coded English strings: translation warnings, restore detail, import error, "Recording failed", aspect/style/background option labels. | Move all to `i18n.js`. |
| B22 | Copy | "Your file stays on this phone" shows on desktop too. | "Your file stays on this device." |

---

## 4. UX audit, screen by screen

### Audio
- Title and Artist live on the audio screen but aren't needed until export. It slows the first step.
  → Move them to a small "Song details" card on Export (and prefill Title from the file name).
- No sign of progress while a big WAV decodes, so the app looks frozen.
  → Skeleton waveform + "Reading audio…" with a spinner. Do peak calculation in a Web Worker.
- No first-time explanation of what the app does.
  → Empty state: 3 tiny steps (Load, Tap, Export) + **"Try with a demo song"** button (ships a 30 s royalty-free clip + demo lyrics, ideally your own song).

### Lyrics
- Three separate tabs (Main / FR / EN) make line matching blind: you can't see that line 7 of French matches line 7 of Kabyle.
  → **Grid editor**: one row per line, columns Main | FR | EN side by side (desktop), stacked per row on mobile. Line numbers, mismatched rows highlighted.
- Paste-and-apply is a hidden two-step. Users will paste and go to Sync without pressing Apply.
  → Auto-apply on blur and on leaving the screen. Remove the Apply button.
- No way to mark sections or instrumentals.
  → Support `[Chorus]`, `[Verse 2]`, `[Instrumental]` lines as **section markers**: shown as dividers, never exported as lyrics, used as gaps.
- Tools needed: "Paste translation for all rows", "Split long lines" (over ~42 characters, subtitle standard), "Remove empty lines", "Fix line breaks from Google Docs".

### Sync (the core screen)
- On a phone, the line list starts **below the fold**. Preview card, waveform, scrubber and toolbar take the whole screen, so you tap blind.
  → New mobile layout (top to bottom): compact preview (current + next line, large) → **scrolling line list** (fills the space) → mini waveform strip (60 px) → dock. Scrubber goes inside the waveform strip.
- No tap latency compensation. Everyone taps late, so every line appears late.
  → **Tap offset** setting (default −150 ms) + a 10-second **calibration**: tap along to 8 clicks, the app computes your average delay. Apply the offset at tap time, show it in the toolbar ("Offset −140 ms").
- No way to end a line before the next one starts. During a 30-second instrumental, the last line stays on screen the whole time (in SRT, YouTube and the video).
  → **Hold-to-sing mode**: press and hold the Tap button (or Space) while the line is sung, release when it ends. Start = press, end = release. Keep simple tap mode as the default, hold mode as a toggle.
  → Plus a **"Gap" key (G / button)**: ends the current line now without starting the next.
- No review pass. After tapping, users don't know which lines are off.
  → **Review mode**: plays the song with lines highlighting; each line has ◀ ▶ nudge buttons and a "replay this line" button (plays from start −1 s).
- Undo covers taps only.
  → Global undo/redo (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, plus buttons) for taps, nudges, drags, text edits, imports.
- Can't edit, split, merge, insert or delete a line from the Sync screen.
  → Line row menu (long press on mobile, `…` on desktop): Edit text, Split here, Merge with next, Insert line below, Delete, Clear time.
- Re-syncing from the middle is awkward.
  → "Start tapping from this line" in the row menu: seeks to the previous line's start −2 s and sets the tap pointer.
- Progress unclear.
  → Header chip: "18 / 32 timed" with a thin progress ring.
- Speed control is good. Keep it, add pitch-preserved playback (`preservesPitch = true`, already default in most browsers, set it explicitly).

### Export
- Four equal tiles hide the main job: most users want **SRT for YouTube**.
  → One primary card "YouTube subtitles (.srt)" with a short how-to ("YouTube Studio → Subtitles → Upload file → With timing"). Other formats under "More formats".
- Translation options are confusing (checkbox + select + separate "one file per language" button).
  → One choice: "Languages in the file": Main only / Main + FR (2 lines) / Main + EN / Separate file per language.
- No preview of what will be exported.
  → Collapsible code preview of the first 10 cues.
- Add: **Copy to clipboard**, **Share** (Web Share API with files on mobile, so users can AirDrop or WhatsApp the SRT), **ZIP all formats**.
- Add a **Lyrics JSON for laousmail.com** export that matches your site's `releases.js` shape exactly.

### Film (lyric video)
- Settings sit under a large preview, so on mobile you change a setting and can't see the result.
  → Preview sticky at top (smaller), settings in a scrollable panel below with tabs: **Style · Text · Background · Format**.
- Record = screen recording in real time with the tab in focus. Users will switch apps and get a frozen video.
  → Offline render (section 6.6). Until then, a full-screen "Recording, keep this screen open" overlay with a cancel button.
- No scrubbing in the preview. You have to play the song to see line 20.
  → Preview timeline scrubber + "jump to line" select.
- Missing the things lyric videos actually need: title card, artist name, safe zones for TikTok/Reels UI, font choice, text size and position, color presets. See 6.6.

### Global
- No toasts or feedback for saves, exports, errors. Add one toast system.
- The "…" sheet holds critical actions (Save, Open, Import) that people won't find.
  → Move them to a **Projects** screen (6.1).
- Sheets don't close on Escape and don't trap focus.
- Language switch appears twice (top bar and sheet). Keep one.

---

## 5. UI / visual audit

What works: dark eclipse palette, orange gradient primary button, Outfit headings, rounded cards, bottom tab bar.

To make it feel premium:

1. **Desktop layout.** Today it's a 720 px phone frame in the middle of a 1440 px screen. At ≥1024 px use a real workspace:
   - Left: line list (scrolling, 40% width).
   - Right top: big preview (karaoke or video).
   - Bottom: full-width waveform timeline (160 px tall) with zoom and horizontal scroll.
   - Top bar: project name, steps as a segmented control, Export button on the right.
2. **Hierarchy on Sync.** The current line should be the biggest thing on screen (28 to 34 px on mobile), the next line dimmed below it, everything else secondary.
3. **Icons.** Replace text glyphs (♪ ☰ ◎ ↓ ▶ ⏸) with one consistent SVG icon set (Lucide, inline SVG, 1.75 px stroke). Glyphs render differently on every OS.
4. **Motion.** Keep it small and purposeful: tap flash (already there), line list slide when the pointer advances, 150 to 200 ms screen transitions, `prefers-reduced-motion` respected everywhere.
5. **Numbers.** `font-variant-numeric: tabular-nums` on all times so they don't jiggle.
6. **Contrast.** Check muted text (`.muted`) against the near-black background. Aim for 4.5:1.
7. **States.** Every button needs hover, pressed, focus-visible and disabled styles. Disabled Tap button should explain why ("Load audio and lyrics first").
8. **Empty states.** Each screen with nothing loaded gets an illustration-free empty state: one line of text + one button that goes to the step that's missing.
9. **Brand.** App icon (eclipse ring on black), favicon, splash color, OG image (1200×630) with "Sync lyrics. Export subtitles. Make lyric videos. Free."

---

## 6. v1.0 feature spec

### 6.1 Projects library (multiple songs)
- Home screen lists projects: title, artist, duration, "18/32 timed", last edited, small waveform thumbnail.
- Actions: New, Open, Duplicate, Rename, Delete (with confirm + 10 s undo toast), Export project file.
- Storage: move everything to **IndexedDB** (projects store + audio store keyed by project id). localStorage stays only for UI prefs (language, last project, tap offset).
- Request persistent storage (`navigator.storage.persist()`) so the browser doesn't wipe projects. Show used space.
- Remove the "Restore last session?" modal. Opening the app simply lands on the projects list (or reopens the last project).
- **Project file v2** (`.eclipse.json`): includes a `version` field and migrations. Optional "Include audio" checkbox that bundles audio as base64 in a `.zip` (`.eclipselyrics`) so a project can move between devices.

### 6.2 Lyric editor
- Grid editor described in section 4.
- Section markers `[Chorus]` etc.
- Paste detection: if the pasted text has two languages alternating line by line, offer "Split into Main + Translation".
- Character helper bar for Kabyle (ɛ ɣ č ḍ ḥ ṛ ṣ ṭ ẓ ǧ) and a Tifinagh keyboard toggle (Latin → Tifinagh transliteration as an optional column later).
- Line length warning above 42 characters per subtitle line.

### 6.3 Sync engine
- Tap offset + calibration.
- Simple tap mode and Hold-to-sing mode.
- Gap key.
- **Snap to onset (smart nudge):** when a tap lands, look ±150 ms in the audio for the nearest energy rise (onset detection on the decoded buffer, simple spectral flux) and snap to it if confident. Toggle in settings, off by default at first. This makes taps feel "magically" precise.
- Review mode with per-line replay.
- Undo/redo command stack (section 7).
- Word-level timing (v1.1): after lines are timed, "Word mode" taps each word inside a line. Enables karaoke video style and enhanced LRC.

### 6.4 Waveform timeline
- Pinch zoom and two-finger pan on touch, wheel zoom + Shift+wheel pan on desktop, zoom buttons for accessibility.
- Auto-follow the playhead when zoomed (turns off when the user pans, "Follow" button turns it back on).
- Line regions drawn as colored blocks between start and end, with the line text inside when zoomed enough.
- Drag a region edge to change start or end. Drag the block to move the line. Neighbors clamp (B4).
- Click empty waveform to seek (on desktop). On mobile keep the scrubber.
- Section markers as labels on top.

### 6.5 Export
- Formats: SRT, VTT, LRC, enhanced LRC (word timing), JSON, plain TXT (lyrics only), **TTML** (Apple Music style, v1.1).
- Options: languages (single choice, see section 4), global offset (±ms, for videos that start with an intro), "Minimum line duration" (default 0.7 s), "Max gap before clearing" (lines end automatically after X seconds of silence).
- Pre-export validation (B9) + preview + copy + share + ZIP.

### 6.6 Video studio
**Rendering engine (the big upgrade):**
- Use **WebCodecs** (`VideoEncoder` + `AudioEncoder`) + **Mediabunny** (successor to `mp4-muxer`, pin the version, load as an ES module from jsDelivr or vendor it in `/vendor`) to render **offline**: draw frame N at time N/fps into an `OffscreenCanvas`, encode, mux with the original audio into a real **MP4 (H.264 + AAC)**.
  - Faster than real time on most laptops, works with the tab in the background, exact frame timing, proper duration metadata, uploads cleanly to YouTube, Instagram and TikTok.
  - Feature-detect. If WebCodecs or the audio encoder isn't available (some Safari versions), fall back to the current MediaRecorder path with the fixes from B10/B11.
- Render in a Web Worker when `OffscreenCanvas` is supported, so the UI stays smooth with a real progress bar + time left + cancel.
- Video background: seek the video element per frame (or decode it with WebCodecs `VideoDecoder` in v1.1).

**Design controls:**
- Templates (presets that set everything at once): **Eclipse** (current), **Minimal** (white text, black), **Cinema** (bottom-third subtitles, letterbox), **Karaoke** (2 lines, sweep), **Bilingual** (main + translation stacked, different weights).
- Text: font (Outfit, Noto Sans, Noto Serif, one display font; all with Kabyle + Tifinagh fallbacks), size, weight, case, letter spacing, position (top/center/bottom thirds), alignment, max width, colors (presets from the eclipse palette + custom).
- Animation: Fade up, Glow sweep, Smoke, plus **Word pop** (word by word, needs word timing), **Typewriter**, **Blur in**. Speed slider (in/out duration).
- Background: eclipse glow, image, video, solid, gradient, **audio-reactive** (glow pulses with the song's RMS energy, which you already compute in `computePeaks`).
- Overlays: intro title card (title + artist, 3 s), artist watermark (corner, optional), progress bar, "Made with Eclipse Lyrics" tiny credit (on by default, can be turned off).
- Safe-zone guides for 9:16 (TikTok/Reels UI covers the bottom ~20% and right edge). Toggle to show them in preview, never in export.
- Export settings: 720p / 1080p / 4K (desktop only), 30 / 60 fps, **section only** (render just the chorus for a Reel: pick start and end line).

### 6.7 Real app: PWA
- `manifest.webmanifest`: name, short_name "Eclipse", icons (192, 512, maskable), `display: standalone`, theme and background colors.
- Service worker: precache the app shell, fonts and vendor files. Works fully offline after first visit (audio is local anyway).
- "Install app" button shown when `beforeinstallprompt` fires, and an iOS hint ("Share → Add to Home Screen").
- **File handling:** `file_handlers` in the manifest so `.lrc`, `.srt` and `.eclipse.json` open in the app on desktop Chrome/Edge.
- **Share target:** on Android, share an audio file to Eclipse Lyrics from the Files app.
- Update toast: "New version available. Refresh."

### 6.8 Onboarding
- First open: 3-card intro (Tap along, Export for YouTube, Make a lyric video), skippable, never shown again.
- Demo project preloaded and labeled "Demo".
- Contextual tips the first time each screen opens (one line, dismissible).
- Help screen: shortcuts, how to upload SRT to YouTube, FAQ ("Is my audio uploaded? No.").

### 6.9 Accessibility
- Zoom allowed (B20).
- Line list: real `role="listbox"` behavior with roving tabindex, or plain list of buttons. Enter = seek to line, `aria-selected` kept in sync.
- Sheets/dialogs: focus trap, Escape to close, return focus to the opener. Use native `<dialog>`.
- Live region announces "Line 12 timed at 0:42.18" after each tap (polite, throttled).
- All icon buttons have labels. Minimum 44×44 px touch targets.
- Waveform has keyboard equivalents (every drag action is also doable with arrow keys).

### 6.10 Languages
- UI in **EN, FR, Kabyle (Taqbaylit)**. Kabyle UI is a strong statement and a reason for the community to share it. Later: Arabic (needs RTL layout), Spanish.
- Detect browser language on first visit.

### 6.11 Growth and trust
- Landing section above the app on first visit (or a separate `/about`): one-line pitch, 15-second demo GIF, "Free · No sign-up · Audio stays on your device", "Made in Montréal by laousmail".
- SEO: title "Free Lyrics Sync & SRT Maker | Eclipse Lyrics", meta description, OG/Twitter image, JSON-LD `WebApplication` (free offer, category MultimediaApplication).
- Custom domain: `lyrics.laousmail.com` or `eclipselyrics.app`.
- Privacy-friendly, cookie-free analytics (GoatCounter or Plausible) counting only page views and export events (no audio, no lyrics). Say so in the privacy note.
- Feedback link (simple form or GitHub issue) + "Made something? Tag @laousmail".
- Optional "Support" link (Ko-fi / Buy Me a Coffee) on the Export success state, never blocking.

---

## 7. Architecture changes

Keep vanilla JS and no mandatory build step. Add structure:

```
index.html
manifest.webmanifest
sw.js
css/
  tokens.css        # colors, spacing, radius, type scale, motion
  app.css
js/
  main.js           # boot + router only
  store.js          # single state store: get(), set(), subscribe()
  history.js        # undo/redo command stack
  db.js             # IndexedDB wrapper (projects, audio, settings)
  router.js         # screens + hash routes (#/projects, #/p/<id>/sync ...)
  ui/
    toast.js
    dialog.js
    icons.js
  screens/
    projects.js lyrics.js sync.js export.js film.js
  core/
    timing.js       # tap, nudge, clamp, offsets, onset snap (pure functions)
    lyrics.js       # parse, diff, sections, split/merge (pure)
    formats/        # srt.js vtt.js lrc.js ttml.js json.js (pure, tested)
  audio/
    player.js
    peaks.worker.js
    onset.js
  video/
    renderer.js     # draws one frame for time t (pure, no DOM)
    layout.js       # shared text layout + wrapping for all styles
    styles/         # fadeUp glowSweep smoke wordPop typewriter blurIn
    export-webcodecs.js
    export-mediarecorder.js
vendor/
  mediabunny.js
tests/
  formats.test.js timing.test.js lyrics.test.js
```

Rules:
- **One state store.** Screens subscribe and re-render their own part. No screen reads another screen's DOM.
- **Every edit is a command** (`{ do(), undo(), label }`) pushed to `history.js`. Undo/redo works for everything for free.
- **Pure core.** `core/` and `video/renderer.js` never touch the DOM, so they can be unit tested and run in a worker.
- **Times stored as integer milliseconds** in the project model (`startMs`, `endMs`). Removes float bugs like B1 for good. Migrate v1 projects on load.
- **Tests:** Node's built-in `node --test` for `core/` and `formats/`. A GitHub Action runs them on every push. Add Playwright smoke tests later (load demo, tap 3 lines, export SRT, compare to fixture).
- **Line rendering:** update rows in place (by line id) instead of rebuilding the whole list on each tap.

### Project model v2

```json
{
  "version": 2,
  "id": "p_abc",
  "title": "", "artist": "",
  "audio": { "fileName": "", "durationMs": 0, "storedAudioId": "a_abc" },
  "languages": ["kab", "fr", "en"],
  "lines": [
    {
      "id": "L1",
      "type": "lyric",            
      "startMs": 12340, "endMs": 15800,
      "text": { "kab": "...", "fr": "...", "en": "..." },
      "words": [ { "text": "...", "startMs": 12340 } ]
    },
    { "id": "S1", "type": "section", "label": "Chorus" }
  ],
  "settings": {
    "tapOffsetMs": -150,
    "export": { "languages": "main", "globalOffsetMs": 0, "minLineMs": 700 },
    "video": { "template": "eclipse", "...": "..." }
  },
  "createdAt": 0, "updatedAt": 0
}
```

`text` as a map makes adding languages free (Tifinagh column, Arabic, etc.).

---

## 8. Build order (with Cursor prompts)

### Phase 0: Trustworthy timings (1 to 2 days)
Fix B1 to B22.
> **Cursor prompt:** "Read `Eclipse-Lyrics-v1-Audit.md` section 3. Fix bugs B1 through B22 in this repo, one commit per bug, keeping vanilla JS and no build step. For B1, B7, B8 add Node `node --test` unit tests in `/tests` with fixtures. Do not change the UI layout yet."

### Phase 1: Foundation (2 to 3 days)
Store, history (undo/redo), IndexedDB projects, ms-based model v2 with migration, toasts, native dialogs, icon set, tokens.css.
> **Cursor prompt:** "Implement section 7 of the audit: `store.js`, `history.js`, `db.js`, model v2 with integer ms and a migration from v1 projects in localStorage. Every edit (tap, nudge, drag, text edit, import) goes through history. Add `ui/toast.js` and replace all `alert()` calls. Add `css/tokens.css`. Keep all current features working."

### Phase 2: Sync that feels pro (3 to 4 days)
New mobile Sync layout, desktop workspace, tap offset + calibration, hold-to-sing mode, gap key, review mode, line menu (edit/split/merge/insert/delete), section markers, grid lyric editor, timeline upgrades (6.4).
> **Cursor prompt:** "Implement audit sections 4 (Lyrics, Sync) and 6.2 to 6.4. Mobile Sync layout: compact preview, line list fills the screen, 60 px waveform strip, dock. Desktop ≥1024 px: three-pane workspace from section 5. Add tap offset with a calibration screen, hold-to-sing mode, G for gap, review mode, row menu actions, `[Section]` markers, grid lyric editor, and the waveform timeline features."

### Phase 3: Projects + export polish (2 days)
Projects library screen, persistent storage, project file v2 with optional audio, export redesign (YouTube card, language choice, validation, preview, copy, share, ZIP, laousmail.com JSON).
> **Cursor prompt:** "Implement audit 6.1 and 6.5 plus the Export section of 4."

### Phase 4: Video studio (4 to 6 days)
Offline WebCodecs + Mediabunny MP4 export with MediaRecorder fallback, worker rendering, shared text layout, templates, text controls, new styles, audio-reactive background, title card, safe zones, section-only render, preview scrubber.
> **Cursor prompt:** "Implement audit 6.6. Start with `video/renderer.js` as a pure function `drawFrame(ctx, project, tMs, settings)` and `video/layout.js`. Then `export-webcodecs.js` using Mediabunny (pinned version, vendored in `/vendor`) to output H.264 + AAC MP4, rendering frames offline in a worker with progress and cancel. Keep `export-mediarecorder.js` as the fallback with 10 Mbps bitrate and visibility handling."

### Phase 5: Real app + launch (2 days)
PWA (manifest, service worker, install, file handling, share target), onboarding + demo project, help screen, Kabyle UI, accessibility pass (6.9), SEO/OG, analytics, domain.
> **Cursor prompt:** "Implement audit 6.7 to 6.11. The app must work fully offline after the first visit and pass Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95, installable."

### Phase 6 (v1.1): Word-level karaoke
Word mode tapping, enhanced LRC, Word pop + karaoke sweep styles driven by real word times, TTML export.

---

## 9. Acceptance checks (run after every phase)

**Timing**
- [ ] Sync a full song in one listen + review pass. Exported SRT uploaded to YouTube matches the voice within ~50 ms on every line.
- [ ] Round trip: export SRT/VTT/LRC → import → export again gives identical files.
- [ ] `1.999 s` exports as `00:00:01,999` (SRT) and `[00:02.00]` (LRC).
- [ ] An instrumental gap of 20 s shows no lyric on screen in SRT and in the video.
- [ ] Inserting a line in the middle of timed lyrics keeps every other line's time.

**Reliability**
- [ ] Refresh, close the tab, reopen the next day: project, audio and position are there.
- [ ] Three projects can exist side by side. Deleting one asks for confirmation and can be undone.
- [ ] Works offline after first visit (airplane mode test).
- [ ] No uncaught errors in the console during the full flow.

**Video**
- [ ] 3-minute 1080p MP4 renders without the tab in focus, plays with the right duration in QuickTime/Photos, uploads to YouTube and Instagram.
- [ ] Kabyle characters (ɛ ɣ č ḍ ḥ ṛ ṣ ṭ ẓ) and Tifinagh render in every style from the first frame.
- [ ] Long lines wrap in every style; nothing goes off-canvas in 9:16, 16:9, 1:1.

**UX / UI**
- [ ] First-time user loads the demo and exports an SRT in under 2 minutes without help.
- [ ] On a 390 px phone, the current line, next line, line list and Tap button are all visible without scrolling on Sync.
- [ ] On a 1440 px laptop, the workspace uses the full width.
- [ ] Space/Backspace/arrows do nothing outside the Sync screen.
- [ ] Every action has visible feedback (toast, state change, or haptic).
- [ ] Pinch-zoom works. Keyboard-only use is possible for the whole flow.

**Privacy**
- [ ] Network tab shows zero requests containing audio or lyrics. Only static files (+ analytics page views if enabled).

---

## 10. Quick wins you can ship today (under 1 hour each)

1. B1 rounding fix.
2. B2 shortcuts only on Sync.
3. B11 bitrate to 10 Mbps.
4. B22 "this device".
5. Favicon + app icon + OG image.
6. Allow pinch-zoom (B20).
7. "Try with a demo song" button.
