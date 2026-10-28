/** Audio loading, playback, and Web Audio decoding. */

let audioEl = null;
let objectUrl = null;
let audioContext = null;
let decodedBuffer = null;
let mediaElementSource = null;
let streamDest = null;

export function getAudioElement() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.crossOrigin = "anonymous";
  }
  return audioEl;
}

function ensureContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

export function getAudioContext() {
  return ensureContext();
}

export async function resumeContext() {
  const ctx = ensureContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

/**
 * Load a File or Blob. Returns { fileName, duration, buffer }.
 */
export async function loadAudioFile(file) {
  const audio = getAudioElement();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load this audio file"));
    };
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("loadedmetadata", onReady);
    audio.addEventListener("error", onError);
    audio.load();
  });

  const ctx = ensureContext();
  const arrayBuffer = await file.arrayBuffer();
  decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  // Wire MediaElementSource once for recording later
  if (!mediaElementSource) {
    mediaElementSource = ctx.createMediaElementSource(audio);
    streamDest = ctx.createMediaStreamDestination();
    mediaElementSource.connect(ctx.destination);
    mediaElementSource.connect(streamDest);
  }

  return {
    fileName: file.name,
    duration: audio.duration || decodedBuffer.duration,
    buffer: decodedBuffer,
    blob: file,
  };
}

export function getDecodedBuffer() {
  return decodedBuffer;
}

export function getAudioStreamTrack() {
  return streamDest ? streamDest.stream.getAudioTracks()[0] : null;
}

export function getMediaStreamDestination() {
  return streamDest;
}

export function play() {
  return resumeContext().then(() => getAudioElement().play());
}

export function pause() {
  getAudioElement().pause();
}

export function togglePlay() {
  const a = getAudioElement();
  if (a.paused) return play();
  pause();
  return Promise.resolve();
}

export function seek(time) {
  const a = getAudioElement();
  const d = a.duration || 0;
  a.currentTime = Math.max(0, Math.min(time, d || time));
}

export function getCurrentTime() {
  return getAudioElement().currentTime || 0;
}

export function getDuration() {
  return getAudioElement().duration || (decodedBuffer ? decodedBuffer.duration : 0);
}

export function isPlaying() {
  const a = getAudioElement();
  return !a.paused && !a.ended;
}

export function setPlaybackRate(rate) {
  getAudioElement().playbackRate = rate;
}

export function getPlaybackRate() {
  return getAudioElement().playbackRate || 1;
}

export function onTimeUpdate(fn) {
  getAudioElement().addEventListener("timeupdate", fn);
  return () => getAudioElement().removeEventListener("timeupdate", fn);
}

export function onPlayState(fn) {
  const a = getAudioElement();
  const handler = () => fn(isPlaying());
  a.addEventListener("play", handler);
  a.addEventListener("pause", handler);
  a.addEventListener("ended", handler);
  return () => {
    a.removeEventListener("play", handler);
    a.removeEventListener("pause", handler);
    a.removeEventListener("ended", handler);
  };
}

export function clearAudio() {
  pause();
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  decodedBuffer = null;
  const a = getAudioElement();
  a.removeAttribute("src");
  a.load();
}
