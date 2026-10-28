/** First-run intro, per-screen tips, localStorage flags. */

const INTRO_KEY = "eclipse-lyrics-intro-seen";
const TIPS_KEY = "eclipse-lyrics-tips";

export function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* ignore */
  }
}

function readTips() {
  try {
    return JSON.parse(localStorage.getItem(TIPS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function hasSeenTip(screen) {
  return Boolean(readTips()[screen]);
}

export function markTipSeen(screen) {
  const tips = readTips();
  tips[screen] = 1;
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify(tips));
  } catch {
    /* ignore */
  }
}

export const INTRO_CARDS = [
  {
    id: "tap",
    titleKey: "introTapTitle",
    bodyKey: "introTapBody",
  },
  {
    id: "export",
    titleKey: "introExportTitle",
    bodyKey: "introExportBody",
  },
  {
    id: "film",
    titleKey: "introFilmTitle",
    bodyKey: "introFilmBody",
  },
];

export const SCREEN_TIPS = {
  projects: "tipProjects",
  prepare: "tipPrepare",
  // legacy tip keys kept for older localStorage tip maps
  audio: "tipPrepare",
  lyrics: "tipPrepare",
  sync: "tipSync",
  export: "tipExport",
  video: "tipFilm",
  help: "tipHelp",
};
