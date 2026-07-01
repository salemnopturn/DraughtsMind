const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('draughtsmind', {
  getBook: () => ipcRenderer.invoke('draughtsmind:book'),

  matches: {
    list:   ()           => ipcRenderer.invoke('draughtsmind:matches:list'),
    get:    (id)         => ipcRenderer.invoke('draughtsmind:matches:get', id),
    create: (data)       => ipcRenderer.invoke('draughtsmind:matches:create', data),
    update: (id, data)   => ipcRenderer.invoke('draughtsmind:matches:update', id, data),
    delete: (id)         => ipcRenderer.invoke('draughtsmind:matches:delete', id),
  }
});
