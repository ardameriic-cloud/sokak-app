import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  systemPreferences,
  Tray,
  Menu,
  nativeImage,
  NativeImage,
  MenuItemConstructorOptions,
  session,
} from 'electron';
import path from 'path';
import fs from 'fs';

interface PersistedDesktopConfig {
  disableHardwareAcceleration: boolean;
}

const configPath = path.join(app.getPath('userData'), 'sokak-desktop-config.json');

function readDesktopConfig(): PersistedDesktopConfig {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Fallback to default
  }
  return { disableHardwareAcceleration: false };
}

function writeDesktopConfig(cfg: PersistedDesktopConfig): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save desktop config:', err);
  }
}

const initialConfig = readDesktopConfig();
if (initialConfig.disableHardwareAcceleration) {
  console.log('⚡ [Oyun Modu] Donanım hızlandırma kullanıcı tercihiyle kapatıldı.');
  app.disableHardwareAcceleration();
}

app.setName('SOKAK');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.sokak.desktop');
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let isOverlayVisible = false;
let latestOverlayPayload: unknown = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentSelectedSourceId: string | null = null;
let gameDetectIntervalId: NodeJS.Timeout | null = null;
let lastDetectedGame: string | null = null;

const KNOWN_GAMES: Array<{ keywords: string[]; display: string }> = [
  { keywords: ['valorant'], display: 'Valorant' },
  { keywords: ['counter-strike 2', 'cs2'], display: 'Counter-Strike 2' },
  { keywords: ['ea sports fc', 'fc 24', 'fc 25'], display: 'EA SPORTS FC' },
  { keywords: ['league of legends'], display: 'League of Legends' },
  { keywords: ['fortnite'], display: 'Fortnite' },
];

function setupApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'SOKAK',
      submenu: [
        { role: 'about', label: 'SOKAK Hakkında' },
        { type: 'separator' },
        { role: 'hide', label: "SOKAK'ı Gizle" },
        { role: 'hideOthers', label: 'Diğerlerini Gizle' },
        { type: 'separator' },
        {
          label: "SOKAK'tan Çık",
          accelerator: 'Command+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        { role: 'undo', label: 'Geri Al' },
        { role: 'redo', label: 'Yinele' },
        { type: 'separator' },
        { role: 'cut', label: 'Kes' },
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'selectAll', label: 'Tümünü Seç' },
      ],
    },
    {
      label: 'Pencere',
      submenu: [
        { role: 'minimize', label: 'Küçült' },
        { role: 'zoom', label: 'Yakınlaştır' },
        { role: 'togglefullscreen', label: 'Tam Ekran' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({
    applicationName: 'SOKAK',
    applicationVersion: app.getVersion(),
    copyright: '© SOKAK — Ekip içi anlık sesli ve yazılı iletişim',
  });
}

function createTrayIcon(): NativeImage {
  const base64Png =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABMSURBVDhPY2RgYPgPxFQBjAwMDP8p4dHBAJphYGBgYBj1ABYwMDAw/MfAwMBoAExD0QyjBoA0g20AqgF4A5gYGBj+U2I4AwMDAA5bE8H6S8u+AAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${base64Png}`);
}

function toggleOverlayWindow(forceState?: boolean): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  const next = typeof forceState === 'boolean' ? forceState : !isOverlayVisible;
  isOverlayVisible = next;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (isOverlayVisible) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      if (latestOverlayPayload) {
        overlayWindow.webContents.send('overlay:state-updated', latestOverlayPayload);
      }
    } else {
      overlayWindow.hide();
    }
  }

  mainWindow?.webContents.send('overlay:visibility-changed', isOverlayVisible);
  return isOverlayVisible;
}

function setupSystemTray() {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setToolTip('SOKAK — Ekip içi anlık sesli ve yazılı iletişim');

  const updateTrayMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'SOKAK Aç',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: '🎯 Oyun İçi Arayüz (Overlay) Aç/Kapat (Ctrl+Shift+O)',
        click: () => {
          toggleOverlayWindow();
        },
      },
      { type: 'separator' },
      {
        label: 'Mikrofon Sustur / Aç (Ctrl+Shift+M)',
        click: () => {
          mainWindow?.webContents.send('shortcut:toggle-mute');
        },
      },
      {
        label: 'Kulaklık Sağırlaştır (Ctrl+Shift+D)',
        click: () => {
          mainWindow?.webContents.send('shortcut:toggle-deafen');
        },
      },
      { type: 'separator' },
      {
        label: 'SOKAK Tamamen Kapat',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

async function requestMacMediaPermissions() {
  if (process.platform === 'darwin') {
    try {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      if (micStatus !== 'granted') {
        await systemPreferences.askForMediaAccess('microphone');
      }
    } catch (err) {
      console.warn('macOS media permission check warning:', err);
    }
  }
}

function startLightweightGameDetection() {
  if (gameDetectIntervalId) {
    clearInterval(gameDetectIntervalId);
  }

  const checkOpenWindowTitles = async () => {
    if (!mainWindow || isQuitting) return;
    try {
      const windows = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });

      let foundGame: string | null = null;
      for (const win of windows) {
        const lowerTitle = (win.name || '').toLowerCase();
        if (lowerTitle.includes('sokak')) continue;

        for (const game of KNOWN_GAMES) {
          if (game.keywords.some((kw) => lowerTitle.includes(kw))) {
            foundGame = game.display;
            break;
          }
        }
        if (foundGame) break;
      }

      if (foundGame !== lastDetectedGame) {
        lastDetectedGame = foundGame;
        mainWindow.webContents.send('game:detected', foundGame);
      }
    } catch {
      // Ignore permission or enumeration warnings
    }
  };

  gameDetectIntervalId = setInterval(checkOpenWindowTitles, 5000);
}

// Click-Through In-Game Mini Voice Overlay / HUD Window
function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  overlayWindow = new BrowserWindow({
    title: 'SOKAK HUD',
    x: 20,
    y: 44,
    width: 280,
    height: 360,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Fare tıklamaları doğrudan tam ekran oyuna geçer (Click-Through Protection)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const devUrl =
    process.env.VITE_DEV_SERVER_URL ||
    (!app.isPackaged ? 'http://localhost:5173' : undefined);
  if (devUrl) {
    overlayWindow.webContents.session
      .clearCache()
      .finally(() => {
        overlayWindow?.loadURL(`${devUrl}?overlay=1`);
      });
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { overlay: '1' },
    });
  }

  overlayWindow.webContents.on('did-finish-load', () => {
    if (latestOverlayPayload && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:state-updated', latestOverlayPayload);
    }
  });
}

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    title: 'SOKAK',
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#07080C',
    frame: isMac ? true : false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 14, y: 13 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const chosen =
          sources.find((s) => s.id === currentSelectedSourceId) || sources[0];
        if (chosen) {
          callback({ video: chosen, audio: 'loopback' });
        } else {
          callback({});
        }
      })
      .catch(() => callback({}));
  });

  const devUrl =
    process.env.VITE_DEV_SERVER_URL ||
    (!app.isPackaged ? 'http://localhost:5173' : undefined);

  mainWindow.webContents.session
    .clearCache()
    .finally(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (devUrl) {
        mainWindow.loadURL(devUrl);
      } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      }
    });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: false,
      isMinimized: mainWindow?.isMinimized() ?? false,
    });
  });

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: true,
      isMinimized: false,
    });
  });

  mainWindow.on('minimize', () => {
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: false,
      isMinimized: true,
    });
  });

  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: true,
      isMinimized: false,
    });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      mainWindow?.webContents.send('window:visibility-state', {
        isFocused: false,
        isMinimized: true,
      });
    }
  });
}

function registerGlobalHardwareShortcuts() {
  globalShortcut.unregisterAll();

  globalShortcut.register('CommandOrControl+Shift+M', () => {
    mainWindow?.webContents.send('shortcut:toggle-mute');
  });

  globalShortcut.register('CommandOrControl+Shift+D', () => {
    mainWindow?.webContents.send('shortcut:toggle-deafen');
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    toggleOverlayWindow();
  });
}

app.whenReady().then(async () => {
  await requestMacMediaPermissions();
  setupApplicationMenu();
  setupSystemTray();
  createMainWindow();
  createOverlayWindow();
  registerGlobalHardwareShortcuts();
  startLightweightGameDetection();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createOverlayWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (gameDetectIntervalId) {
    clearInterval(gameDetectIntervalId);
  }
});

// IPC Handlers
ipcMain.handle('window:get-platform', () => {
  return {
    platform: process.platform,
    disableHardwareAcceleration: initialConfig.disableHardwareAcceleration,
    isOverlayVisible,
  };
});

ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close-to-tray', () => {
  mainWindow?.hide();
  mainWindow?.webContents.send('window:visibility-state', {
    isFocused: false,
    isMinimized: true,
  });
});

ipcMain.handle('overlay:toggle', (_event, forceState?: boolean) => {
  const visible = toggleOverlayWindow(forceState);
  return { visible };
});

ipcMain.on('overlay:sync-state', (_event, payload: unknown) => {
  latestOverlayPayload = payload;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:state-updated', payload);
  }
});

ipcMain.handle('desktop:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 420, height: 236 },
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      isScreen: source.id.startsWith('screen:'),
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      appIconDataUrl: source.appIcon ? source.appIcon.toDataURL() : null,
    }));
  } catch (err) {
    console.error('Error fetching desktopCapturer sources:', err);
    return [];
  }
});

ipcMain.handle('desktop:select-source', (_event, sourceId: string) => {
  currentSelectedSourceId = sourceId;
  return { ok: true, sourceId };
});

ipcMain.handle('gaming-mode:set-hw-accel', (_event, disableHwAccel: boolean) => {
  writeDesktopConfig({ disableHardwareAcceleration: disableHwAccel });
  return {
    saved: true,
    disableHardwareAcceleration: disableHwAccel,
  };
});

ipcMain.handle('gaming-mode:relaunch', () => {
  isQuitting = true;
  app.relaunch();
  app.exit(0);
});
