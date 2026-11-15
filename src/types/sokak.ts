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

export interface OverlayOccupantItem {
  userId: string;
  username: string;
  rank: RankRole;
  avatarColor: string;
  avatarImage?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  pingMs?: number;
}

export interface OverlayStatePayload {
  channelName: string | null;
  occupants: OverlayOccupantItem[];
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

export interface SokakDesktopAPI {
  getPlatformInfo: () => Promise<{
    platform: string;
    disableHardwareAcceleration: boolean;
    isOverlayVisible?: boolean;
    appVersion?: string;
  }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeToTray: () => void;
  toggleOverlayWindow: (forceState?: boolean) => Promise<{ visible: boolean }>;
  syncOverlayState: (payload: OverlayStatePayload) => void;
  onOverlayVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
  onOverlayStateUpdated: (callback: (payload: OverlayStatePayload) => void) => () => void;
  checkForUpdates: () => Promise<UpdaterStatusPayload>;
  installUpdateNow: () => Promise<{ ok: boolean }>;
  onUpdaterStatus: (callback: (status: UpdaterStatusPayload) => void) => () => void;
  getDesktopSources: () => Promise<DesktopSourceItem[]>;
  selectDesktopSource: (sourceId: string) => Promise<{ ok: boolean; sourceId: string }>;
  setHardwareAccelerationDisabled: (
    disableHwAccel: boolean
  ) => Promise<{ saved: boolean; disableHardwareAcceleration: boolean }>;
  relaunchApp: () => Promise<void>;
  onToggleMuteShortcut: (callback: () => void) => () => void;
  onToggleDeafenShortcut: (callback: () => void) => () => void;
  onSaveClipShortcut: (callback: () => void) => () => void;
  onWindowVisibilityState: (callback: (state: WindowVisibilityState) => void) => () => void;
  onGameDetected: (callback: (gameName: string | null) => void) => () => void;
}

declare global {
  interface Window {
    sokakDesktop?: SokakDesktopAPI;
  }
}

export type RankRole = 'LEADER' | 'ADMIN' | 'CAPTAIN' | 'MEMBER' | 'ROOKIE';

export interface RankMetadata {
  role: RankRole;
  level: number;
  label: string;
  shortLabel: string;
  color: string;
  groupHeader: string;
}

export const RANK_META: Record<RankRole, RankMetadata> = {
  LEADER: {
    role: 'LEADER',
    level: 5,
    label: 'LEADER',
    shortLabel: 'LEADER',
    color: '#EF4444', // Crimson Red
    groupHeader: 'LEADER',
  },
  ADMIN: {
    role: 'ADMIN',
    level: 4,
    label: 'ADMIN',
    shortLabel: 'ADMIN',
    color: '#A855F7', // Royal Purple
    groupHeader: 'ADMIN',
  },
  CAPTAIN: {
    role: 'CAPTAIN',
    level: 3,
    label: 'CAPTAIN / VIP',
    shortLabel: 'CAPTAIN',
    color: '#F59E0B', // Gold
    groupHeader: 'CAPTAIN / VIP',
  },
  MEMBER: {
    role: 'MEMBER',
    level: 2,
    label: 'MEMBER',
    shortLabel: 'MEMBER',
    color: '#10B981', // Emerald
    groupHeader: 'MEMBER',
  },
  ROOKIE: {
    role: 'ROOKIE',
    level: 1,
    label: 'ROOKIE / GUEST',
    shortLabel: 'ROOKIE',
    color: '#94A3B8', // Slate Grey
    groupHeader: 'ROOKIE / GUEST',
  },
};

export const RANK_ORDER: RankRole[] = ['LEADER', 'ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];
export const ASSIGNABLE_RANKS: RankRole[] = ['ADMIN', 'CAPTAIN', 'MEMBER', 'ROOKIE'];

export function getRankMeta(rank?: RankRole | null): RankMetadata {
  if (rank && RANK_META[rank]) return RANK_META[rank];
  return RANK_META.ROOKIE;
}

export interface UserPresence {
  socketId: string;
  userId: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage?: string | null;
  statusTag: string;
  activeGame?: string | null;
  activeVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  pingMs: number;
}

export interface AccountPublic {
  id: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  createdAt: string;
}

export interface MemberEntry {
  userId: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  isOnline: boolean;
  activeVoiceChannelId?: string | null;
  activeGame: string | null;
}

export type AuthStatus = 'checking' | 'unauthenticated' | 'authenticated';

export interface WatchTogetherState {
  videoId: string;
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
  updatedBy: string;
}

export interface ReadyCheckState {
  channelId: string;
  initiatedBy: string;
  startedAt: number;
  readyUserIds: string[];
}

export interface ChatReaction {
  emoji: string;
  users: string[];
}

export interface ClipAttachment {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  videoUrl: string;
  sourceName?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  rank?: RankRole;
  avatarColor: string;
  content: string;
  timestamp: string;
  reactions: ChatReaction[];
  pinned?: boolean;
  pinnedBy?: string;
  clipAttachment?: ClipAttachment;
}

export interface PollOption {
  id: string;
  text: string;
  voterNames: string[];
}

export interface SquadPoll {
  id: string;
  channelId: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: string;
}

export type ThemeAccentId = 'emerald' | 'crimson' | 'violet' | 'gold';

export interface ThemeAccentPreset {
  id: ThemeAccentId;
  label: string;
  color: string;
}

export const THEME_ACCENT_PRESETS: ThemeAccentPreset[] = [
  { id: 'emerald', label: 'SOKAK Zümrüt', color: '#10B981' },
  { id: 'crimson', label: 'Crimson Leader', color: '#EF4444' },
  { id: 'violet', label: 'Cyber Violet', color: '#A855F7' },
  { id: 'gold', label: 'Tactical Gold', color: '#F59E0B' },
];

export interface ChannelDef {
  id: string;
  name: string;
  type: 'voice' | 'text';
  badge?: string;
  bitrate?: number;
  minRankLevel?: number;
}

export interface TelemetryStats {
  pingMs: number;
  bitrateKbps: number;
  packetLossPercent: number;
  codec: string;
}

export interface UserVolumePreference {
  volume: number;
  localMuted: boolean;
}

export interface ToastNotice {
  id: string;
  message: string;
  type: 'warning' | 'info' | 'success';
}
