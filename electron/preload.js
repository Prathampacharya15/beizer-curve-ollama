const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ai", {
  generateCurve: (prompt, context) =>
    ipcRenderer.invoke("ai:generate-curve", prompt, context),
});
