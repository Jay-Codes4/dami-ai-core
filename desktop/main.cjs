const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const WINDOW_WIDTH = 280;
const WINDOW_HEIGHT = 330;
const EDGE_GAP = 18;

let win = null;

function settingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function readSettings() {
  try {
    return {
      dock: "bottom",
      launchAtStartup: true,
      ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")),
    };
  } catch {
    return { dock: "bottom", launchAtStartup: true };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function dockWindow(position) {
  if (!win) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const left = x + width - WINDOW_WIDTH - EDGE_GAP;
  const top = position === "top" ? y + EDGE_GAP : y + height - WINDOW_HEIGHT - EDGE_GAP;
  win.setBounds({ x: left, y: top, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, true);
}

function syncLoginItem(settings) {
  if (process.platform === "win32" || process.platform === "darwin") {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup !== false });
  }
}

function createWindow() {
  const settings = readSettings();
  syncLoginItem(settings);

  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: 420,
    maxHeight: 620,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devUrl = "http://localhost:3000/companion?desktop=1";
  const base = process.env.DAMI_DESKTOP_URL;
  const target = base ? `${base.replace(/\/$/, "")}/companion?desktop=1` : devUrl;
  void win.loadURL(target);
  dockWindow(settings.dock);

  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  ipcMain.handle("dami:get-dock", () => readSettings().dock);
  ipcMain.handle("dami:set-dock", (_event, dock) => {
    if (dock !== "top" && dock !== "bottom") throw new Error("Invalid dock position");
    writeSettings({ ...readSettings(), dock });
    dockWindow(dock);
    return dock;
  });
  ipcMain.handle("dami:set-launch-at-startup", (_event, enabled) => {
    const settings = { ...readSettings(), launchAtStartup: Boolean(enabled) };
    writeSettings(settings);
    syncLoginItem(settings);
    return settings.launchAtStartup;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
