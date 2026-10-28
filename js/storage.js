/** Auto-save / restore via localStorage + optional IndexedDB for audio. */

const LS_KEY = "eclipse-lyrics-project";
const IDB_NAME = "eclipse-lyrics";
const IDB_STORE = "audio";
const IDB_KEY = "current";

let saveTimer = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function hasSavedSession() {
  try {
    return Boolean(localStorage.getItem(LS_KEY));
  } catch {
    return false;
  }
}

export function loadProjectMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function scheduleSave(project) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(project), 500);
}

export function saveNow(project) {
  try {
    const snapshot = {
      ...project,
      savedAt: Date.now(),
    };
    // Don't persist blob in localStorage
    delete snapshot.audioBlob;
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("localStorage save failed", err);
  }
}

export async function saveAudioBlob(blob, fileName) {
  if (!blob) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ blob, fileName }, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("IndexedDB audio save failed", err);
  }
}

export async function loadAudioBlob() {
  try {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearSession() {
  clearTimeout(saveTimer);
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export function downloadProjectFile(project, filename) {
  const data = { ...project };
  delete data.audioBlob;
  delete data._peaks;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(blob, filename || `${safeName(project.title || "project")}.json`);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(s) {
  return String(s)
    .trim()
    .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "project";
}
