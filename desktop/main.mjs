import { app, BrowserWindow, shell } from "electron";
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
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
