/* eslint-disable */
// Electron entry — wraps the Vite production build (dist/) in a standalone
// native window. We serve dist/ over http://127.0.0.1:<random-port> rather than
// file:// because Vite's output and Three.js dynamic imports resolve correctly
// only under a real origin. The port is bound to loopback only.

const { app, BrowserWindow, screen, Menu } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

let server = null;
let serverPort = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      const filePath = path.join(distDir, urlPath);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(distDir))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(resolved, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end(`Not found: ${urlPath}`);
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
    server.on("error", reject);
  });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const w = Math.min(1920, Math.floor(width * 0.8));
  const h = Math.min(1080, Math.floor(height * 0.8));

  const win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#05070a",
    title: "Wall of Dead",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());
  win.loadURL(`http://127.0.0.1:${serverPort}/`);

  if (process.env.WOD_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server) {
    try {
      server.close();
    } catch (_) {
      /* noop */
    }
    server = null;
  }
  if (process.platform !== "darwin") app.quit();
});
