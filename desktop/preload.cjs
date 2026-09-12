const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("damiDesktop", {
  getDock: () => ipcRenderer.invoke("dami:get-dock"),
  getDesktopSettings: () => ipcRenderer.invoke("dami:get-desktop-settings"),
  setDock: (dock) => ipcRenderer.invoke("dami:set-dock", dock),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke("dami:set-launch-at-startup", enabled),
  setWakeWordEnabled: (enabled) => ipcRenderer.invoke("dami:set-wake-word-enabled", enabled),
  setFloatingAvatarEnabled: (enabled) => ipcRenderer.invoke("dami:set-floating-avatar-enabled", enabled),
  show: () => ipcRenderer.invoke("dami:show"),
  hide: () => ipcRenderer.invoke("dami:hide"),
  getWakeStatus: () => ipcRenderer.invoke("dami:get-wake-status"),
  localTranscribe: () => ipcRenderer.invoke("dami:local-transcribe"),
  localSpeak: (text) => ipcRenderer.invoke("dami:local-speak", text),
  stopLocalSpeech: () => ipcRenderer.invoke("dami:stop-local-speech"),
  onWakeWord: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("dami:wake-word", listener);
    return () => ipcRenderer.removeListener("dami:wake-word", listener);
  },
  onWakeStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("dami:wake-status", listener);
    return () => ipcRenderer.removeListener("dami:wake-status", listener);
  },
  isDesktop: true,
});
