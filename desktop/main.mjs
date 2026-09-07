import {
  app,
  BrowserWindow,
  Notification,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const devUrl = process.env.DAMI_DESKTOP_DEV_URL ?? "http://localhost:3000";
const productionUrl = process.env.DAMI_WEB_URL;

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!senderUrl) throw new Error("Unable to verify the desktop request origin.");

  const expected = isDev ? devUrl : productionUrl;
  if (!expected) throw new Error("Dami desktop has no configured trusted web origin.");

  if (new URL(senderUrl).origin !== new URL(expected).origin) {
    throw new Error("Blocked an untrusted desktop request.");
  }
}

function registerDesktopIpc() {
  ipcMain.handle("dami:open-file", async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Legal documents", extensions: ["txt", "md", "json", "csv"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePaths[0]) return null;

    const selectedPath = result.filePaths[0];
    const stats = await fs.stat(selectedPath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error("For safety, Dami currently opens text files up to 10 MB.");
    }

    const content = await fs.readFile(selectedPath, "utf8");
    return { name: path.basename(selectedPath), path: selectedPath, content };
  });

  ipcMain.handle("dami:save-file", async (event, input) => {
    assertTrustedSender(event);
    if (!input || typeof input.content !== "string") throw new Error("Missing file content.");

    const suggestedName =
      typeof input.suggestedName === "string" && input.suggestedName.trim()
        ? input.suggestedName.trim()
        : "dami-research-note.md";

    const result = await dialog.showSaveDialog({
      defaultPath: suggestedName,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Text", extensions: ["txt"] },
        { name: "JSON", extensions: ["json"] },
      ],
    });

    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, input.content, "utf8");
    return { path: result.filePath };
  });

  ipcMain.handle("dami:clipboard-write", (event, text) => {
    assertTrustedSender(event);
    if (typeof text !== "string") throw new Error("Clipboard content must be text.");
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle("dami:notify", (event, input) => {
    assertTrustedSender(event);
    if (!Notification.isSupported()) return false;
    const title = typeof input?.title === "string" ? input.title.slice(0, 120) : "Dami AI";
    const body = typeof input?.body === "string" ? input.body.slice(0, 500) : "";
    new Notification({ title, body }).show();
    return true;
  });

  ipcMain.handle("dami:open-external", async (event, url) => {
    assertTrustedSender(event);
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) {
      throw new Error("Dami only opens secure HTTPS links externally.");
    }
    await shell.openExternal(url);
    return true;
  });
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (!current) return;

    try {
      const currentOrigin = new URL(current).origin;
      const targetOrigin = new URL(url).origin;
      if (currentOrigin !== targetOrigin) {
        event.preventDefault();
        if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => window.show());

  if (isDev) {
    await window.loadURL(devUrl);
    return;
  }

  if (!productionUrl) {
    throw new Error(
      "DAMI_WEB_URL is required for packaged desktop builds until the web bundle is embedded locally.",
    );
  }

  await window.loadURL(productionUrl);
}

app.whenReady().then(async () => {
  registerDesktopIpc();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
