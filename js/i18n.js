/** French / English UI strings for Eclipse Lyrics. */

const STRINGS = {
  en: {
    metaDescription:
      "Free browser tool to sync song lyrics, export subtitles, and render lyric videos. Made by laousmail.",
    skip: "Skip to main content",
    brandTag: "by laousmail",
    moreAria: "More project actions",
    moreTitle: "Project",
    saveProject: "Save project",
    openProject: "Open project",
    importSubtitles: "Import subtitles",
    close: "Close",
    restoreTitle: "Restore your last session?",
    restore: "Restore",
    startFresh: "Start fresh",
    step1: "Step 1",
    loadAudio: "Load audio",
    loadLead: "Your file stays on this phone. Nothing is uploaded.",
    chooseAudio: "Choose audio",
    audioFormats: "MP3 · WAV · M4A · OGG",
    orFromLink: "Or paste an audio link",
    audioUrlPlaceholder: "https://…/song.mp3",
    loadUrl: "Load link",
    changeAudio: "Replace audio",
    title: "Title",
    artist: "Artist",
    titlePlaceholder: "Song title",
    artistPlaceholder: "Artist",
    titlePrompt: "What’s the song called?",
    titlePromptLead: "Name it, then continue to paste your lyrics.",
    noAudio: "No audio loaded",
    continueLyrics: "Continue to lyrics",
    loadedContinue: "Continue — name your song",
    step2: "Step 2",
    pasteLyrics: "Paste lyrics",
    lyricsLead: "One line per row. Switch language with the tabs.",
    main: "Main",
    french: "French",
    english: "English",
    lyricsPlaceholder: "One line per row\n\nAwal ameqran\n…",
    frPlaceholder: "Matching line count (optional)",
    enPlaceholder: "Matching line count (optional)",
    applyLyrics: "Apply lyrics",
    goSync: "Go to sync",
    gdocsLabel: "Import from Google Docs",
    gdocsPlaceholder: "Public Google Docs link",
    gdocsFetch: "Fetch lyrics",
    gdocsHint:
      "The document must be public (Anyone with the link → Viewer). Private docs can’t be read in the browser.",
    step3: "Step 3",
    tapSync: "Tap to sync",
    waveformTip: "Scroll to zoom · drag markers to fine-tune times",
    scrubLabel: "Scrub timeline",
    scrubHint: "Slide to jump in the song — separate from Tap",
    goStart: "Start",
    speed: "Speed",
    undo: "Undo",
    lines: "Lines",
    shortcuts:
      "Space tap · P play · ←→ nudge · ↑↓ select · J/L ±5s · ,/. speed",
    step4: "Step 4",
    export: "Export",
    exportLead: "Download subtitle files for YouTube, the web, or your player.",
    includeTr: "Include translation as second line (SRT / VTT)",
    trLang: "Translation language",
    onePerLang: "One file per language",
    exportLrcTitle: "LRC",
    exportLrcDesc: "For music apps and lyric players that show lines as the song plays.",
    exportSrtTitle: "SRT",
    exportSrtDesc: "The usual subtitle file for YouTube — upload it with your video.",
    exportVttTitle: "VTT",
    exportVttDesc: "For websites and HTML5 video players on the web.",
    exportJsonTitle: "JSON",
    exportJsonDesc: "Your full project to reopen later or use in the laousmail player.",
    step5: "Step 5",
    lyricVideo: "Lyric video",
    videoLead: "Preview animations, then record in real time.",
    aspect: "Aspect",
    style: "Style",
    background: "Background",
    uploadBg: "Upload background",
    blur: "Blur",
    darken: "Darken",
    slowZoom: "Slow zoom",
    showTr: "Show translation",
    translation: "Translation",
    livePreview: "Live preview",
    stopPreview: "Stop preview",
    recordVideo: "Record video",
    stopRecording: "Stop recording",
    recordingKeep: "Recording… keep this tab open",
    tabAudio: "Audio",
    tabLyrics: "Lyrics",
    tabSync: "Sync",
    tabExport: "Export",
    tabFilm: "Film",
    tapLine: "Tap line",
    markStart: "mark start",
    play: "Play",
    pause: "Pause",
    back5: "−5s",
    fwd5: "＋5s",
    footer: "made by laousmail · audio never leaves your device",
    loadWaveform: "Load audio to see waveform",
    langSwitch: "Language",
    errAudioLoad: "Could not load this audio file",
    errAudioUrl: "Couldn’t fetch that link. The file must allow cross-origin access (CORS), or try downloading it and choosing the file instead.",
    errAudioUrlEmpty: "Paste an audio link first.",
    errGdocs: "Couldn’t read that Google Doc. Make sure it’s public (Anyone with the link can view), or paste the lyrics manually.",
    errGdocsEmpty: "Paste a Google Docs link first.",
    errGdocsBad: "That doesn’t look like a Google Docs link.",
    loadingAudio: "Loading…",
    loadingDocs: "Fetching document…",
  },
  fr: {
    metaDescription:
      "Outil gratuit dans le navigateur pour caler des paroles, exporter des sous-titres et créer des vidéos lyrics. Par laousmail.",
    skip: "Aller au contenu principal",
    brandTag: "par laousmail",
    moreAria: "Plus d’actions projet",
    moreTitle: "Projet",
    saveProject: "Enregistrer le projet",
    openProject: "Ouvrir un projet",
    importSubtitles: "Importer des sous-titres",
    close: "Fermer",
    restoreTitle: "Reprendre la dernière session ?",
    restore: "Reprendre",
    startFresh: "Recommencer",
    step1: "Étape 1",
    loadAudio: "Charger l’audio",
    loadLead: "Le fichier reste sur ce téléphone. Rien n’est envoyé.",
    chooseAudio: "Choisir l’audio",
    audioFormats: "MP3 · WAV · M4A · OGG",
    orFromLink: "Ou coller un lien audio",
    audioUrlPlaceholder: "https://…/chanson.mp3",
    loadUrl: "Charger le lien",
    changeAudio: "Remplacer l’audio",
    title: "Titre",
    artist: "Artiste",
    titlePlaceholder: "Titre de la chanson",
    artistPlaceholder: "Artiste",
    titlePrompt: "Comment s’appelle la chanson ?",
    titlePromptLead: "Donne-lui un nom, puis continue pour coller les paroles.",
    noAudio: "Aucun audio chargé",
    continueLyrics: "Continuer vers les paroles",
    loadedContinue: "Continuer — nommer la chanson",
    step2: "Étape 2",
    pasteLyrics: "Coller les paroles",
    lyricsLead: "Une ligne par rangée. Change de langue avec les onglets.",
    main: "Principal",
    french: "Français",
    english: "Anglais",
    lyricsPlaceholder: "Une ligne par rangée\n\nAwal ameqran\n…",
    frPlaceholder: "Même nombre de lignes (optionnel)",
    enPlaceholder: "Même nombre de lignes (optionnel)",
    applyLyrics: "Appliquer les paroles",
    goSync: "Aller au sync",
    gdocsLabel: "Importer depuis Google Docs",
    gdocsPlaceholder: "Lien Google Docs public",
    gdocsFetch: "Récupérer les paroles",
    gdocsHint:
      "Le document doit être public (Toute personne disposant du lien → Lecteur). Les docs privés ne peuvent pas être lus ici.",
    step3: "Étape 3",
    tapSync: "Tap pour caler",
    waveformTip: "Molette pour zoomer · glisser les marqueurs pour affiner",
    scrubLabel: "Curseur de temps",
    scrubHint: "Glisse pour te placer dans la chanson — séparé du Tap",
    goStart: "Début",
    speed: "Vitesse",
    undo: "Annuler",
    lines: "Lignes",
    shortcuts:
      "Espace tap · P lecture · ←→ décaler · ↑↓ choisir · J/L ±5s · ,/. vitesse",
    step4: "Étape 4",
    export: "Exporter",
    exportLead: "Télécharge des fichiers de sous-titres pour YouTube, le web ou ton lecteur.",
    includeTr: "Inclure la traduction en 2ᵉ ligne (SRT / VTT)",
    trLang: "Langue de traduction",
    onePerLang: "Un fichier par langue",
    exportLrcTitle: "LRC",
    exportLrcDesc: "Pour les apps musique et lecteurs qui affichent les paroles en temps réel.",
    exportSrtTitle: "SRT",
    exportSrtDesc: "Le format classique pour YouTube — à téléverser avec ta vidéo.",
    exportVttTitle: "VTT",
    exportVttDesc: "Pour les sites web et les lecteurs vidéo HTML5.",
    exportJsonTitle: "JSON",
    exportJsonDesc: "Ton projet complet pour le rouvrir plus tard ou pour le lecteur laousmail.",
    step5: "Étape 5",
    lyricVideo: "Vidéo lyrics",
    videoLead: "Prévisualise les animations, puis enregistre en temps réel.",
    aspect: "Format",
    style: "Style",
    background: "Fond",
    uploadBg: "Importer un fond",
    blur: "Flou",
    darken: "Assombrir",
    slowZoom: "Zoom lent",
    showTr: "Afficher la traduction",
    translation: "Traduction",
    livePreview: "Aperçu live",
    stopPreview: "Arrêter l’aperçu",
    recordVideo: "Enregistrer la vidéo",
    stopRecording: "Arrêter l’enregistrement",
    recordingKeep: "Enregistrement… garde cet onglet ouvert",
    tabAudio: "Audio",
    tabLyrics: "Paroles",
    tabSync: "Sync",
    tabExport: "Export",
    tabFilm: "Film",
    tapLine: "Tap ligne",
    markStart: "marquer début",
    play: "Lecture",
    pause: "Pause",
    back5: "−5s",
    fwd5: "＋5s",
    footer: "fait par laousmail · l’audio ne quitte pas ton appareil",
    loadWaveform: "Charge l’audio pour voir l’onde",
    langSwitch: "Langue",
    errAudioLoad: "Impossible de charger ce fichier audio",
    errAudioUrl:
      "Impossible de récupérer ce lien. Le fichier doit autoriser l’accès cross-origin (CORS), ou télécharge-le puis choisis le fichier.",
    errAudioUrlEmpty: "Colle d’abord un lien audio.",
    errGdocs:
      "Impossible de lire ce Google Doc. Vérifie qu’il est public (Toute personne avec le lien peut consulter), ou colle les paroles à la main.",
    errGdocsEmpty: "Colle d’abord un lien Google Docs.",
    errGdocsBad: "Ça ne ressemble pas à un lien Google Docs.",
    loadingAudio: "Chargement…",
    loadingDocs: "Récupération du document…",
  },
};

const LS_KEY = "eclipse-lyrics-lang";

let lang = "en";

export function getLang() {
  return lang;
}

export function t(key) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

export function detectLang() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}

export function setLang(next) {
  lang = next === "fr" ? "fr" : "en";
  try {
    localStorage.setItem(LS_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  applyDom();
  return lang;
}

export function applyDom() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const val = t(key);
    if (el.tagName === "META") {
      el.setAttribute("content", val);
      return;
    }
    el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  });
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("metaDescription"));
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.lang === lang ? "true" : "false");
  });
}

export function initI18n() {
  lang = detectLang();
  document.documentElement.lang = lang;
  applyDom();
}
