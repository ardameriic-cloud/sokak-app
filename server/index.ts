import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import os from 'os';
import {
  accountStore,
  AccountError,
  getRankLevel,
  RANK_LEVELS,
  RankRole,
  toPublicAccount,
} from './accountStore';

const app = express();
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 1e6,
});

export interface UserPresence {
  socketId: string;
  userId: string;
  username: string;
  rank: RankRole;
  rankLevel: number;
  avatarColor: string;
  avatarImage: string | null;
  statusTag: string;
  activeGame: string | null;
  activeVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  pingMs: number;
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
  activeVoiceChannelId: string | null;
  activeGame: string | null;
}

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

export interface ChannelDef {
  id: string;
  name: string;
  type: 'voice' | 'text';
  badge?: string;
  bitrate?: number;
  minRankLevel?: number;
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

const SYSTEM_USER_ID = 'sokak-sistem';
const SYSTEM_USERNAME = 'SOKAK';

const users = new Map<string, UserPresence>();

let watchTogetherState: WatchTogetherState = {
  videoId: 'dQw4w9WgXcQ',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  isPlaying: false,
  currentTime: 0,
  updatedAt: Date.now(),
  updatedBy: SYSTEM_USERNAME,
};

const readyChecksByChannel = new Map<string, ReadyCheckState>();
const pollsByChannel: Record<string, SquadPoll | null> = {};

const messagesByChannel: Record<string, ChatMessage[]> = {
  'text-genel': [
    {
      id: 'msg-welcome-1',
      channelId: 'text-genel',
      userId: SYSTEM_USER_ID,
      username: SYSTEM_USERNAME,
      rank: 'LEADER',
      avatarColor: '#10B981',
      content:
        "🚀 **SOKAK'a hoş geldin!** Ekip içi anlık sesli ve yazılı iletişim burada.\n`128kbps Stereo Opus` ses, **Birlikte İzle** (`🍿 Sinema & Yayın`), **Hazır Yoklaması**, `1080p 60FPS` yayın ve **LEADER / ADMIN / CAPTAIN / MEMBER / ROOKIE** rütbe sistemi aktif!",
      timestamp: new Date().toISOString(),
      reactions: [],
    },
  ],
  'text-klipler': [
    {
      id: 'msg-welcome-2',
      channelId: 'text-klipler',
      userId: SYSTEM_USER_ID,
      username: SYSTEM_USERNAME,
      rank: 'LEADER',
      avatarColor: '#5865F2',
      content:
        "🎬 **Klipler & Linkler** kanalı: resim bağlantıları (`.png`, `.jpg`, `.gif`, `.webp`), YouTube/Twitch/Kick linkleri ve en iyi anlarınız burada.\nhttps://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80",
      timestamp: new Date().toISOString(),
      reactions: [],
    },
  ],
};

function getLanIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function buildMemberList(): MemberEntry[] {
  const presences = Array.from(users.values());
  return accountStore
    .listAll()
    .map((acc) => {
      const own = presences.filter((p) => p.userId === acc.id);
      const voicePresence = own.find((p) => p.activeVoiceChannelId);
      const gamePresence = own.find((p) => p.activeGame);
      const rankLevel = getRankLevel(acc.rank);
      return {
        userId: acc.id,
        username: acc.username,
        rank: acc.rank,
        rankLevel,
        avatarColor: acc.avatarColor,
        avatarImage: acc.avatarImage,
        statusTag: acc.statusTag,
        isOnline: own.length > 0,
        activeVoiceChannelId: voicePresence?.activeVoiceChannelId || null,
        activeGame: gamePresence?.activeGame || null,
      };
    })
    .sort((a, b) => {
      if (b.rankLevel !== a.rankLevel) return b.rankLevel - a.rankLevel;
      return a.username.localeCompare(b.username, 'tr-TR');
    });
}

function broadcastPresence() {
  io.emit('presence:update', Array.from(users.values()));
}

function broadcastMembers() {
  io.emit('members:update', buildMemberList());
}

function getBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function handleRouteError(res: express.Response, err: unknown) {
  if (err instanceof AccountError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[SOKAK] Beklenmeyen hata:', err);
  res.status(500).json({ error: 'Sunucu hatası, lütfen tekrar deneyin.' });
}

// Ortak ses kanalı değiştirme yardımcısı (hem normal katılımda hem de LEADER/ADMIN taşımasında kullanılır)
function switchSocketVoiceChannel(targetSocket: Socket, channelId: string) {
  const user = users.get(targetSocket.id);
  if (!user) return;

  const previousChannelId = user.activeVoiceChannelId;
  if (previousChannelId && previousChannelId !== channelId) {
    targetSocket.leave(previousChannelId);
    targetSocket.to(previousChannelId).emit('webrtc:peer-left', {
      socketId: targetSocket.id,
      userId: user.userId,
    });
  }

  const existingPeers = Array.from(users.values()).filter(
    (u) => u.activeVoiceChannelId === channelId && u.socketId !== targetSocket.id
  );

  user.activeVoiceChannelId = channelId;
  user.isSpeaking = false;
  if (channelId === 'voice-afk') {
    user.isMuted = true;
    user.isDeafened = true;
  }
  targetSocket.join(channelId);

  targetSocket.emit('webrtc:room-peers', { channelId, peers: existingPeers });

  if (channelId === 'voice-sinema') {
    targetSocket.emit('watch:sync', watchTogetherState);
  }

  targetSocket.emit('readycheck:state', readyChecksByChannel.get(channelId) || null);
  targetSocket.to(channelId).emit('webrtc:peer-joined', { peer: user });

  broadcastPresence();
  broadcastMembers();
}

function disconnectSocketFromVoice(targetSocket: Socket) {
  const user = users.get(targetSocket.id);
  if (!user || !user.activeVoiceChannelId) return;

  const oldChannel = user.activeVoiceChannelId;
  targetSocket.leave(oldChannel);
  targetSocket.to(oldChannel).emit('webrtc:peer-left', {
    socketId: targetSocket.id,
    userId: user.userId,
  });

  user.activeVoiceChannelId = null;
  user.isSpeaking = false;
  user.isScreenSharing = false;

  broadcastPresence();
  broadcastMembers();
}

// ───────────── REST: Hesap / Oturum ─────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'SOKAK',
    service: 'SOKAK Sunucusu',
    connectedUsers: users.size,
    registeredUsers: accountStore.listAll().length,
    lanIps: getLanIpAddresses(),
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await accountStore.register(req.body || {});
    res.status(201).json({ token: result.token, user: result.account });
    broadcastMembers();
  } catch (err) {
    handleRouteError(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await accountStore.login(req.body || {});
    res.json({ token: result.token, user: result.account });
  } catch (err) {
    handleRouteError(res, err);
  }
});

app.get('/api/auth/me', (req, res) => {
  const acc = accountStore.resolveToken(getBearerToken(req));
  if (!acc) {
    res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş.' });
    return;
  }
  res.json({ user: toPublicAccount(acc) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getBearerToken(req);
  accountStore.revokeToken(token);
  for (const [socketId] of users) {
    const s = io.sockets.sockets.get(socketId);
    if (s && s.data.token === token) s.disconnect(true);
  }
  res.json({ ok: true });
});

// ───────────── Socket.io: Token doğrulama ─────────────

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const acc = accountStore.resolveToken(token);
  if (!acc) {
    next(new Error('UNAUTHORIZED'));
    return;
  }
  socket.data.accountId = acc.id;
  socket.data.token = token;
  next();
});

io.on('connection', (socket: Socket) => {
  const account = accountStore.getById(socket.data.accountId);
  if (!account) {
    socket.disconnect(true);
    return;
  }

  const presence: UserPresence = {
    socketId: socket.id,
    userId: account.id,
    username: account.username,
    rank: account.rank,
    rankLevel: getRankLevel(account.rank),
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    statusTag: account.statusTag,
    activeGame: null,
    activeVoiceChannelId: null,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
    pingMs: 12,
  };
  users.set(socket.id, presence);

  socket.emit('server:init', {
    channels: DEFAULT_CHANNELS,
    messagesByChannel,
    pollsByChannel,
    users: Array.from(users.values()),
    members: buildMemberList(),
    lanIps: getLanIpAddresses(),
    watchTogether: watchTogetherState,
    me: toPublicAccount(account),
  });

  broadcastPresence();
  broadcastMembers();

  socket.on('user:updateState', (partial: Partial<UserPresence>) => {
    const existing = users.get(socket.id);
    if (!existing || !partial || typeof partial !== 'object') return;

    const prevGame = existing.activeGame;
    if (typeof partial.isMuted === 'boolean') existing.isMuted = partial.isMuted;
    if (typeof partial.isDeafened === 'boolean') existing.isDeafened = partial.isDeafened;
    if (typeof partial.isScreenSharing === 'boolean') existing.isScreenSharing = partial.isScreenSharing;
    if (typeof partial.pingMs === 'number' && Number.isFinite(partial.pingMs)) {
      existing.pingMs = Math.max(0, Math.min(9999, Math.round(partial.pingMs)));
    }
    if (partial.activeGame === null || typeof partial.activeGame === 'string') {
      existing.activeGame = partial.activeGame ? String(partial.activeGame).slice(0, 48) : null;
    }

    broadcastPresence();
    if (prevGame !== existing.activeGame) broadcastMembers();
  });

  socket.on(
    'profile:update',
    (
      partial: { avatarColor?: string; avatarImage?: string | null; statusTag?: string },
      ack?: (res: { ok: boolean; user?: unknown; error?: string }) => void
    ) => {
      try {
        const updated = accountStore.updateProfile(socket.data.accountId, partial || {});
        for (const p of users.values()) {
          if (p.userId === updated.id) {
            p.avatarColor = updated.avatarColor;
            p.avatarImage = updated.avatarImage;
            p.statusTag = updated.statusTag;
          }
        }
        broadcastPresence();
        broadcastMembers();
        if (typeof ack === 'function') ack({ ok: true, user: updated });
      } catch (err) {
        const message = err instanceof AccountError ? err.message : 'Profil güncellenemedi.';
        if (typeof ack === 'function') ack({ ok: false, error: message });
      }
    }
  );

  socket.on('voice:speaking', (isSpeaking: boolean) => {
    const existing = users.get(socket.id);
    if (!existing) return;
    if (existing.isSpeaking !== isSpeaking) {
      existing.isSpeaking = isSpeaking;
      io.emit('voice:userSpeaking', {
        socketId: socket.id,
        userId: existing.userId,
        isSpeaking,
      });
    }
  });

  // Ses kanalına katılma (minRankLevel RBAC kontrolü ile; forceMoved ise kilit aşılır)
  socket.on('voice:join', (payload: string | { channelId: string; forceMoved?: boolean }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const channelId = typeof payload === 'string' ? payload : payload?.channelId;
    const forceMoved = typeof payload === 'object' && Boolean(payload?.forceMoved);

    const channel = DEFAULT_CHANNELS.find((c) => c.id === channelId && c.type === 'voice');
    if (!channel) return;

    const minLevel = channel.minRankLevel ?? 1;
    if (!forceMoved && user.rankLevel < minLevel) {
      socket.emit('voice:joinDenied', {
        channelId,
        message:
          'Bu odaya girmek için yetkiniz yetersiz — Sadece üst rütbeler girebilir veya bir yönetici sizi çekebilir',
      });
      return;
    }

    switchSocketVoiceChannel(socket, channelId);
  });

  socket.on('voice:leave', () => {
    disconnectSocketFromVoice(socket);
  });

  // ───────────── LEADER / ADMIN YÖNETİM KOMUTLARI (RBAC) ─────────────

  // 1. "Yanıma Çek" veya "Başka Odaya Taşı" (Kanal kilidini aşar)
  socket.on(
    'admin:moveUser',
    (
      payload: { targetUserId: string; targetChannelId: string },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const actor = users.get(socket.id);
      if (!actor || actor.rankLevel < RANK_LEVELS.ADMIN) {
        ack?.({ ok: false, error: 'Bu işlem için ADMIN veya LEADER yetkisi gerekir.' });
        return;
      }

      const channel = DEFAULT_CHANNELS.find(
        (c) => c.id === payload?.targetChannelId && c.type === 'voice'
      );
      if (!channel) {
        ack?.({ ok: false, error: 'Hedef ses kanalı bulunamadı.' });
        return;
      }

      const targetEntries = Array.from(users.entries()).filter(
        ([, u]) => u.userId === payload.targetUserId
      );
      if (targetEntries.length === 0) {
        ack?.({ ok: false, error: 'Kullanıcı şu an çevrimiçi değil.' });
        return;
      }

      for (const [targetSocketId] of targetEntries) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          // Hedef istemciye zorunlu oda geçiş komutunu gönder (mikrofonu kapalıysa açıp odaya bağlar)
          targetSocket.emit('voice:forceMoved', {
            channelId: channel.id,
            channelName: channel.name,
            movedBy: actor.username,
          });
        }
      }

      ack?.({ ok: true });
    }
  );

  // 2. "Odadan At (Disconnect from Voice)"
  socket.on(
    'admin:kickVoice',
    (
      payload: { targetUserId: string },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const actor = users.get(socket.id);
      if (!actor || actor.rankLevel < RANK_LEVELS.ADMIN) {
        ack?.({ ok: false, error: 'Bu işlem için ADMIN veya LEADER yetkisi gerekir.' });
        return;
      }

      const targetEntries = Array.from(users.entries()).filter(
        ([, u]) => u.userId === payload?.targetUserId
      );

      for (const [targetSocketId, targetPresence] of targetEntries) {
        // Bir ADMIN, LEADER'ı odadan atamaz
        if (actor.rank !== 'LEADER' && targetPresence.rank === 'LEADER') {
          ack?.({ ok: false, error: 'LEADER ses kanalından atılamaz.' });
          return;
        }
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          disconnectSocketFromVoice(targetSocket);
          targetSocket.emit('voice:forceKicked', {
            kickedBy: actor.username,
          });
        }
      }

      ack?.({ ok: true });
    }
  );

  // 3. "Rütbe Ver (Set Rank)" — Kalıcı olarak users.json'a kaydedilir ve anında herkese yayınlanır
  socket.on(
    'admin:setRank',
    (
      payload: { targetUserId: string; rank: RankRole },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      try {
        const updated = accountStore.setRank(
          socket.data.accountId,
          payload?.targetUserId,
          payload?.rank
        );

        for (const [sid, p] of users.entries()) {
          if (p.userId === updated.id) {
            p.rank = updated.rank;
            p.rankLevel = updated.rankLevel;
            const s = io.sockets.sockets.get(sid);
            s?.emit('profile:rankUpdated', {
              user: updated,
            });
          }
        }

        broadcastPresence();
        broadcastMembers();
        ack?.({ ok: true });
      } catch (err) {
        const message = err instanceof AccountError ? err.message : 'Rütbe güncellenemedi.';
        ack?.({ ok: false, error: message });
      }
    }
  );

  // Birlikte İzle (🍿 Sinema & Yayın)
  socket.on(
    'watch:update',
    (payload: { videoId?: string; videoUrl?: string; isPlaying: boolean; currentTime: number }) => {
      const sender = users.get(socket.id);
      watchTogetherState = {
        videoId: payload.videoId ?? watchTogetherState.videoId,
        videoUrl: payload.videoUrl ?? watchTogetherState.videoUrl,
        isPlaying: Boolean(payload.isPlaying),
        currentTime: Math.max(0, Number(payload.currentTime) || 0),
        updatedAt: Date.now(),
        updatedBy: sender?.username || SYSTEM_USERNAME,
      };
      io.to('voice-sinema').emit('watch:sync', watchTogetherState);
    }
  );

  // Hazır Yoklaması (Ready Check)
  socket.on('readycheck:start', () => {
    const sender = users.get(socket.id);
    if (!sender || !sender.activeVoiceChannelId) return;

    const channelId = sender.activeVoiceChannelId;
    const rcState: ReadyCheckState = {
      channelId,
      initiatedBy: sender.username,
      startedAt: Date.now(),
      readyUserIds: [sender.userId],
    };
    readyChecksByChannel.set(channelId, rcState);
    io.to(channelId).emit('readycheck:started', rcState);
  });

  socket.on('readycheck:confirm', () => {
    const sender = users.get(socket.id);
    if (!sender || !sender.activeVoiceChannelId) return;

    const channelId = sender.activeVoiceChannelId;
    const rcState = readyChecksByChannel.get(channelId);
    if (!rcState) return;

    if (!rcState.readyUserIds.includes(sender.userId)) {
      rcState.readyUserIds.push(sender.userId);
    }
    io.to(channelId).emit('readycheck:state', rcState);
  });

  socket.on('readycheck:clear', () => {
    const sender = users.get(socket.id);
    if (!sender || !sender.activeVoiceChannelId) return;

    const channelId = sender.activeVoiceChannelId;
    readyChecksByChannel.delete(channelId);
    io.to(channelId).emit('readycheck:state', null);
  });

  // WebRTC sinyal aktarımı
  socket.on('webrtc:offer', (payload: { targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
    io.to(payload.targetSocketId).emit('webrtc:offer', {
      fromSocketId: socket.id,
      fromUser: users.get(socket.id),
      sdp: payload.sdp,
    });
  });

  socket.on('webrtc:answer', (payload: { targetSocketId: string; sdp: RTCSessionDescriptionInit }) => {
    io.to(payload.targetSocketId).emit('webrtc:answer', {
      fromSocketId: socket.id,
      sdp: payload.sdp,
    });
  });

  socket.on('webrtc:ice-candidate', (payload: { targetSocketId: string; candidate: RTCIceCandidateInit }) => {
    io.to(payload.targetSocketId).emit('webrtc:ice-candidate', {
      fromSocketId: socket.id,
      candidate: payload.candidate,
    });
  });

  // Yazılı sohbet ve emoji tepkileri
  socket.on('chat:send', (payload: { channelId: string; content: string }) => {
    const sender = users.get(socket.id);
    if (!sender || typeof payload?.content !== 'string' || !payload.content.trim()) return;

    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channelId: payload.channelId,
      userId: sender.userId,
      username: sender.username,
      rank: sender.rank,
      avatarColor: sender.avatarColor,
      content: payload.content.trim().slice(0, 4000),
      timestamp: new Date().toISOString(),
      reactions: [],
    };

    if (!messagesByChannel[payload.channelId]) {
      messagesByChannel[payload.channelId] = [];
    }
    messagesByChannel[payload.channelId].push(msg);
    if (messagesByChannel[payload.channelId].length > 200) {
      messagesByChannel[payload.channelId].shift();
    }

    io.emit('chat:message', msg);
  });

  socket.on('chat:react', (payload: { channelId: string; messageId: string; emoji: string }) => {
    const sender = users.get(socket.id);
    if (!sender) return;

    const channelMsgs = messagesByChannel[payload.channelId];
    const msg = channelMsgs?.find((m) => m.id === payload.messageId);
    if (!msg) return;

    let reaction = msg.reactions.find((r) => r.emoji === payload.emoji);
    if (!reaction) {
      reaction = { emoji: payload.emoji, users: [sender.username] };
      msg.reactions.push(reaction);
    } else {
      const idx = reaction.users.indexOf(sender.username);
      if (idx >= 0) {
        reaction.users.splice(idx, 1);
        if (reaction.users.length === 0) {
          msg.reactions = msg.reactions.filter((r) => r.emoji !== payload.emoji);
        }
      } else {
        reaction.users.push(sender.username);
      }
    }

    io.emit('chat:reactionUpdated', {
      channelId: payload.channelId,
      messageId: payload.messageId,
      reactions: msg.reactions,
    });
  });

  // 📌 Mesaj Sabitleme / Sabitlemeyi Kaldırma (Pinned Messages)
  socket.on(
    'chat:togglePin',
    (payload: { channelId: string; messageId: string }) => {
      const sender = users.get(socket.id);
      if (!sender) return;

      const channelMsgs = messagesByChannel[payload?.channelId];
      const msg = channelMsgs?.find((m) => m.id === payload?.messageId);
      if (!msg) return;

      msg.pinned = !msg.pinned;
      msg.pinnedBy = msg.pinned ? sender.username : undefined;

      io.emit('chat:pinUpdated', {
        channelId: payload.channelId,
        messageId: payload.messageId,
        pinned: Boolean(msg.pinned),
        pinnedBy: msg.pinnedBy,
      });
    }
  );

  // 📊 Canlı Ekip Anketleri (Squad Polls)
  socket.on(
    'poll:create',
    (payload: { channelId: string; question: string; options: string[] }) => {
      const sender = users.get(socket.id);
      if (!sender || !payload?.channelId || !payload?.question?.trim()) return;

      const cleanOptions = (payload.options || [])
        .map((o) => String(o || '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 6);
      if (cleanOptions.length < 2) return;

      const poll: SquadPoll = {
        id: `poll-${Date.now()}`,
        channelId: payload.channelId,
        question: payload.question.trim().slice(0, 160),
        options: cleanOptions.map((text, idx) => ({
          id: `opt-${idx + 1}`,
          text,
          voterNames: [],
        })),
        createdBy: sender.username,
        createdAt: new Date().toISOString(),
      };

      pollsByChannel[payload.channelId] = poll;
      io.emit('poll:updated', {
        channelId: payload.channelId,
        poll,
      });
    }
  );

  socket.on(
    'poll:vote',
    (payload: { channelId: string; optionId: string }) => {
      const sender = users.get(socket.id);
      if (!sender || !payload?.channelId || !payload?.optionId) return;

      const poll = pollsByChannel[payload.channelId];
      if (!poll) return;

      const targetOpt = poll.options.find((o) => o.id === payload.optionId);
      if (!targetOpt) return;

      const alreadyVotedThis = targetOpt.voterNames.includes(sender.username);
      for (const opt of poll.options) {
        opt.voterNames = opt.voterNames.filter((n) => n !== sender.username);
      }
      if (!alreadyVotedThis) {
        targetOpt.voterNames.push(sender.username);
      }

      io.emit('poll:updated', {
        channelId: payload.channelId,
        poll,
      });
    }
  );

  socket.on('poll:close', (payload: { channelId: string }) => {
    const sender = users.get(socket.id);
    if (!sender || !payload?.channelId) return;

    pollsByChannel[payload.channelId] = null;
    io.emit('poll:updated', {
      channelId: payload.channelId,
      poll: null,
    });
  });

  socket.on('telemetry:ping', (clientTimestamp: number, callback?: (serverTime: number) => void) => {
    if (typeof callback === 'function') callback(clientTimestamp);
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;
    if (user.activeVoiceChannelId) {
      socket.to(user.activeVoiceChannelId).emit('webrtc:peer-left', {
        socketId: socket.id,
        userId: user.userId,
      });
    }
    users.delete(socket.id);
    broadcastPresence();
    broadcastMembers();
  });
});

function shutdown() {
  try {
    accountStore.flushSync();
  } catch {
    // yoksay
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLanIpAddresses();
  console.log(`\n=============================================================`);
  console.log(`⚡ SOKAK sunucusu 0.0.0.0:${PORT} üzerinde dinliyor`);
  console.log(`   Yerel:  http://localhost:${PORT}`);
  lanIps.forEach((ip) => console.log(`   LAN:    http://${ip}:${PORT}`));
  console.log(`   Kayıtlı hesap sayısı: ${accountStore.listAll().length}`);
  console.log(`=============================================================\n`);
});
