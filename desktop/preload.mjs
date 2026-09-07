import { contextBridge } from "electron";

// Keep the renderer isolated from Electron and Node. Add only narrow,
// permissioned desktop methods here as Dami gains desktop capabilities.
contextBridge.exposeInMainWorld("damiDesktop", {
  platform: process.platform,
  isDesktop: true,
});
