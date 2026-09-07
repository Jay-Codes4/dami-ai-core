import { contextBridge, ipcRenderer } from "electron";

// Keep the renderer isolated from Electron and Node. Expose only narrow,
// permissioned capabilities owned by the main process.
contextBridge.exposeInMainWorld("damiDesktop", {
  platform: process.platform,
  isDesktop: true,
  openFile: () => ipcRenderer.invoke("dami:open-file"),
  saveFile: (input) => ipcRenderer.invoke("dami:save-file", input),
  writeClipboard: (text) => ipcRenderer.invoke("dami:clipboard-write", text),
  notify: (input) => ipcRenderer.invoke("dami:notify", input),
  openExternal: (url) => ipcRenderer.invoke("dami:open-external", url),
});
