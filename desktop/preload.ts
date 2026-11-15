import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopSourceItem {
  id: string;
  name: string;
  displayId: string;
  isScreen: boolean;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
}

export interface WindowVisibilityState {
  isFocused: boolean;
  isMinimized: boolean;
}

export interface OverlayStatePayload {
  channelName: string | null;
  occupants: Array<{
    userId: string;
    username: string;
    rank: string;
    avatarColor: string;
    avatarImage?: string | null;
    isSpeaking: boolean;
    isMuted: boolean;
    isDeafened: boolean;
  }>;
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

const sokakDesktopAPI = {
  getPlatformInfo: (): Promise<{
    platform: string;
    disableHardwareAcceleration: boolean;
    isOverlayVisible?: boolean;
    appVersion?: string;
  }> => ipcRenderer.invoke('window:get-platform'),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeToTray: () => ipcRenderer.send('window:close-to-tray'),

  toggleOverlayWindow: (forceState?: boolean): Promise<{ visible: boolean }> =>
    ipcRenderer.invoke('overlay:toggle', forceState),

  syncOverlayState: (payload: OverlayStatePayload) =>
    ipcRenderer.send('overlay:sync-state', payload),

  onOverlayVisibilityChanged: (callback: (visible: boolean) => void) => {
    const handler = (_event: unknown, visible: boolean) => callback(visible);
    ipcRenderer.on('overlay:visibility-changed', handler);
    return () => ipcRenderer.removeListener('overlay:visibility-changed', handler);
  },

  onOverlayStateUpdated: (callback: (payload: OverlayStatePayload) => void) => {
    const handler = (_event: unknown, payload: OverlayStatePayload) => callback(payload);
    ipcRenderer.on('overlay:state-updated', handler);
    return () => ipcRenderer.removeListener('overlay:state-updated', handler);
  },

  checkForUpdates: (): Promise<UpdaterStatusPayload> =>
    ipcRenderer.invoke('updater:check'),

  installUpdateNow: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('updater:install-now'),

  onUpdaterStatus: (callback: (status: UpdaterStatusPayload) => void) => {
    const handler = (_event: unknown, status: UpdaterStatusPayload) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },

  getDesktopSources: (): Promise<DesktopSourceItem[]> =>
    ipcRenderer.invoke('desktop:get-sources'),

  selectDesktopSource: (sourceId: string): Promise<{ ok: boolean; sourceId: string }> =>
    ipcRenderer.invoke('desktop:select-source', sourceId),

  setHardwareAccelerationDisabled: (
    disableHwAccel: boolean
  ): Promise<{ saved: boolean; disableHardwareAcceleration: boolean }> =>
    ipcRenderer.invoke('gaming-mode:set-hw-accel', disableHwAccel),

  relaunchApp: (): Promise<void> => ipcRenderer.invoke('gaming-mode:relaunch'),

  onToggleMuteShortcut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:toggle-mute', handler);
    return () => ipcRenderer.removeListener('shortcut:toggle-mute', handler);
  },

  onToggleDeafenShortcut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:toggle-deafen', handler);
    return () => ipcRenderer.removeListener('shortcut:toggle-deafen', handler);
  },

  onSaveClipShortcut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('shortcut:save-clip', handler);
    return () => ipcRenderer.removeListener('shortcut:save-clip', handler);
  },

  onWindowVisibilityState: (callback: (state: WindowVisibilityState) => void) => {
    const handler = (_event: unknown, state: WindowVisibilityState) => callback(state);
    ipcRenderer.on('window:visibility-state', handler);
    return () => ipcRenderer.removeListener('window:visibility-state', handler);
  },

  onGameDetected: (callback: (gameName: string | null) => void) => {
    const handler = (_event: unknown, gameName: string | null) => callback(gameName);
    ipcRenderer.on('game:detected', handler);
    return () => ipcRenderer.removeListener('game:detected', handler);
  },
};

contextBridge.exposeInMainWorld('sokakDesktop', sokakDesktopAPI);
