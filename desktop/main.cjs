const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 720;
const EDGE_GAP = 16;

let win = null;

function settingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function readSettings() {
  try {
    return { dock: "top", ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) };
  } catch {
    return { dock: "top" };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function dockWindow(position) {
  if (!win) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const left = Math.round(x + (width - WINDOW_WIDTH) / 2);
  const top = position === "bottom" ? y + height - WINDOW_HEIGHT - EDGE_GAP : y + EDGE_GAP;
  win.setBounds({ x: left, y: top, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, true);
}

function createWindow() {
  const settings = readSettings();
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 360,
    minHeight: 520,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devUrl = "http://localhost:3000/ask?desktop=1";
  const target = process.env.DAMI_DESKTOP_URL || devUrl;
  void win.loadURL(target);
  dockWindow(settings.dock);

  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle("dami:get-dock", () => readSettings().dock);
  ipcMain.handle("dami:set-dock", (_event, dock) => {
    if (dock !== "top" && dock !== "bottom") throw new Error("Invalid dock position");
    writeSettings({ ...readSettings(), dock });
    dockWindow(dock);
    return dock;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
