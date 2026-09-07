const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("damiDesktop", {
  getDock: () => ipcRenderer.invoke("dami:get-dock"),
  setDock: (dock) => ipcRenderer.invoke("dami:set-dock", dock),
  isDesktop: true,
});
