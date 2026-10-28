/** Fetch plaintext lyrics from a public Google Doc. */

export function parseGoogleDocId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  // https://docs.google.com/document/d/DOC_ID/edit...
  const m = raw.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // bare id
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  return null;
}

/**
 * Export public Google Doc as plain text.
 * Requires the doc to be shared as "Anyone with the link".
 */
export async function fetchGoogleDocText(urlOrId) {
  const id = parseGoogleDocId(urlOrId);
  if (!id) {
    const err = new Error("BAD_URL");
    throw err;
  }
  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
  let res;
  try {
    res = await fetch(exportUrl, { redirect: "follow" });
  } catch {
    const err = new Error("FETCH_FAILED");
    throw err;
  }
  if (!res.ok) {
    const err = new Error("NOT_PUBLIC");
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  // Google sometimes returns an HTML login / permission page
  // (regex must not have an empty alternative — that always matched)
  if (/<!DOCTYPE html>/i.test(text.slice(0, 200)) && /accounts\.google|Sign in/i.test(text)) {
    const err = new Error("NOT_PUBLIC");
    throw err;
  }
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
}
