const path = require('path');
const http = require('http');
const {app, ipcMain, BrowserWindow} = require('electron');

const url = process.argv[2] || ('file://' + path.join(__dirname, 'index.html'));

const _requestAppReady = () => new Promise((accept, reject) => {
  app.on('ready', () => {
    accept();
  });
  app.on('error', err => {
    reject(err);
  });
});

_requestAppReady()
  .then(() => {
    ipcMain.on('ipc', (event, e) => {
      const {method} = e;
      switch (method) {
        case 'show': {
          win.show();
          break;
        }
        case 'hide': {
          win.hide();
          break;
        }
      }
    });
    
    const win = new BrowserWindow({
      width: 1280,
      height: 1024,
      show: false,
      backgroundThrottling: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'api.js'),
        // webSecurity: false,
      },
    });
    win.loadURL(url);
    win.webContents.openDevTools({
      mode: 'detach',
    });
    win.webContents.on('crashed', () => {
      process.exit(0);
    });
    win.webContents.on('devtools-closed', () => {
      process.exit(0);
    });
  })
  .catch(err => {
    console.warn(err.stack);
    process.exit(1);
  });