/** IndexedDB: projects + audio. localStorage only for UI preferences. */

import { projectId as newProjectId, audioId as newAudioId } from "./core/project.js";

const DB_NAME = "eclipse-lyrics-v2";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_AUDIO = "audio";
const PREFS_KEY = "eclipse-lyrics-prefs";
const LEGACY_LS_KEY = "eclipse-lyrics-project";
const LEGACY_IDB = "eclipse-lyrics";

let dbPromise = null;

// Kept so a save can start synchronously while the page is closing
let openConnection = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      openConnection = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("aborted"));
  });
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { lang: null, lastProjectId: null };
    return { lang: null, lastProjectId: null, ...JSON.parse(raw) };
  } catch {
    return { lang: null, lastProjectId: null };
  }
}

export function savePrefs(prefs) {
  try {
    const next = { ...loadPrefs(), ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
  } catch (err) {
    console.warn("prefs save failed", err);
    return prefs;
  }
}

function putProject(db, project) {
  const copy = { ...project, updatedAt: Date.now() };
  delete copy.audioBlob;
  delete copy._peaks;
  const tx = db.transaction(STORE_PROJECTS, "readwrite");
  tx.objectStore(STORE_PROJECTS).put(copy);
  // Commit now rather than at the end of the task, which may never come on page close
  tx.commit?.();
  return { copy, done: txDone(tx) };
}

export async function saveProject(project) {
  if (!project?.id) throw new Error("project.id required");
  const db = openConnection || (await openDb());
  const { copy, done } = putProject(db, project);
  await done;
  savePrefs({ lastProjectId: project.id });
  return copy;
}

export async function getProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, "readonly");
    const req = tx.objectStore(STORE_PROJECTS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjects() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, "readonly");
    const req = tx.objectStore(STORE_PROJECTS).getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id, audioId = "") {
  const db = await openDb();
  const tx = db.transaction([STORE_PROJECTS, STORE_AUDIO], "readwrite");
  tx.objectStore(STORE_PROJECTS).delete(id);
  if (audioId) tx.objectStore(STORE_AUDIO).delete(audioId);
  await txDone(tx);
  const prefs = loadPrefs();
  if (prefs.lastProjectId === id) savePrefs({ lastProjectId: null });
}

/** Soft-delete helper: return snapshot for undo. */
export async function removeProjectWithAudio(project) {
  const id = project?.id;
  const audioKey = project?.audio?.storedAudioId || "";
  let audioRow = null;
  if (audioKey) audioRow = await loadAudio(audioKey);
  await deleteProject(id, audioKey);
  return { project: { ...project }, audioRow };
}

export async function restoreDeletedProject(snapshot) {
  if (!snapshot?.project) return;
  await saveProject(snapshot.project);
  if (snapshot.audioRow?.id && snapshot.audioRow.blob) {
    await saveAudio(snapshot.audioRow.id, snapshot.audioRow.blob, snapshot.audioRow.fileName || "");
  }
}

export async function duplicateProject(project) {
  const copy = JSON.parse(JSON.stringify(project));
  copy.id = newProjectId();
  copy.title = `${project.title || "Untitled"} (copy)`;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  const oldAudio = project.audio?.storedAudioId || "";
  copy.audio = {
    ...(copy.audio || {}),
    storedAudioId: newAudioId(),
  };
  await saveProject(copy);
  if (oldAudio) {
    const row = await loadAudio(oldAudio);
    if (row?.blob) await saveAudio(copy.audio.storedAudioId, row.blob, row.fileName || copy.audio.fileName || "");
  }
  return copy;
}

export async function estimateStorage() {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    }
  } catch {
    /* ignore */
  }
  return { usage: 0, quota: 0 };
}

export async function saveAudio(id, blob, fileName = "") {
  if (!id || !blob) return;
  const db = await openDb();
  const tx = db.transaction(STORE_AUDIO, "readwrite");
  tx.objectStore(STORE_AUDIO).put({ id, blob, fileName });
  await txDone(tx);
}

export async function loadAudio(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readonly");
    const req = tx.objectStore(STORE_AUDIO).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudio(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE_AUDIO, "readwrite");
  tx.objectStore(STORE_AUDIO).delete(id);
  await txDone(tx);
}

/** Read legacy v1 localStorage + old IDB audio for one-shot migration. */
export async function readLegacySession() {
  let meta = null;
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) meta = JSON.parse(raw);
  } catch {
    meta = null;
  }
  let audio = null;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(LEGACY_IDB, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (db.objectStoreNames.contains("audio")) {
      audio = await new Promise((resolve, reject) => {
        const tx = db.transaction("audio", "readonly");
        const req = tx.objectStore("audio").get("current");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }
    db.close();
  } catch {
    audio = null;
  }
  return { meta, audio };
}

export async function clearLegacySession() {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(LEGACY_IDB, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (db.objectStoreNames.contains("audio")) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("audio", "readwrite");
        tx.objectStore("audio").delete("current");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
  } catch {
    /* ignore */
  }
}

let saveTimer = null;
let pendingProject = null;

export function scheduleSaveProject(project) {
  clearTimeout(saveTimer);
  pendingProject = project;
  saveTimer = setTimeout(flushSaveProject, 500);
}

/** Write a debounced save now (tab hidden or closing), so the last edit isn't lost. */
export function flushSaveProject() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const project = pendingProject;
  pendingProject = null;
  if (!project) return Promise.resolve();
  return saveProject(project).catch((err) => console.warn("project save failed", err));
}
