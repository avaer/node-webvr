const path = require('path');
const http = require('http');
const electron = require('electron');

const url = process.argv[2] || ('file://' + path.join(__dirname, 'demo.html'));

const _requestAppReady = () => new Promise((accept, reject) => {
  electron.app.on('ready', () => {
    accept();
  });
  electron.app.on('error', err => {
    reject(err);
  });
});

_requestAppReady()
  .then(() => {
    const win = new electron.BrowserWindow({
      width: 1280,
      height: 1024,
      show: false,
      backgroundThrottling: false,
      // autoHideMenuBar: true,
      webPreferences: {
        webSecurity: false,
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