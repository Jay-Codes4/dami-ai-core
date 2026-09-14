const { app, BrowserWindow, ipcMain, screen, shell, session, Tray, Menu } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { parseWakeUtterance } = require("./wake.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const WINDOW_WIDTH = 236,
  WINDOW_HEIGHT = 238,
  RESULT_WIDTH = 620,
  RESULT_HEIGHT = 760,
  EDGE_GAP = 14;
const DEFAULT_WEB_URL = "https://dami-ai-core.vercel.app";
let win = null,
  tray = null,
  wakeProcess = null,
  localSpeechProcess = null,
  desktopWatchProcess = null,
  wakeResumeTimer = null,
  wakeStatus = "starting",
  isQuitting = false,
  isDesktopForeground = true,
  isVoiceTurnActive = false,
  isResultPanelOpen = false,
  rendererVoiceReady = false,
  pendingActivation = null,
  activationSequence = 0;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function diagnosticsPath() {
  return path.join(app.getPath("userData"), "dami-desktop.log");
}
function logDesktop(event, details = {}) {
  try {
    fs.appendFileSync(
      diagnosticsPath(),
      `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`,
      "utf8",
    );
  } catch {}
}
function settingsPath() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}
function readSettings() {
  try {
    return {
      dock: "bottom",
      launchAtStartup: true,
      wakeWordEnabled: true,
      floatingAvatarEnabled: true,
      webUrl: DEFAULT_WEB_URL,
      ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")),
    };
  } catch {
    return {
      dock: "bottom",
      launchAtStartup: true,
      wakeWordEnabled: true,
      floatingAvatarEnabled: true,
      webUrl: DEFAULT_WEB_URL,
    };
  }
}
function writeSettings(s) {
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), "utf8");
}
function dockWindow(position) {
  if (!win) return;
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    { x, y, width: workWidth, height: workHeight } = d.workArea,
    width = Math.min(isResultPanelOpen ? RESULT_WIDTH : WINDOW_WIDTH, workWidth - EDGE_GAP * 2),
    height = Math.min(isResultPanelOpen ? RESULT_HEIGHT : WINDOW_HEIGHT, workHeight - EDGE_GAP * 2);
  win.setBounds(
    {
      x: x + workWidth - width - EDGE_GAP,
      y: position === "top" ? y + EDGE_GAP : y + workHeight - height - EDGE_GAP,
      width,
      height,
    },
    true,
  );
}
function setResultPanelOpen(value) {
  isResultPanelOpen = Boolean(value);
  if (!win || win.isDestroyed()) return;
  dockWindow(readSettings().dock);
  logDesktop("result-panel", { open: isResultPanelOpen });
}
function syncLoginItem(s) {
  if (process.platform === "win32" || process.platform === "darwin")
    app.setLoginItemSettings({ openAtLogin: s.launchAtStartup !== false });
}
function isTrustedAppUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return u.origin === new URL(readSettings().webUrl || DEFAULT_WEB_URL).origin;
  } catch {
    return false;
  }
}
function configurePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_w, p, o) => p === "media" && isTrustedAppUrl(o));
  ses.setPermissionRequestHandler((w, p, cb, d) =>
    cb(p === "media" && isTrustedAppUrl(d?.requestingUrl || w.getURL())),
  );
}
function setWakeStatus(s) {
  wakeStatus = s;
  if (win && !win.isDestroyed()) win.webContents.send("dami:wake-status", s);
}
function sendPendingActivation() {
  if (!rendererVoiceReady || !pendingActivation || !win || win.isDestroyed()) return;
  win.webContents.send(pendingActivation.channel, pendingActivation.payload);
  logDesktop("activation-dispatched", {
    id: pendingActivation.payload.activationId,
    source: pendingActivation.payload.source,
  });
}
function queueActivation(channel, payload = {}) {
  const activationId = `${Date.now()}-${++activationSequence}`;
  pendingActivation = {
    channel,
    payload: { ...payload, activationId },
  };
  sendPendingActivation();
  return activationId;
}
function acknowledgeActivation(activationId) {
  if (!pendingActivation || pendingActivation.payload.activationId !== activationId) return;
  logDesktop("activation-acknowledged", {
    id: activationId,
    source: pendingActivation.payload.source,
  });
  pendingActivation = null;
}
function stopWakeListener() {
  if (!wakeProcess) return;
  try {
    wakeProcess.kill();
  } catch {}
  wakeProcess = null;
}
function beginVoiceTurn(source = "renderer") {
  setResultPanelOpen(false);
  if (isVoiceTurnActive) {
    logDesktop("voice-turn-already-active", { source, wakeStatus });
    return;
  }
  logDesktop("voice-turn-begin", { source, wakeStatus });
  isVoiceTurnActive = true;
  if (wakeResumeTimer) clearTimeout(wakeResumeTimer);
  stopWakeListener();
  setWakeStatus("listening-local");
  if (win && !win.isDestroyed()) win.showInactive();
  // Safety recovery if the renderer closes or a provider request stalls.
  wakeResumeTimer = setTimeout(() => endVoiceTurn(), 45000);
}
function endVoiceTurn() {
  logDesktop("voice-turn-end", { wakeStatus });
  isVoiceTurnActive = false;
  pendingActivation = null;
  if (wakeResumeTimer) clearTimeout(wakeResumeTimer);
  wakeResumeTimer = null;
  if (!isQuitting && readSettings().wakeWordEnabled !== false) startWakeListener();
}
function stopLocalSpeech() {
  if (!localSpeechProcess) return;
  try {
    localSpeechProcess.kill();
  } catch {}
  localSpeechProcess = null;
}
function stopDesktopWatcher() {
  if (!desktopWatchProcess) return;
  try {
    desktopWatchProcess.kill();
  } catch {}
  desktopWatchProcess = null;
}
function setDesktopForeground(value) {
  isDesktopForeground = Boolean(value);
  if (!win || win.isDestroyed()) return;
  const enabled = readSettings().floatingAvatarEnabled !== false;
  if ((isDesktopForeground || isVoiceTurnActive) && enabled) {
    win.setAlwaysOnTop(true, "floating");
    if (!win.isVisible()) win.showInactive();
  } else if (win.isVisible()) win.hide();
}
function startDesktopWatcher() {
  stopDesktopWatcher();
  if (process.platform !== "win32") {
    setDesktopForeground(true);
    return;
  }
  const member =
    '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] public static extern int GetClassName(System.IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount); [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);';
  const stateLine =
    "$state=if($cls -eq 'Progman' -or $cls -eq 'WorkerW' -or $cls -eq 'Shell_TrayWnd' -or $fgPid -eq " +
    process.pid +
    "){'DESKTOP'}else{'APP'}";
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -Namespace Dami -Name DesktopProbe -MemberDefinition '" +
      member.replace(/'/g, "''") +
      "'",
    "$last=''",
    "while($true){$h=[Dami.DesktopProbe]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 256;[void][Dami.DesktopProbe]::GetClassName($h,$sb,256);[uint32]$fgPid=0;[void][Dami.DesktopProbe]::GetWindowThreadProcessId($h,[ref]$fgPid);$cls=$sb.ToString();" +
      stateLine +
      ";if($state -ne $last){[Console]::Out.WriteLine('DAMI_DESKTOP:'+$state);[Console]::Out.Flush();$last=$state};Start-Sleep -Milliseconds 350}",
  ].join("; ");
  desktopWatchProcess = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true },
  );
  let buffer = "";
  desktopWatchProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line === "DAMI_DESKTOP:DESKTOP") setDesktopForeground(true);
      else if (line === "DAMI_DESKTOP:APP") setDesktopForeground(false);
    }
  });
  desktopWatchProcess.stderr.on("data", (chunk) =>
    console.error("Desktop watcher stderr", chunk.toString()),
  );
  desktopWatchProcess.on("error", (error) => {
    console.error("Desktop watcher error", error);
    setDesktopForeground(true);
  });
  desktopWatchProcess.on("exit", () => {
    desktopWatchProcess = null;
  });
}
function psRun(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { windowsHide: true },
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      reject(new Error("Local speech timed out"));
    }, timeout);
    p.stdout.on("data", (c) => (out += c.toString()));
    p.stderr.on("data", (c) => (err += c.toString()));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || out.trim() || "Local speech recognition failed"));
    });
  });
}
function yarnGptPaths() {
  const root = path.join(
    process.env.LOCALAPPDATA || app.getPath("userData"),
    "Dami",
    "voice",
    "yarngpt",
  );
  return {
    root,
    python: path.join(root, ".venv", "Scripts", "python.exe"),
    ready: path.join(root, "READY"),
    worker: voiceResource("yarngpt_speak.py"),
  };
}
function speakWithWindows(text) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Speech",
    "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$voices=$s.GetInstalledVoices() | Where-Object {$_.Enabled}",
    "$preferred=$voices | Where-Object {$_.VoiceInfo.Gender -eq 'Female' -and ($_.VoiceInfo.Culture.Name -eq 'en-NG' -or $_.VoiceInfo.Name -match 'Nigeria|African|Yoruba')} | Select-Object -First 1",
    "if(-not $preferred){$preferred=$voices | Where-Object {$_.VoiceInfo.Gender -eq 'Female' -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en'} | Select-Object -First 1}",
    "if(-not $preferred){$s.Dispose();throw 'No female Windows voice is installed'}",
    "$s.SelectVoice($preferred.VoiceInfo.Name)",
    "$s.Rate=0;$s.Volume=100",
    "$t=[Console]::In.ReadToEnd()",
    "if([string]::IsNullOrWhiteSpace($t)){$s.Dispose();throw 'No speech text was supplied'}",
    "$s.Speak($t)",
    "$s.Dispose()",
  ].join("; ");
  return new Promise((resolve, reject) => {
    localSpeechProcess = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { windowsHide: true },
    );
    let err = "";
    localSpeechProcess.stderr.on("data", (c) => (err += c.toString()));
    localSpeechProcess.on("error", (e) => {
      localSpeechProcess = null;
      reject(e);
    });
    localSpeechProcess.on("exit", (code) => {
      localSpeechProcess = null;
      if (code === 0) resolve(true);
      else reject(new Error(err.trim() || "Windows local voice failed"));
    });
    localSpeechProcess.stdin.end(String(text || ""), "utf8");
  });
}
function speakWithYarnGpt(text) {
  const y = yarnGptPaths();
  if (!fs.existsSync(y.ready) || !fs.existsSync(y.python) || !fs.existsSync(y.worker))
    return Promise.reject(new Error("YarnGPT is not installed"));
  return new Promise((resolve, reject) => {
    let out = "",
      err = "";
    localSpeechProcess = spawn(y.python, [y.worker], { windowsHide: true });
    localSpeechProcess.stdout.on("data", (c) => (out += c.toString()));
    localSpeechProcess.stderr.on("data", (c) => (err += c.toString()));
    localSpeechProcess.on("error", (e) => {
      localSpeechProcess = null;
      reject(e);
    });
    localSpeechProcess.on("exit", (code) => {
      localSpeechProcess = null;
      if (code !== 0) return reject(new Error(err.trim() || "YarnGPT generation failed"));
      const wav = out.trim().split(/\r?\n/).pop();
      if (!wav || !fs.existsSync(wav)) return reject(new Error("YarnGPT did not produce audio"));
      const safe = Buffer.from(wav, "utf8").toString("base64");
      const play =
        "$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
        safe +
        "'));$sp=New-Object System.Media.SoundPlayer $p;$sp.PlaySync();$sp.Dispose()";
      localSpeechProcess = spawn(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          play,
        ],
        { windowsHide: true },
      );
      localSpeechProcess.on("error", (e) => {
        localSpeechProcess = null;
        reject(e);
      });
      localSpeechProcess.on("exit", (playCode) => {
        localSpeechProcess = null;
        if (playCode === 0) resolve(true);
        else reject(new Error("YarnGPT audio playback failed"));
      });
    });
    localSpeechProcess.stdin.end(String(text || ""), "utf8");
  });
}
async function localSpeak(text) {
  if (process.platform !== "win32")
    throw new Error("Local voice fallback currently requires Windows");
  stopLocalSpeech();
  try {
    return await speakWithYarnGpt(text);
  } catch (error) {
    console.warn("YarnGPT unavailable; using Windows voice fallback:", error?.message || error);
    return speakWithWindows(text);
  }
}
async function localTranscribe() {
  if (process.platform !== "win32")
    throw new Error("Local speech fallback currently requires Windows");
  stopWakeListener();
  setWakeStatus("listening-local");
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Speech",
    "$installed=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()",
    "if(-not $installed -or $installed.Count -lt 1){throw 'No Windows speech recognizer is installed'}",
    "$info=$installed | Where-Object {$_.Culture.TwoLetterISOLanguageName -eq 'en'} | Select-Object -First 1",
    "if(-not $info){$info=$installed | Select-Object -First 1}",
    "$r=New-Object System.Speech.Recognition.SpeechRecognitionEngine($info.Id)",
    "$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))",
    "$r.SetInputToDefaultAudioDevice()",
    "$result=$r.Recognize([TimeSpan]::FromSeconds(15))",
    "if($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)){throw 'I did not hear a clear question'}",
    "[Console]::Out.WriteLine('DAMI_TRANSCRIPT:'+$result.Text)",
    "$r.Dispose()",
  ].join("; ");
  try {
    const out = await psRun(script, 19000);
    const line = out.split(/\r?\n/).find((x) => x.startsWith("DAMI_TRANSCRIPT:"));
    if (!line) throw new Error("No local transcript was produced");
    return line.slice(16).trim();
  } finally {
    if (!isQuitting && !isVoiceTurnActive) setTimeout(() => startWakeListener(), 350);
  }
}
function voiceResource(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "voice", name)
    : path.join(__dirname, "voice", name);
}
function startWakeListener() {
  stopWakeListener();
  if (process.platform !== "win32") {
    setWakeStatus("unsupported");
    return;
  }
  if (readSettings().wakeWordEnabled === false) {
    setWakeStatus("disabled");
    return;
  }
  if (isVoiceTurnActive) {
    setWakeStatus("listening-local");
    return;
  }
  setWakeStatus("starting");
  logDesktop("wake-starting");
  const scriptPath = voiceResource("wake-listener.ps1");
  wakeProcess = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { windowsHide: true },
  );
  let b = "";
  wakeProcess.stdout.on("data", (c) => {
    b += c.toString();
    const lines = b.split(/\r?\n/);
    b = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line === "DAMI_READY") {
        setWakeStatus("ready");
        logDesktop("wake-ready");
      } else if (line.startsWith("DAMI_WAKE:")) {
        const parts = line.split(":");
        let heard = "";
        try {
          heard = Buffer.from(parts[1] || "", "base64")
            .toString("utf8")
            .trim();
        } catch {}
        const wake = parseWakeUtterance(heard);
        if (!wake) continue;
        const command = wake.command;
        const audioBase64 = command ? parts[2] || "" : "";
        logDesktop("wake-recognized", {
          hasCommand: Boolean(command),
          hasAudio: Boolean(audioBase64),
        });
        beginVoiceTurn("wake-word");
        shell.beep();
        win?.showInactive();
        queueActivation("dami:wake-word", { source: "wake-word", command, audioBase64 });
      } else if (line.startsWith("DAMI_ERROR:")) {
        console.error(line);
        logDesktop("wake-error", { message: line.slice(11) });
        setWakeStatus("error");
      }
    }
  });
  wakeProcess.stderr.on("data", (c) => {
    const message = c.toString().trim().slice(0, 1000);
    console.error("Wake listener stderr", message);
    if (message) logDesktop("wake-stderr", { message });
  });
  wakeProcess.on("error", (e) => {
    console.error(e);
    logDesktop("wake-process-error", { message: e?.message || String(e) });
    setWakeStatus("error");
  });
  wakeProcess.on("exit", (code) => {
    wakeProcess = null;
    logDesktop("wake-exit", { code, wakeStatus });
    if (
      !isQuitting &&
      !String(wakeStatus).startsWith("listening") &&
      wakeStatus !== "error" &&
      wakeStatus !== "disabled"
    )
      setWakeStatus(code === 0 ? "stopped" : "error");
  });
}
async function createTray() {
  if (tray) return;
  try {
    tray = new Tray(await app.getFileIcon(process.execPath, { size: "small" }));
    tray.setToolTip("Dami");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Talk with Dami",
          click: () => {
            beginVoiceTurn("tray");
            win?.showInactive();
            queueActivation("dami:talk-request", { source: "tray" });
          },
        },
        {
          label:
            readSettings().wakeWordEnabled === false ? 'Enable "Hey Dami"' : 'Pause "Hey Dami"',
          click: () => {
            const current = readSettings();
            const enabled = current.wakeWordEnabled === false;
            writeSettings({ ...current, wakeWordEnabled: enabled });
            if (enabled) startWakeListener();
            else {
              stopWakeListener();
              setWakeStatus("disabled");
            }
            tray?.destroy();
            tray = null;
            void createTray();
          },
        },
        { type: "separator" },
        {
          label: "Open Dami diagnostics",
          click: () => {
            const file = diagnosticsPath();
            if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf8");
            shell.showItemInFolder(file);
          },
        },
        {
          label: "Show Dami on desktop",
          click: () => {
            if (isDesktopForeground) win?.showInactive();
          },
        },
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
      else if (isDesktopForeground) win.showInactive();
    });
  } catch (e) {
    console.error("Could not create tray", e);
  }
}
function createWindow() {
  const s = readSettings();
  syncLoginItem(s);
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: RESULT_WIDTH,
    maxHeight: RESULT_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  const base = app.isPackaged
    ? process.env.DAMI_DESKTOP_URL || s.webUrl || DEFAULT_WEB_URL
    : process.env.DAMI_DESKTOP_URL || "http://localhost:3000";
  void win.loadURL(`${base.replace(/\/$/, "")}/companion?desktop=1`);
  win.webContents.on("did-start-loading", () => {
    rendererVoiceReady = false;
    setResultPanelOpen(false);
  });
  win.webContents.on("did-finish-load", () => {
    logDesktop("renderer-loaded", { url: win?.webContents.getURL() });
    setWakeStatus(wakeStatus);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) =>
    logDesktop("renderer-load-failed", { code, description, url }),
  );
  win.webContents.on("render-process-gone", (_event, details) => {
    rendererVoiceReady = false;
    logDesktop("renderer-process-gone", details);
  });
  dockWindow(s.dock);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isTrustedAppUrl(url)) e.preventDefault();
  });
  win.once("ready-to-show", () => {
    if (isDesktopForeground && readSettings().floatingAvatarEnabled !== false) win?.showInactive();
    setWakeStatus(wakeStatus);
  });
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => (win = null));
}
if (hasSingleInstanceLock)
  app.on("second-instance", () => {
    logDesktop("second-instance-blocked");
    if (!win || win.isDestroyed()) return;
    win.webContents.reloadIgnoringCache();
    win.showInactive();
  });

if (hasSingleInstanceLock)
  app.whenReady().then(async () => {
    configurePermissions();
    ipcMain.handle("dami:get-dock", () => readSettings().dock);
    ipcMain.handle("dami:set-dock", (_e, d) => {
      if (!["top", "bottom"].includes(d)) throw new Error("Invalid dock position");
      writeSettings({ ...readSettings(), dock: d });
      dockWindow(d);
      return d;
    });
    ipcMain.handle("dami:set-launch-at-startup", (_e, v) => {
      const s = { ...readSettings(), launchAtStartup: Boolean(v) };
      writeSettings(s);
      syncLoginItem(s);
      return s.launchAtStartup;
    });
    ipcMain.handle("dami:set-wake-word-enabled", (_e, v) => {
      const s = { ...readSettings(), wakeWordEnabled: Boolean(v) };
      writeSettings(s);
      if (s.wakeWordEnabled) startWakeListener();
      else {
        stopWakeListener();
        setWakeStatus("disabled");
      }
      return s.wakeWordEnabled;
    });
    ipcMain.handle("dami:set-floating-avatar-enabled", (_e, v) => {
      const s = { ...readSettings(), floatingAvatarEnabled: Boolean(v) };
      writeSettings(s);
      if (s.floatingAvatarEnabled && isDesktopForeground) win?.showInactive();
      else win?.hide();
      return s.floatingAvatarEnabled;
    });
    ipcMain.handle("dami:get-desktop-settings", () => {
      const s = readSettings();
      return {
        desktopDock: s.dock,
        wakeWordEnabled: s.wakeWordEnabled !== false,
        floatingAvatarEnabled: s.floatingAvatarEnabled !== false,
        launchAtStartup: s.launchAtStartup !== false,
      };
    });
    ipcMain.handle("dami:get-wake-status", () => wakeStatus);
    ipcMain.handle("dami:renderer-ready", () => {
      rendererVoiceReady = true;
      logDesktop("renderer-voice-ready", { hasPendingActivation: Boolean(pendingActivation) });
      setWakeStatus(wakeStatus);
      sendPendingActivation();
      return true;
    });
    ipcMain.handle("dami:begin-voice-turn", (_event, activationId) => {
      if (activationId) acknowledgeActivation(String(activationId));
      beginVoiceTurn(activationId ? "activation" : "renderer");
      return true;
    });
    ipcMain.handle("dami:voice-stage", (_event, stage, error) => {
      logDesktop("renderer-stage", { stage: String(stage || ""), error: String(error || "") });
      return true;
    });
    ipcMain.handle("dami:set-result-panel-open", (_event, value) => {
      setResultPanelOpen(Boolean(value));
      return isResultPanelOpen;
    });
    ipcMain.handle("dami:end-voice-turn", () => {
      endVoiceTurn();
      return true;
    });
    ipcMain.handle("dami:local-transcribe", () => localTranscribe());
    ipcMain.handle("dami:local-speak", (_e, text) => localSpeak(text));
    ipcMain.handle("dami:stop-local-speech", () => {
      stopLocalSpeech();
      return true;
    });
    ipcMain.handle("dami:show", () => {
      if (isDesktopForeground && readSettings().floatingAvatarEnabled !== false)
        win?.showInactive();
      return isDesktopForeground && readSettings().floatingAvatarEnabled !== false;
    });
    ipcMain.handle("dami:hide", () => {
      win?.hide();
      return true;
    });
    createWindow();
    await createTray();
    startDesktopWatcher();
    startWakeListener();
  });
app.on("before-quit", () => {
  isQuitting = true;
  stopWakeListener();
  stopLocalSpeech();
  stopDesktopWatcher();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) app.quit();
});
