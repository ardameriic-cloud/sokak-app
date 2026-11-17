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
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { exec } from 'child_process';

interface PersistedDesktopConfig {
  disableHardwareAcceleration: boolean;
}

export interface UpdaterStatusPayload {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'up-to-date'
    | 'error';
  version?: string;
  progressPercent?: number;
  message?: string;
}

const GITHUB_OWNER = 'ardameriic-cloud';
const GITHUB_REPO = 'sokak-app';

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

// Arka planda ses kesilmesini önlerken GPU/CPU tüketimini sınırla
app.commandLine.appendSwitch('disable-background-media-suspend');
app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '45');

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

// Auto-Updater durumu
let latestUpdaterStatus: UpdaterStatusPayload = {
  state: 'idle',
  version: app.getVersion(),
};
let nativeUpdateDownloaded = false;
let fallbackInstallerPath: string | null = null;
let isCheckingOrDownloadingUpdate = false;

const KNOWN_GAMES: Array<{ keywords: string[]; display: string }> = [
  { keywords: ['valorant'], display: 'Valorant' },
  { keywords: ['counter-strike 2', 'cs2'], display: 'Counter-Strike 2' },
  { keywords: ['ea sports fc', 'fc 24', 'fc 25'], display: 'EA SPORTS FC' },
  { keywords: ['league of legends'], display: 'League of Legends' },
  { keywords: ['fortnite'], display: 'Fortnite' },
];

function broadcastUpdaterStatus(status: UpdaterStatusPayload) {
  latestUpdaterStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

function normalizeSemver(v: string): number[] {
  const clean = String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
  return clean.split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewerVersion(remoteVer: string, currentVer: string): boolean {
  const r = normalizeSemver(remoteVer);
  const c = normalizeSemver(currentVer);
  const len = Math.max(r.length, c.length, 3);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `SOKAK-Desktop/${app.getVersion()}`,
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
  });
}

function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const follow = (targetUrl: string) => {
      https
        .get(
          targetUrl,
          {
            headers: {
              'User-Agent': `SOKAK-Desktop/${app.getVersion()}`,
            },
          },
          (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              follow(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`İndirme başarısız: HTTP ${res.statusCode}`));
              return;
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            const fileStream = fs.createWriteStream(destPath);

            res.on('data', (chunk: Buffer) => {
              receivedBytes += chunk.length;
              if (totalBytes > 0) {
                const pct = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
                onProgress(pct);
              }
            });

            res.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close(() => {
                onProgress(100);
                resolve(destPath);
              });
            });

            fileStream.on('error', (err) => {
              fs.unlink(destPath, () => {});
              reject(err);
            });
          }
        )
        .on('error', reject);
    };

    follow(url);
  });
}

async function checkGitHubReleaseFallback(): Promise<UpdaterStatusPayload> {
  const releases = await fetchJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
  );
  const list = Array.isArray(releases) ? releases : [];
  let highestVersion = app.getVersion();
  let bestRelease: any = null;

  for (const rel of list) {
    if (rel.draft) continue;
    const tag = String(rel.tag_name || '');
    const verMatch = tag.match(/(\d+\.\d+\.\d+)/);
    const candidateVer = verMatch ? verMatch[1] : tag;
    if (isNewerVersion(candidateVer, highestVersion)) {
      highestVersion = candidateVer;
      bestRelease = rel;
    }
  }

  if (!bestRelease) {
    const status: UpdaterStatusPayload = {
      state: 'up-to-date',
      version: app.getVersion(),
      message: `SOKAK güncel (v${app.getVersion()})`,
    };
    broadcastUpdaterStatus(status);
    return status;
  }

  const assets = Array.isArray(bestRelease.assets) ? bestRelease.assets : [];
  const wantedAssetName =
    process.platform === 'darwin' ? 'SOKAK.dmg' : 'SOKAK-Setup.exe';
  const asset =
    assets.find((a: any) => a.name === wantedAssetName) ||
    assets.find((a: any) =>
      process.platform === 'darwin'
        ? String(a.name).endsWith('.dmg')
        : String(a.name).endsWith('.exe')
    );

  if (!asset || !asset.browser_download_url) {
    const status: UpdaterStatusPayload = {
      state: 'up-to-date',
      version: app.getVersion(),
      message: `SOKAK güncel (v${app.getVersion()})`,
    };
    broadcastUpdaterStatus(status);
    return status;
  }

  broadcastUpdaterStatus({
    state: 'available',
    version: highestVersion,
    progressPercent: 0,
    message: `Yeni SOKAK v${highestVersion} bulundu — arka planda indiriliyor...`,
  });

  const destPath = path.join(
    app.getPath('userData'),
    'updates',
    `SOKAK-${highestVersion}-${wantedAssetName}`
  );

  await downloadFileWithProgress(asset.browser_download_url, destPath, (pct) => {
    broadcastUpdaterStatus({
      state: 'downloading',
      version: highestVersion,
      progressPercent: pct,
      message: `Yeni SOKAK v${highestVersion} indiriliyor (%${pct})...`,
    });
  });

  fallbackInstallerPath = destPath;
  const readyStatus: UpdaterStatusPayload = {
    state: 'downloaded',
    version: highestVersion,
    progressPercent: 100,
    message: 'Yeni SOKAK güncellemesi hazır — Yeniden Başlat ve Güncelle',
  };
  broadcastUpdaterStatus(readyStatus);
  return readyStatus;
}

function setupAutoUpdater() {
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    });

    autoUpdater.on('checking-for-update', () => {
      broadcastUpdaterStatus({
        state: 'checking',
        version: app.getVersion(),
        message: 'Güncellemeler kontrol ediliyor...',
      });
    });

    autoUpdater.on('update-available', (info) => {
      broadcastUpdaterStatus({
        state: 'available',
        version: info.version,
        progressPercent: 0,
        message: `Yeni SOKAK v${info.version} bulundu — arka planda indiriliyor...`,
      });
    });

    autoUpdater.on('download-progress', (prog) => {
      const pct = Math.round(prog.percent || 0);
      broadcastUpdaterStatus({
        state: 'downloading',
        progressPercent: pct,
        message: `SOKAK güncellemesi indiriliyor (%${pct})...`,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      nativeUpdateDownloaded = true;
      isCheckingOrDownloadingUpdate = false;
      broadcastUpdaterStatus({
        state: 'downloaded',
        version: info.version,
        progressPercent: 100,
        message: 'Yeni SOKAK güncellemesi hazır — Yeniden Başlat ve Güncelle',
      });
    });

    autoUpdater.on('update-not-available', () => {
      isCheckingOrDownloadingUpdate = false;
      broadcastUpdaterStatus({
        state: 'up-to-date',
        version: app.getVersion(),
        message: `SOKAK güncel (v${app.getVersion()})`,
      });
    });

    autoUpdater.on('error', async () => {
      // Imzasız macOS veya geliştirme ortamında GitHub Releases API yedek mekanizmasını çalıştır
      try {
        await checkGitHubReleaseFallback();
      } catch {
        broadcastUpdaterStatus({
          state: 'up-to-date',
          version: app.getVersion(),
          message: `SOKAK güncel (v${app.getVersion()})`,
        });
      } finally {
        isCheckingOrDownloadingUpdate = false;
      }
    });
  } catch (err) {
    console.warn('[SOKAK AutoUpdater] Yapılandırma uyarısı:', err);
  }
}

async function triggerUpdateCheck(): Promise<UpdaterStatusPayload> {
  if (latestUpdaterStatus.state === 'downloaded') {
    broadcastUpdaterStatus(latestUpdaterStatus);
    return latestUpdaterStatus;
  }
  if (isCheckingOrDownloadingUpdate) {
    return latestUpdaterStatus;
  }

  isCheckingOrDownloadingUpdate = true;
  broadcastUpdaterStatus({
    state: 'checking',
    version: app.getVersion(),
    message: 'Güncellemeler kontrol ediliyor...',
  });

  try {
    if (app.isPackaged && process.platform === 'win32') {
      await autoUpdater.checkForUpdates();
      return latestUpdaterStatus;
    }
    const res = await checkGitHubReleaseFallback();
    isCheckingOrDownloadingUpdate = false;
    return res;
  } catch {
    try {
      const res = await checkGitHubReleaseFallback();
      isCheckingOrDownloadingUpdate = false;
      return res;
    } catch {
      isCheckingOrDownloadingUpdate = false;
      const fallback: UpdaterStatusPayload = {
        state: 'up-to-date',
        version: app.getVersion(),
        message: `SOKAK güncel (v${app.getVersion()})`,
      };
      broadcastUpdaterStatus(fallback);
      return fallback;
    }
  }
}

async function installDownloadedUpdateNow(): Promise<{ ok: boolean }> {
  if (nativeUpdateDownloaded) {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  }

  if (fallbackInstallerPath && fs.existsSync(fallbackInstallerPath)) {
    isQuitting = true;
    if (process.platform === 'darwin' && fallbackInstallerPath.endsWith('.dmg')) {
      const mountPoint = `/Volumes/SOKAK_AutoUpdate_${Date.now()}`;
      const cmd = `hdiutil attach "${fallbackInstallerPath}" -nobrowse -mountpoint "${mountPoint}" && rm -rf /Applications/SOKAK.app && cp -R "${mountPoint}/SOKAK.app" /Applications/SOKAK.app && hdiutil detach "${mountPoint}" -force && open -a /Applications/SOKAK.app`;
      exec(cmd, (err) => {
        if (err) {
          shell.openPath(fallbackInstallerPath!);
        }
        app.exit(0);
      });
      return { ok: true };
    } else {
      await shell.openPath(fallbackInstallerPath);
      app.exit(0);
      return { ok: true };
    }
  }

  return { ok: false };
}

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
        {
          label: '🔄 Güncellemeleri Kontrol Et...',
          click: () => {
            triggerUpdateCheck();
          },
        },
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
        label: '🎬 Son 30 Sn Klip Al (F8 / Ctrl+Shift+S)',
        click: () => {
          mainWindow?.webContents.send('shortcut:save-clip');
        },
      },
      {
        label: '🎯 Oyun İçi Arayüz (Overlay) Aç/Kapat (Ctrl+Shift+O)',
        click: () => {
          toggleOverlayWindow();
        },
      },
      {
        label: '🔄 Güncellemeleri Kontrol Et',
        click: () => {
          triggerUpdateCheck();
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

  // Sıfır GPU / Sıfır DWM kancası: desktopCapturer.getSources() yerine hafif süreç listesi kontrolü
  const checkRunningGameProcesses = () => {
    if (!mainWindow || isQuitting) return;
    const cmd =
      process.platform === 'win32'
        ? 'tasklist /FO CSV /NH'
        : 'ps -axo comm';

    exec(cmd, { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout || !mainWindow || mainWindow.isDestroyed()) return;
      const lowerOut = stdout.toLowerCase();
      let foundGame: string | null = null;

      for (const game of KNOWN_GAMES) {
        if (game.keywords.some((kw) => lowerOut.includes(kw))) {
          foundGame = game.display;
          break;
        }
      }

      if (foundGame !== lastDetectedGame) {
        lastDetectedGame = foundGame;
        mainWindow.webContents.send('game:detected', foundGame);
      }
    });
  };

  gameDetectIntervalId = setInterval(checkRunningGameProcesses, 15000);
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

  mainWindow.webContents.on('did-finish-load', () => {
    // Uygulama açılışında otomatik güncelleme kontrolü
    setTimeout(() => {
      triggerUpdateCheck().catch(() => {});
    }, 2200);
  });

  mainWindow.on('blur', () => {
    try {
      mainWindow?.webContents.setFrameRate(2);
    } catch {
      // yoksay
    }
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: false,
      isMinimized: mainWindow?.isMinimized() ?? false,
    });
  });

  mainWindow.on('focus', () => {
    try {
      mainWindow?.webContents.setFrameRate(60);
    } catch {
      // yoksay
    }
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: true,
      isMinimized: false,
    });
  });

  mainWindow.on('minimize', () => {
    try {
      mainWindow?.webContents.setFrameRate(1);
    } catch {
      // yoksay
    }
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: false,
      isMinimized: true,
    });
  });

  mainWindow.on('restore', () => {
    try {
      mainWindow?.webContents.setFrameRate(60);
    } catch {
      // yoksay
    }
    mainWindow?.webContents.send('window:visibility-state', {
      isFocused: true,
      isMinimized: false,
    });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      try {
        mainWindow?.webContents.setFrameRate(1);
      } catch {
        // yoksay
      }
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

  // 🎬 Son 30 Saniye Anlık Klip Alma Kısayolları (F8 ve Ctrl+Shift+S)
  globalShortcut.register('F8', () => {
    mainWindow?.webContents.send('shortcut:save-clip');
  });

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow?.webContents.send('shortcut:save-clip');
  });
}

app.whenReady().then(async () => {
  await requestMacMediaPermissions();
  setupApplicationMenu();
  setupSystemTray();
  setupAutoUpdater();
  createMainWindow();
  registerGlobalHardwareShortcuts();
  startLightweightGameDetection();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
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
    appVersion: app.getVersion(),
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
  try {
    mainWindow?.webContents.setFrameRate(1);
  } catch {
    // yoksay
  }
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
  if (isOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:state-updated', payload);
  }
});

ipcMain.handle('updater:check', async () => {
  return await triggerUpdateCheck();
});

ipcMain.handle('updater:install-now', async () => {
  return await installDownloadedUpdateNow();
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
