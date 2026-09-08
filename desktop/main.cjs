const { app, BrowserWindow, ipcMain, screen, shell, session, Tray, Menu } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const WINDOW_WIDTH = 280;
const WINDOW_HEIGHT = 330;
const EDGE_GAP = 18;
const DEFAULT_WEB_URL = "https://dami-ai-core.vercel.app";

let win = null;
let tray = null;
let isQuitting = false;

function settingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function readSettings() {
  try {
    return {
      dock: "bottom",
      launchAtStartup: true,
      webUrl: DEFAULT_WEB_URL,
      ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")),
    };
  } catch {
    return { dock: "bottom", launchAtStartup: true, webUrl: DEFAULT_WEB_URL };
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

function isTrustedAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    const configured = new URL(readSettings().webUrl || DEFAULT_WEB_URL);
    return url.origin === configured.origin;
  } catch {
    return false;
  }
}

function configurePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission !== "media") return false;
    return isTrustedAppUrl(requestingOrigin);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== "media") return callback(false);
    const requestUrl = details?.requestingUrl || webContents.getURL();
    callback(isTrustedAppUrl(requestUrl));
  });
}

async function createTray() {
  if (tray) return;
  try {
    const icon = await app.getFileIcon(process.execPath, { size: "small" });
    tray = new Tray(icon);
    tray.setToolTip("Dami");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Dami", click: () => { win?.show(); win?.focus(); } },
        { label: "Hide Dami", click: () => win?.hide() },
        { type: "separator" },
        {
          label: "Quit Dami",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => {
      if (!win) return;
      if (win.isVisible()) win.hide();
      else { win.show(); win.focus(); }
    });
  } catch (error) {
    console.error("Could not create Dami tray icon", error);
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
  const configured = process.env.DAMI_DESKTOP_URL || settings.webUrl || DEFAULT_WEB_URL;
  const base = app.isPackaged ? configured : (process.env.DAMI_DESKTOP_URL || "http://localhost:3000");
  const target = `${base.replace(/\/$/, "")}/companion?desktop=1`;
  void win.loadURL(app.isPackaged ? target : devUrl);
  dockWindow(settings.dock);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Dami companion renderer stopped", details.reason);
    if (!isQuitting) windowReloadSoon();
  });

  win.once("ready-to-show", () => win?.show());
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win?.hide();
  });
  win.on("closed", () => { win = null; });
}

function windowReloadSoon() {
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.reload();
  }, 1200);
}

app.whenReady().then(async () => {
  configurePermissions();

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
  ipcMain.handle("dami:show", () => { win?.show(); win?.focus(); return true; });
  ipcMain.handle("dami:hide", () => { win?.hide(); return true; });

  createWindow();
  await createTray();
  app.on("activate", () => {
    if (!win) createWindow();
    else { win.show(); win.focus(); }
  });
});

app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => {
  if (process.platform === "darwin") return;
  if (isQuitting) app.quit();
});
