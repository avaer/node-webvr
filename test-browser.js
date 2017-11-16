const http = require('http');
const express = require('express');
const electron = require('electron');

const _requestServer = () => new Promise((accept, reject) => {
  const app = express();
  app.use(express.static(__dirname));
  const server = http.createServer(app);
  server.listen(8000, () => {
    accept();
  });
  server.on('error', err => {
    reject(err);
  });
});
const _requestAppReady = () => new Promise((accept, reject) => {
  electron.app.on('ready', () => {
    accept();
  });
  electron.app.on('error', err => {
    reject(err);
  });
});

Promise.all([
  _requestServer(),
  _requestAppReady(),
])
  .then(() => {
    console.log('booted');
    const win = new electron.BrowserWindow({
      width: 1280,
      height: 1024,
      autoHideMenuBar: true,
    });
    win.loadURL('http://127.0.0.1:8000/demo.html');
    win.webContents.openDevTools();
    win.on('closed', () => {
      process.exit(0);
    });
  })
  .catch(err => {
    console.warn(err.stack);
    process.exit(1);
  });