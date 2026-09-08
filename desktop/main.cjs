const { app, BrowserWindow, ipcMain, screen, shell, session, Tray, Menu } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const WINDOW_WIDTH = 280;
const WINDOW_HEIGHT = 330;
const EDGE_GAP = 18;
const DEFAULT_WEB_URL = "https://dami-ai-core.vercel.app";
let win = null;
let tray = null;
let wakeProcess = null;
let isQuitting = false;

function settingsPath() { return path.join(app.getPath("userData"), "desktop-settings.json"); }
function readSettings() {
  try { return { dock: "bottom", launchAtStartup: true, wakeWordEnabled: true, webUrl: DEFAULT_WEB_URL, ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) }; }
  catch { return { dock: "bottom", launchAtStartup: true, wakeWordEnabled: true, webUrl: DEFAULT_WEB_URL }; }
}
function writeSettings(settings) { fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8"); }
function dockWindow(position) {
  if (!win) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  win.setBounds({ x: x + width - WINDOW_WIDTH - EDGE_GAP, y: position === "top" ? y + EDGE_GAP : y + height - WINDOW_HEIGHT - EDGE_GAP, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, true);
}
function syncLoginItem(settings) { if (process.platform === "win32" || process.platform === "darwin") app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup !== false }); }
function isTrustedAppUrl(rawUrl) {
  try { const url = new URL(rawUrl); if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true; return url.origin === new URL(readSettings().webUrl || DEFAULT_WEB_URL).origin; }
  catch { return false; }
}
function configurePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission, origin) => permission === "media" && isTrustedAppUrl(origin));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => callback(permission === "media" && isTrustedAppUrl(details?.requestingUrl || wc.getURL())));
}

function stopWakeListener() {
  if (!wakeProcess) return;
  try { wakeProcess.kill(); } catch {}
  wakeProcess = null;
}

function startWakeListener() {
  stopWakeListener();
  if (process.platform !== "win32" || readSettings().wakeWordEnabled === false) return;
  // Windows System.Speech listens only for the tiny grammar below; no API key or Sahara credits are used.
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine",
    "$choices = New-Object System.Speech.Recognition.Choices",
    "$choices.Add('hey dami'); $choices.Add('hey dummy'); $choices.Add('hey demi')",
    "$gb = New-Object System.Speech.Recognition.GrammarBuilder($choices)",
    "$g = New-Object System.Speech.Recognition.Grammar($gb)",
    "$r.LoadGrammar($g); $r.SetInputToDefaultAudioDevice()",
    "Register-ObjectEvent $r SpeechRecognized -Action { if ($Event.SourceEventArgs.Result.Confidence -ge 0.55) { [Console]::Out.WriteLine('DAMI_WAKE'); [Console]::Out.Flush() } } | Out-Null",
    "$r.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)",
    "while ($true) { Start-Sleep -Milliseconds 500 }"
  ].join("; ");
  wakeProcess = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
  let buffer = "";
  wakeProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const line of lines) if (line.trim() === "DAMI_WAKE") {
      win?.show();
      win?.webContents.send("dami:wake-word");
    }
  });
  wakeProcess.on("error", (error) => console.error("Native wake listener unavailable", error.message));
  wakeProcess.on("exit", () => { wakeProcess = null; });
}

async function createTray() {
  if (tray) return;
  try {
    tray = new Tray(await app.getFileIcon(process.execPath, { size: "small" })); tray.setToolTip("Dami");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show Dami", click: () => { win?.show(); win?.focus(); } }, { label: "Hide Dami", click: () => win?.hide() }, { type: "separator" },
      { label: "Quit Dami", click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on("click", () => { if (!win) return; if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } });
  } catch (error) { console.error("Could not create Dami tray icon", error); }
}

function createWindow() {
  const settings = readSettings(); syncLoginItem(settings);
  win = new BrowserWindow({ width: WINDOW_WIDTH, height: WINDOW_HEIGHT, minWidth: WINDOW_WIDTH, minHeight: WINDOW_HEIGHT, maxWidth: 420, maxHeight: 620, frame: false, transparent: true, alwaysOnTop: true, resizable: true, hasShadow: false, show: false, skipTaskbar: true, backgroundColor: "#00000000", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setAlwaysOnTop(true, "floating"); if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const base = app.isPackaged ? (process.env.DAMI_DESKTOP_URL || settings.webUrl || DEFAULT_WEB_URL) : (process.env.DAMI_DESKTOP_URL || "http://localhost:3000");
  void win.loadURL(`${base.replace(/\/$/, "")}/companion?desktop=1`); dockWindow(settings.dock);
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (event, url) => { if (!isTrustedAppUrl(url)) event.preventDefault(); });
  win.once("ready-to-show", () => win?.show());
  win.on("close", (event) => { if (!isQuitting) { event.preventDefault(); win?.hide(); } });
  win.on("closed", () => { win = null; });
}

app.whenReady().then(async () => {
  configurePermissions();
  ipcMain.handle("dami:get-dock", () => readSettings().dock);
  ipcMain.handle("dami:set-dock", (_e, dock) => { if (!["top","bottom"].includes(dock)) throw new Error("Invalid dock position"); writeSettings({ ...readSettings(), dock }); dockWindow(dock); return dock; });
  ipcMain.handle("dami:set-launch-at-startup", (_e, enabled) => { const settings = { ...readSettings(), launchAtStartup: Boolean(enabled) }; writeSettings(settings); syncLoginItem(settings); return settings.launchAtStartup; });
  ipcMain.handle("dami:show", () => { win?.show(); win?.focus(); return true; }); ipcMain.handle("dami:hide", () => { win?.hide(); return true; });
  createWindow(); await createTray(); startWakeListener();
  app.on("activate", () => { if (!win) createWindow(); else { win.show(); win.focus(); } });
});
app.on("before-quit", () => { isQuitting = true; stopWakeListener(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin" && isQuitting) app.quit(); });
