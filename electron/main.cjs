// Electron desktop wrapper. This file is the *only* Node-side glue —
// the actual game in src/** runs the same way it does under
// `python -m http.server 8000`, just loaded via file:// instead of http://.
// Sandboxed, no Node integration in the renderer. Mirrors the
// Rogue-Hero-2 wrapper pattern.

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Single-instance lock — second launches focus the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,                  // hide until ready-to-show to avoid white flash
    backgroundColor: '#0a0606',   // matches PALETTE.bgDeep so the boot frame is on-tone
    title: 'Wall of Dead',
    autoHideMenuBar: true,        // press Alt to reveal if needed
    webPreferences: {
      // The game never touches Node APIs — keep the renderer locked down.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Fullscreen on launch — the game is built for full-screen play.
    mainWindow.setFullScreen(true);
  });

  // External links (e.g., the GitHub issue URL in /help) open in the
  // user's OS browser instead of inside the game window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps stay active until explicitly quit.
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
