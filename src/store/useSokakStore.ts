import { create } from 'zustand';
import {
  AccountPublic,
  AuthStatus,
  ChannelDef,
  ChatMessage,
  ChatReaction,
  getRankMeta,
  MemberEntry,
  RankRole,
  ReadyCheckState,
  SquadPoll,
  TelemetryStats,
  ThemeAccentId,
  THEME_ACCENT_PRESETS,
  ToastNotice,
  UpdaterStatusPayload,
  UserPresence,
  UserVolumePreference,
  WatchTogetherState,
} from '../types/sokak';

const APP_CONFIG_VERSION = 'sokak-v1.4.0-cloud';
const DEFAULT_SERVER_URL =
  ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SERVER_URL || ''
  ).trim() || 'https://sokak-server.onrender.com';

const STORAGE_KEYS = {
  CONFIG_VERSION: 'sokak_config_version',
  AUTH_TOKEN: 'sokak_auth_token',
  SERVER_URL: 'sokak_server_url',
  NOISE_GATE_DB: 'sokak_noise_gate_db',
  GAMING_MODE: 'sokak_gaming_mode',
  USER_VOLUMES: 'sokak_user_volumes',
  MEMBER_LIST_OPEN: 'sokak_member_list_open',
  THEME_ACCENT: 'sokak_theme_accent',
  SFX_ENABLED: 'sokak_sfx_enabled',
};

function purgeLegacyStorage(): void {
  try {
    let hasStaleViper = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || '';
      if (
        /viper/i.test(k) ||
        /viper/i.test(v) ||
        /squad/i.test(v) ||
        k.startsWith('nexus_')
      ) {
        hasStaleViper = true;
        break;
      }
    }
    if (hasStaleViper) {
      localStorage.clear();
      sessionStorage.clear();
    }

    const storedVersion = localStorage.getItem(STORAGE_KEYS.CONFIG_VERSION);
    if (storedVersion !== APP_CONFIG_VERSION) {
      localStorage.setItem(STORAGE_KEYS.CONFIG_VERSION, APP_CONFIG_VERSION);
      const existingUrl = localStorage.getItem(STORAGE_KEYS.SERVER_URL) || '';
      if (!existingUrl || existingUrl.includes('localhost:3001')) {
        localStorage.setItem(STORAGE_KEYS.SERVER_URL, DEFAULT_SERVER_URL);
      }
    }
  } catch {
    // yoksay
  }
}

function readStoredToken(): string | null {
  purgeLegacyStorage();
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

function getInitialVolumes(): Record<string, UserVolumePreference> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_VOLUMES);
    if (raw) return JSON.parse(raw);
  } catch {
    // yoksay
  }
  return {};
}

export interface SokakState {
  // Hesap & Oturum & RBAC Rütbe
  authStatus: AuthStatus;
  authToken: string | null;
  authError: string | null;
  currentUser: AccountPublic | null;
  userId: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  activeGame: string | null;
  serverUrl: string;
  isConnected: boolean;
  connectionError: string | null;
  lanIps: string[];

  // Bildirim (Toast)
  toastNotice: ToastNotice | null;

  // Kanallar, mesajlar, anketler, üyeler
  channels: ChannelDef[];
  selectedTextChannelId: string;
  activeVoiceChannelId: string | null;
  messagesByChannel: Record<string, ChatMessage[]>;
  pollsByChannel: Record<string, SquadPoll | null>;
  users: UserPresence[];
  members: MemberEntry[];
  isMemberListOpen: boolean;

  // Tema & Ses Efektleri
  themeAccent: ThemeAccentId;
  soundEffectsEnabled: boolean;

  // Birlikte İzle & Hazır Yoklaması
  watchTogether: WatchTogetherState;
  activeReadyCheck: ReadyCheckState | null;

  // Ses motoru
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  noiseGateThresholdDb: number;
  currentInputLevelDb: number;
  userVolumes: Record<string, UserVolumePreference>;
  selectedAudioInputDeviceId: string;
  callStartedAt: number | null;

  // Ekran paylaşımı
  isScreenSharing: boolean;
  activeScreenShareSourceName: string | null;
  remoteStreams: Record<string, MediaStream>;
  localScreenStream: MediaStream | null;
  isStreamPausedForFps: boolean;
  isTheaterMode: boolean;
  isScreenPickerOpen: boolean;
  isSettingsModalOpen: boolean;

  // Telemetri & performans & Oyun İçi Arayüz (Overlay) & Klip Modu & Oto-Güncelleyici
  telemetry: TelemetryStats;
  isGamingMode: boolean;
  isOverlayActive: boolean;
  isReplayBufferActive: boolean;
  replayBufferSeconds: number;
  isSavingClip: boolean;
  localClipObjectUrls: Record<string, string>;
  updaterStatus: UpdaterStatusPayload;
  appVersion: string;
  disableHwAccelOnRestart: boolean;
  isWindowFocused: boolean;
  isWindowMinimized: boolean;
  platform: string;

  // Eylemler
  setAuthChecking: () => void;
  setSession: (token: string, user: AccountPublic, remember: boolean) => void;
  updateCurrentUser: (user: AccountPublic) => void;
  clearSession: (reason?: string | null) => void;
  setAuthError: (error: string | null) => void;
  showToast: (message: string, type?: 'warning' | 'info' | 'success') => void;
  clearToast: () => void;
  setServerUrl: (url: string) => void;
  setActiveGame: (gameName: string | null) => void;
  setConnectionState: (isConnected: boolean, error?: string | null) => void;
  setServerInitData: (payload: {
    channels: ChannelDef[];
    messagesByChannel: Record<string, ChatMessage[]>;
    pollsByChannel?: Record<string, SquadPoll | null>;
    users: UserPresence[];
    members?: MemberEntry[];
    lanIps: string[];
    watchTogether?: WatchTogetherState;
    me?: AccountPublic;
  }) => void;
  setUsers: (users: UserPresence[]) => void;
  setMembers: (members: MemberEntry[]) => void;
  setMemberListOpen: (open: boolean) => void;
  updateUserSpeaking: (socketId: string, isSpeaking: boolean) => void;
  selectTextChannel: (channelId: string) => void;
  setActiveVoiceChannel: (channelId: string | null) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  updateMessageReactions: (channelId: string, messageId: string, reactions: ChatReaction[]) => void;
  updateMessagePin: (channelId: string, messageId: string, pinned: boolean, pinnedBy?: string) => void;
  setChannelPoll: (channelId: string, poll: SquadPoll | null) => void;
  setThemeAccent: (accent: ThemeAccentId) => void;
  setSoundEffectsEnabled: (enabled: boolean) => void;

  setWatchTogether: (state: WatchTogetherState) => void;
  setActiveReadyCheck: (state: ReadyCheckState | null) => void;

  setMuted: (isMuted: boolean) => void;
  setDeafened: (isDeafened: boolean) => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setNoiseGateThresholdDb: (db: number) => void;
  setCurrentInputLevelDb: (db: number) => void;
  setUserVolume: (targetUserId: string, volume: number) => void;
  toggleUserLocalMute: (targetUserId: string) => void;
  setSelectedAudioInputDeviceId: (deviceId: string) => void;

  setScreenSharing: (isSharing: boolean, sourceName?: string | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setRemoteStream: (socketId: string, stream: MediaStream | null) => void;
  clearRemoteStreams: () => void;
  setStreamPausedForFps: (paused: boolean) => void;
  setTheaterMode: (theater: boolean) => void;
  setScreenPickerOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;

  setTelemetry: (stats: Partial<TelemetryStats>) => void;
  setGamingMode: (enabled: boolean) => void;
  setOverlayActive: (active: boolean) => void;
  setReplayBufferState: (active: boolean, seconds?: number) => void;
  setSavingClip: (saving: boolean) => void;
  registerLocalClipUrl: (clipId: string, blobUrl: string) => void;
  setUpdaterStatus: (status: UpdaterStatusPayload) => void;
  setDisableHwAccelOnRestart: (disabled: boolean) => void;
  setWindowVisibility: (isFocused: boolean, isMinimized: boolean) => void;
  setPlatformInfo: (platform: string, disableHwAccel: boolean, appVersion?: string) => void;
}

const DEFAULT_CHANNELS: ChannelDef[] = [
  { id: 'text-genel', name: 'genel-sohbet', type: 'text', badge: 'SOHBET' },
  { id: 'text-klipler', name: 'klipler-ve-linkler', type: 'text', badge: 'MEDYA' },
  { id: 'voice-lounge', name: '🔒 Leader & Admin Lounge', type: 'voice', bitrate: 128, minRankLevel: 4 },
  { id: 'voice-lobi', name: '🔊 Genel Lobi', type: 'voice', bitrate: 128, minRankLevel: 1 },
  { id: 'voice-fps', name: '🎯 Rekabetçi FPS', type: 'voice', bitrate: 128, minRankLevel: 2 },
  { id: 'voice-lol', name: '⚔️ LoL / Duo', type: 'voice', bitrate: 128, minRankLevel: 2 },
  { id: 'voice-sinema', name: '🍿 Sinema & Yayın', type: 'voice', bitrate: 128, minRankLevel: 1 },
  { id: 'voice-afk', name: '💤 AFK', type: 'voice', bitrate: 64, minRankLevel: 1 },
];

const initialToken = readStoredToken();
let toastTimeoutId: number | null = null;

function identityFrom(user: AccountPublic | null) {
  const meta = getRankMeta(user?.rank);
  return {
    currentUser: user,
    userId: user?.id ?? '',
    username: user?.username ?? '',
    rank: meta.role,
    rankLevel: user?.rankLevel ?? meta.level,
    avatarColor: user?.avatarColor ?? '#10B981',
    avatarImage: user?.avatarImage ?? null,
    statusTag: user?.statusTag ?? '',
  };
}

export const useSokakStore = create<SokakState>((set, get) => ({
  authStatus: initialToken ? 'checking' : 'unauthenticated',
  authToken: initialToken,
  authError: null,
  ...identityFrom(null),
  activeGame: null,
  serverUrl: localStorage.getItem(STORAGE_KEYS.SERVER_URL) || DEFAULT_SERVER_URL,
  isConnected: false,
  connectionError: null,
  lanIps: [],

  toastNotice: null,

  channels: DEFAULT_CHANNELS,
  selectedTextChannelId: 'text-genel',
  activeVoiceChannelId: null,
  messagesByChannel: {},
  pollsByChannel: {},
  users: [],
  members: [],
  isMemberListOpen: localStorage.getItem(STORAGE_KEYS.MEMBER_LIST_OPEN) !== 'false',

  themeAccent: (localStorage.getItem(STORAGE_KEYS.THEME_ACCENT) as ThemeAccentId) || 'emerald',
  soundEffectsEnabled: localStorage.getItem(STORAGE_KEYS.SFX_ENABLED) !== 'false',

  watchTogether: {
    videoId: 'dQw4w9WgXcQ',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    isPlaying: false,
    currentTime: 0,
    updatedAt: Date.now(),
    updatedBy: 'SOKAK',
  },
  activeReadyCheck: null,

  isMuted: false,
  isDeafened: false,
  isSpeaking: false,
  noiseGateThresholdDb: Number(localStorage.getItem(STORAGE_KEYS.NOISE_GATE_DB) || -52),
  currentInputLevelDb: -85,
  userVolumes: getInitialVolumes(),
  selectedAudioInputDeviceId: 'default',
  callStartedAt: null,

  isScreenSharing: false,
  activeScreenShareSourceName: null,
  remoteStreams: {},
  localScreenStream: null,
  isStreamPausedForFps: false,
  isTheaterMode: false,
  isScreenPickerOpen: false,
  isSettingsModalOpen: false,

  telemetry: {
    pingMs: 0,
    bitrateKbps: 128,
    packetLossPercent: 0.0,
    codec: 'Opus 48kHz Stereo CBR',
  },
  isGamingMode: localStorage.getItem(STORAGE_KEYS.GAMING_MODE) === 'true',
  isOverlayActive: false,
  isReplayBufferActive: false,
  replayBufferSeconds: 0,
  isSavingClip: false,
  localClipObjectUrls: {},
  updaterStatus: {
    state: 'idle',
    version: '1.1.1',
  },
  appVersion: '1.1.1',
  disableHwAccelOnRestart: false,
  isWindowFocused: true,
  isWindowMinimized: false,
  platform: 'darwin',

  setAuthChecking: () => set({ authStatus: 'checking', authError: null }),

  setSession: (token, user, remember) => {
    if (remember) {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    } else {
      sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    }
    set({
      authStatus: 'authenticated',
      authToken: token,
      authError: null,
      ...identityFrom(user),
    });
  },

  updateCurrentUser: (user) => set(identityFrom(user)),

  clearSession: (reason = null) => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    set({
      authStatus: 'unauthenticated',
      authToken: null,
      authError: reason,
      ...identityFrom(null),
      activeGame: null,
      isConnected: false,
      users: [],
      members: [],
      messagesByChannel: {},
      activeVoiceChannelId: null,
      activeReadyCheck: null,
      isSettingsModalOpen: false,
      isScreenPickerOpen: false,
    });
  },

  setAuthError: (authError) => set({ authError }),

  showToast: (message, type = 'warning') => {
    if (toastTimeoutId) {
      window.clearTimeout(toastTimeoutId);
    }
    set({
      toastNotice: {
        id: `${Date.now()}`,
        message,
        type,
      },
    });
    toastTimeoutId = window.setTimeout(() => {
      set({ toastNotice: null });
      toastTimeoutId = null;
    }, 4200);
  },

  clearToast: () => {
    if (toastTimeoutId) {
      window.clearTimeout(toastTimeoutId);
      toastTimeoutId = null;
    }
    set({ toastNotice: null });
  },

  setServerUrl: (url) => {
    const clean = url.trim().replace(/\/+$/, '') || DEFAULT_SERVER_URL;
    localStorage.setItem(STORAGE_KEYS.SERVER_URL, clean);
    set({ serverUrl: clean });
  },

  setActiveGame: (gameName) => set({ activeGame: gameName }),

  setConnectionState: (isConnected, error = null) => set({ isConnected, connectionError: error }),

  setServerInitData: (payload) =>
    set((state) => ({
      channels: payload.channels.length ? payload.channels : DEFAULT_CHANNELS,
      messagesByChannel: payload.messagesByChannel,
      pollsByChannel: payload.pollsByChannel ?? state.pollsByChannel,
      users: payload.users,
      members: payload.members ?? state.members,
      lanIps: payload.lanIps || [],
      watchTogether: payload.watchTogether ?? state.watchTogether,
      ...(payload.me ? identityFrom(payload.me) : {}),
    })),

  setUsers: (users) => set({ users }),

  setMembers: (members) => set({ members }),

  setMemberListOpen: (open) => {
    localStorage.setItem(STORAGE_KEYS.MEMBER_LIST_OPEN, String(open));
    set({ isMemberListOpen: open });
  },

  updateUserSpeaking: (socketId, isSpeaking) =>
    set((state) => ({
      users: state.users.map((u) => (u.socketId === socketId ? { ...u, isSpeaking } : u)),
    })),

  selectTextChannel: (channelId) => set({ selectedTextChannelId: channelId }),

  setActiveVoiceChannel: (channelId) =>
    set({
      activeVoiceChannelId: channelId,
      callStartedAt: channelId ? Date.now() : null,
      isStreamPausedForFps: false,
      activeReadyCheck: null,
    }),

  appendChatMessage: (msg) =>
    set((state) => {
      const list = state.messagesByChannel[msg.channelId] || [];
      return {
        messagesByChannel: { ...state.messagesByChannel, [msg.channelId]: [...list, msg] },
      };
    }),

  updateMessageReactions: (channelId, messageId, reactions) =>
    set((state) => {
      const list = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: list.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        },
      };
    }),

  updateMessagePin: (channelId, messageId, pinned, pinnedBy) =>
    set((state) => {
      const list = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: list.map((m) =>
            m.id === messageId ? { ...m, pinned, pinnedBy } : m
          ),
        },
      };
    }),

  setChannelPoll: (channelId, poll) =>
    set((state) => ({
      pollsByChannel: {
        ...state.pollsByChannel,
        [channelId]: poll,
      },
    })),

  setThemeAccent: (accent) => {
    localStorage.setItem(STORAGE_KEYS.THEME_ACCENT, accent);
    const preset =
      THEME_ACCENT_PRESETS.find((p) => p.id === accent) || THEME_ACCENT_PRESETS[0];
    document.documentElement.style.setProperty('--accent-emerald', preset.color);
    set({ themeAccent: accent });
  },

  setSoundEffectsEnabled: (enabled) => {
    localStorage.setItem(STORAGE_KEYS.SFX_ENABLED, String(enabled));
    set({ soundEffectsEnabled: enabled });
  },

  setWatchTogether: (watchTogether) => set({ watchTogether }),

  setActiveReadyCheck: (activeReadyCheck) => set({ activeReadyCheck }),

  setMuted: (isMuted) => set({ isMuted }),

  setDeafened: (isDeafened) =>
    set((state) => ({
      isDeafened,
      isMuted: isDeafened ? true : state.isMuted,
    })),

  setSpeaking: (isSpeaking) => set({ isSpeaking }),

  setNoiseGateThresholdDb: (db) => {
    localStorage.setItem(STORAGE_KEYS.NOISE_GATE_DB, String(db));
    set({ noiseGateThresholdDb: db });
  },

  setCurrentInputLevelDb: (db) => set({ currentInputLevelDb: db }),

  setUserVolume: (targetUserId, volume) => {
    const clamped = Math.max(0, Math.min(200, Math.round(volume)));
    const current = get().userVolumes[targetUserId] || { volume: 100, localMuted: false };
    const updated = { ...get().userVolumes, [targetUserId]: { ...current, volume: clamped } };
    localStorage.setItem(STORAGE_KEYS.USER_VOLUMES, JSON.stringify(updated));
    set({ userVolumes: updated });
  },

  toggleUserLocalMute: (targetUserId) => {
    const current = get().userVolumes[targetUserId] || { volume: 100, localMuted: false };
    const updated = {
      ...get().userVolumes,
      [targetUserId]: { ...current, localMuted: !current.localMuted },
    };
    localStorage.setItem(STORAGE_KEYS.USER_VOLUMES, JSON.stringify(updated));
    set({ userVolumes: updated });
  },

  setSelectedAudioInputDeviceId: (deviceId) => set({ selectedAudioInputDeviceId: deviceId }),

  setScreenSharing: (isSharing, sourceName = null) =>
    set({
      isScreenSharing: isSharing,
      activeScreenShareSourceName: isSharing ? sourceName : null,
    }),

  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),

  setRemoteStream: (socketId, stream) =>
    set((state) => {
      const next = { ...state.remoteStreams };
      if (stream) next[socketId] = stream;
      else delete next[socketId];
      return { remoteStreams: next };
    }),

  clearRemoteStreams: () => set({ remoteStreams: {} }),

  setStreamPausedForFps: (paused) => set({ isStreamPausedForFps: paused }),

  setTheaterMode: (theater) => set({ isTheaterMode: theater }),

  setScreenPickerOpen: (open) => set({ isScreenPickerOpen: open }),

  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),

  setTelemetry: (stats) => set((state) => ({ telemetry: { ...state.telemetry, ...stats } })),

  setGamingMode: (enabled) => {
    localStorage.setItem(STORAGE_KEYS.GAMING_MODE, String(enabled));
    set({ isGamingMode: enabled });
  },

  setOverlayActive: (isOverlayActive) => set({ isOverlayActive }),

  setReplayBufferState: (active, seconds) =>
    set((state) => ({
      isReplayBufferActive: active,
      replayBufferSeconds:
        typeof seconds === 'number' ? seconds : active ? state.replayBufferSeconds : 0,
    })),

  setSavingClip: (isSavingClip) => set({ isSavingClip }),

  registerLocalClipUrl: (clipId, blobUrl) =>
    set((state) => ({
      localClipObjectUrls: {
        ...state.localClipObjectUrls,
        [clipId]: blobUrl,
      },
    })),

  setUpdaterStatus: (updaterStatus) => set({ updaterStatus }),

  setDisableHwAccelOnRestart: (disabled) => set({ disableHwAccelOnRestart: disabled }),

  setWindowVisibility: (isFocused, isMinimized) =>
    set({ isWindowFocused: isFocused, isWindowMinimized: isMinimized }),

  setPlatformInfo: (platform, disableHwAccel, appVersion) =>
    set((state) => ({
      platform,
      disableHwAccelOnRestart: disableHwAccel,
      ...(appVersion ? { appVersion } : {}),
    })),
}));

export function isUiFrozenForGame(state: SokakState): boolean {
  return state.isGamingMode || !state.isWindowFocused || state.isWindowMinimized;
}
