/** Tiny static server with gzip for Lighthouse / local smoke. */
import http from "http";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8766);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = path.normalize(path.join(root, urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";
    const raw = fs.readFileSync(filePath);
    const accept = req.headers["accept-encoding"] || "";
    const compressible = [".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg"].includes(ext);
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=3600");
    if (compressible && accept.includes("gzip")) {
      res.setHeader("Content-Encoding", "gzip");
      res.end(zlib.gzipSync(raw));
    } else {
      res.end(raw);
    }
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`);
});
