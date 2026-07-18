const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

let firstVidServer;
let mainWindow;

function configureLocalDataPaths() {
  const userData = app.getPath('userData');
  process.env.FIRSTVID_DATA_DIR = userData;
  process.env.FIRSTVID_ENV_FILE = path.join(userData, '.env');
  process.env.PORT = '0';
}

async function createWindow() {
  configureLocalDataPaths();
  const { startServer } = require('../server');
  firstVidServer = await startServer(0);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'FirstVid',
    backgroundColor: '#fff9f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(firstVidServer.url);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (firstVidServer && firstVidServer.server) {
    firstVidServer.server.close();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      app.quit();
    });
  }
});
