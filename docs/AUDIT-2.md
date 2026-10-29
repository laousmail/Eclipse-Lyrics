# Eclipse Lyrics: Audit 2 (people-ready pass)

**Audited:** Oct 29, 2026, on `main` after PR #15
**Method:** drove the real app in Chromium at 390 px (phone) and 1440 px (laptop):
new project → load audio → paste lyrics → tap-sync with the keyboard → export SRT → render MP4.
Then compared every screen against laousmail.com and brought the app onto the same design language.

---

## 1. Bugs found and fixed

| # | Severity | What a person saw | Cause | Fix |
|---|---|---|---|---|
| C1 | Critical | Pasting a whole song into the lyric grid gave **one row** with every line glued together. | Grid cells are `<input type="text">`, which drop newlines. | Multi-line paste now splits into one row per line (`pasteIntoRows` in `js/core/lyrics.js`). Pasting into FR/EN fills that column down the song, skipping sections. Tab-separated text from a sheet spreads across Main/FR/EN. |
| C2 | Critical | **No keyboard shortcut worked** after the welcome card closed: Space didn't tap, P/K didn't play. | `isDialogOpen()` counted the intro card (`role="dialog"`) even though its overlay was hidden. | Ignore dialogs inside a hidden ancestor (`js/ui/dialog.js`). |
| C3 | High | The first pasted line, or a row being typed, could vanish after paste / Add row. | Re-rendering the grid removes the focused input, which fires a late `blur` carrying its old value. | The grid ignores events fired while it re-renders (`js/ui/lyricsGrid.js`). |
| C4 | High | Lyric video: any line sung in the first 3 s was **hidden behind the title card**. | Title card always lasted 3 s. | Card ends 0.2 s before the first timed line, and is dropped if shorter than 1 s (`introDurationSec`). |
| C5 | High | Film preview did not match the export: a custom font size looked ~2× bigger in the preview. Auto size was 3.5 % of width, so 9:16 videos had tiny text. | Font size / letter spacing were absolute px, preview renders at 45 %. | Sizes are now set for a 1080 px short side and scale with the frame (`lyricSizePx`, `letterSpacingPx`). Auto = 60 px at 1080p in every aspect. Slider shows "Auto" at 0, max 140. |
| H1 | Medium | Film preview letterboxed inside its frame; 16:9 / 1:1 previews squeezed into a 9:16 box. | Stage had a fixed 9:16 ratio and fixed width. | Stage takes the output's aspect ratio. |
| H2 | Medium | Sliders (Film scrubber, In/out, Size…) were drawn as text boxes with no visible track. | Text-field styles matched `input[type=range]`. | Native slider with the ember accent. |
| H3 | Medium | After timing every line there was no way forward except the ⋮ menu. | Export is a More-sheet screen. | "Export subtitles" replaces the progress chip once every line is timed, and the "All lines timed" toast carries an Export action. The 4-tab bar is unchanged. |
| H4 | Medium | Project cards were English in the French UI ("Open", "Delete"…), with a raw `10/29/2026, 1:22:29 PM` date and a bare "6 / 6". | Hard-coded strings. | Translated labels, short dates ("1:39 PM" today, "Oct 28, 2026" otherwise), "6 / 6 timed", labelled ⋯ button with `aria-expanded`. |
| L1 | Low | Toasts sat on top of the first-visit screen tips. | Same fixed position. | Toast rises above a visible tip. |
| L2 | Low | Song screen: "What's the song called?" card even with a title filled in; a second box repeated the file name and duration. | Prompt always shown; status box never hidden. | Prompt only when the title is empty; status box hidden once audio is loaded and restyled as a quiet mono line. |
| L3 | Low | Sync preview card showed a lone "—" before the first line and after the last. | No current line. | Shows ♪ and the next line. |
| L4 | Low | Film "Jump to line" stayed on "—" while scrubbing. | Not kept in sync. | Follows the scrubber. |
| L5 | Low | Text fields used the browser's default font (Arial) instead of Outfit. | Inputs don't inherit `font-family`. | Inherit; lyric cells use the lyric stack (Noto Sans + Tifinagh). |

### Second sweep (same day)

| # | Severity | What a person saw | Fix |
|---|---|---|---|
| S1 | High | **No toast button could be clicked**: "Undo" after deleting a project, "Export" after syncing, "Refresh" for updates. | `.toast` let clicks through to the page, including on its button. The button now takes clicks. |
| S2 | High | An edit made just before closing or reloading the tab was lost. | Saves are debounced by 500 ms. They are now written immediately when the tab is hidden or closed, and the database commits at once. |
| S3 | Medium | Lyric videos kept a line on screen through long instrumental gaps and outros. | Lines leave after the export "max gap" (8 s default), the same rule the subtitle files use. |
| S4 | Medium | Export with no explicit settings applied **no** max gap and **no** minimum line length (`Number(undefined) ?? 8000` is `NaN`). | Defaults now apply. |
| S5 | Medium | Eclipse template: the lyric ran across the lower edge of the ring; in 16:9 the ring was huge. | Ring sized from the short side and kept clear of the text (above it, or below when lyrics sit at the top); the title card sits inside it. |
| S6 | Medium | Some browsers save the "MP4" as VP9 or Opus, which Instagram, TikTok or iPhone Photos may refuse, and nothing said so. | The recorder now asks for H.264 explicitly, and the app checks the codecs inside the finished file and explains when it isn't H.264 + AAC. |
| S7 | Medium | Deleting the open project left an empty "Untitled" card. | Projects with no audio, title or lyrics stay out of the library. |
| S8 | Low | Switching language reset live labels: the Tap button said "mark start" with every line timed. | Live labels are redrawn after a language change. |
| S9 | Low | French: the Gap button said "Pause" (looks like play/pause); the Sync header wrapped onto three lines; project times used the browser's language. | "Silence"; a short "Exporter →" button; dates follow the app's language. |

All verified in the browser after the fix; C1, C2, C4, C5, S3–S7 have unit tests.

## 2. Design: laousmail.com language

Same palette already; what was missing was the site's typography and button feel. All in `css/brand.css`, loaded after `app.css`:

- **Cormorant Garamond** (600) for screen titles, as on the site's hero.
- **JetBrains Mono** for eyebrows, section labels, timecodes, progress and the "by laousmail" tag (uppercase, wide tracking).
- **One primary button** everywhere: ember→gold gradient pill with the site's passing sheen on hover (off for reduced motion). The per-screen button colours (light gold on Export, red on Film, amber on Projects) are gone; screens keep their accent on eyebrows, tabs and the Tap dock.
- **Brand mark** is an eclipse (dark disc, ember corona) instead of a flat orange ball, echoing the site's orbit.
- Collapsible sections use mono labels and a drawn chevron.
- **Desktop Film** is two columns: large preview on the left, Export + settings on the right (settings open by default).

Fonts are self-hosted (OFL, from Fontsource) and precached by the service worker (`eclipse-lyrics-v8`), so the app stays fully offline.

## 3. Still open (recommended next)

1. **Kabyle:** 202 labels the app shows have no Kabyle yet and appear in English. Fill-in sheet: `docs/KABYLE-STRINGS.md`.
2. **Real-device check** on an iPhone (Safari) and an Android phone: paste, tap, export SRT, export MP4.
3. Later features (not v1): light theme, word-by-word karaoke, link from laousmail.com.
