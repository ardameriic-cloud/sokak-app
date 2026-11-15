import { io, Socket } from 'socket.io-client';
import { useSokakStore, isUiFrozenForGame } from '../store/useSokakStore';
import { soundFX } from './soundFX';
import {
  AccountPublic,
  ChannelDef,
  ChatMessage,
  ChatReaction,
  MemberEntry,
  RankRole,
  ReadyCheckState,
  SquadPoll,
  UserPresence,
  WatchTogetherState,
} from '../types/sokak';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerAudioPipeline {
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  audioElement: HTMLAudioElement;
}

class RealTimeEngine {
  private socket: Socket | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private peerUserIds = new Map<string, string>(); // socketId -> userId
  private peerAudioPipelines = new Map<string, PeerAudioPipeline>();

  private audioContext: AudioContext | null = null;
  private rawMicStream: MediaStream | null = null;
  private processedMicStream: MediaStream | null = null;
  private micGainGateNode: GainNode | null = null;
  private micAnalyserNode: AnalyserNode | null = null;
  private noiseGateIntervalId: number | null = null;
  private telemetryIntervalId: number | null = null;
  private lastBytesSent = 0;
  private lastStatsTimestamp = 0;

  public connect(customServerUrl?: string) {
    const store = useSokakStore.getState();
    const token = store.authToken;
    if (!token) return;

    const targetUrl = (customServerUrl || store.serverUrl).trim();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    const socket = io(targetUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      auth: { token },
    });

    this.socket = socket;

    socket.on('connect', () => {
      const current = useSokakStore.getState();
      current.setConnectionState(true, null);
      if (current.activeGame) {
        socket.emit('user:updateState', { activeGame: current.activeGame });
      }
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        this.disconnect();
        useSokakStore
          .getState()
          .clearSession('Oturum süresi doldu, lütfen tekrar giriş yapın.');
        return;
      }
      useSokakStore
        .getState()
        .setConnectionState(
          false,
          `Sunucuya bağlanılamadı (${targetUrl}): ${err.message}`
        );
    });

    socket.on('disconnect', () => {
      useSokakStore.getState().setConnectionState(false, null);
    });

    socket.on(
      'server:init',
      (payload: {
        channels: ChannelDef[];
        messagesByChannel: Record<string, ChatMessage[]>;
        users: UserPresence[];
        members?: MemberEntry[];
        lanIps: string[];
        watchTogether?: WatchTogetherState;
        me?: AccountPublic;
      }) => {
        useSokakStore.getState().setServerInitData(payload);
      }
    );

    socket.on('presence:update', (users: UserPresence[]) => {
      useSokakStore.getState().setUsers(users);
      users.forEach((u) => {
        this.peerUserIds.set(u.socketId, u.userId);
      });
      this.syncAllPeerVolumes();
    });

    socket.on('members:update', (members: MemberEntry[]) => {
      useSokakStore.getState().setMembers(members);
    });

    socket.on('profile:rankUpdated', (payload: { user: AccountPublic }) => {
      if (payload?.user) {
        useSokakStore.getState().updateCurrentUser(payload.user);
        useSokakStore
          .getState()
          .showToast(
            `Rütbeniz ${payload.user.rank} olarak güncellendi.`,
            'info'
          );
      }
    });

    socket.on(
      'voice:userSpeaking',
      (payload: { socketId: string; userId: string; isSpeaking: boolean }) => {
        useSokakStore
          .getState()
          .updateUserSpeaking(payload.socketId, payload.isSpeaking);
      }
    );

    socket.on(
      'voice:joinDenied',
      (payload: { channelId: string; message: string }) => {
        useSokakStore
          .getState()
          .showToast(
            payload?.message ||
              'Bu odaya girmek için yetkiniz yetersiz — Sadece üst rütbeler girebilir veya bir yönetici sizi çekebilir',
            'warning'
          );
      }
    );

    // LEADER / ADMIN tarafından zorunlu oda değişikliği ("Yanıma Çek" / "Başka Odaya Taşı")
    socket.on(
      'voice:forceMoved',
      async (payload: {
        channelId: string;
        channelName: string;
        movedBy: string;
      }) => {
        if (!payload?.channelId) return;
        await this.joinVoiceChannel(payload.channelId, true);
        useSokakStore
          .getState()
          .showToast(
            `${payload.movedBy} sizi "${payload.channelName}" odasına taşıdı.`,
            'info'
          );
      }
    );

    // LEADER / ADMIN tarafından ses kanalından çıkarılma ("Odadan At")
    socket.on('voice:forceKicked', (payload: { kickedBy: string }) => {
      this.leaveVoiceChannel(true);
      useSokakStore
        .getState()
        .showToast(
          `${payload?.kickedBy || 'Yönetici'} sizi ses kanalından çıkardı.`,
          'warning'
        );
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      useSokakStore.getState().appendChatMessage(msg);
    });

    socket.on(
      'chat:reactionUpdated',
      (payload: {
        channelId: string;
        messageId: string;
        reactions: ChatReaction[];
      }) => {
        useSokakStore
          .getState()
          .updateMessageReactions(
            payload.channelId,
            payload.messageId,
            payload.reactions
          );
      }
    );

    socket.on(
      'chat:pinUpdated',
      (payload: {
        channelId: string;
        messageId: string;
        pinned: boolean;
        pinnedBy?: string;
      }) => {
        useSokakStore
          .getState()
          .updateMessagePin(
            payload.channelId,
            payload.messageId,
            payload.pinned,
            payload.pinnedBy
          );
        if (payload.pinned) {
          soundFX.playPinOrPoll();
        }
      }
    );

    socket.on(
      'poll:updated',
      (payload: { channelId: string; poll: SquadPoll | null }) => {
        const prev = useSokakStore.getState().pollsByChannel[payload.channelId];
        useSokakStore
          .getState()
          .setChannelPoll(payload.channelId, payload.poll);
        if (!prev && payload.poll) {
          soundFX.playPinOrPoll();
        }
      }
    );

    // 1. Birlikte İzle (Watch Together) Senkronizasyonu
    socket.on('watch:sync', (state: WatchTogetherState) => {
      useSokakStore.getState().setWatchTogether(state);
    });

    // 2. Hazır Yoklaması (Ready Check)
    socket.on('readycheck:started', (state: ReadyCheckState) => {
      useSokakStore.getState().setActiveReadyCheck(state);
      soundFX.playReadyCheck();
    });

    socket.on('readycheck:state', (state: ReadyCheckState | null) => {
      useSokakStore.getState().setActiveReadyCheck(state);
    });

    // WebRTC Mesh Sinyal Olayları
    socket.on(
      'webrtc:room-peers',
      async (payload: { channelId: string; peers: UserPresence[] }) => {
        for (const peer of payload.peers) {
          this.peerUserIds.set(peer.socketId, peer.userId);
          await this.initiateOfferToPeer(peer.socketId);
        }
      }
    );

    socket.on('webrtc:peer-joined', (payload: { peer: UserPresence }) => {
      this.peerUserIds.set(payload.peer.socketId, payload.peer.userId);
      soundFX.playUserJoin();
    });

    socket.on(
      'webrtc:peer-left',
      (payload: { socketId: string; userId: string }) => {
        this.closePeerConnection(payload.socketId);
        soundFX.playUserLeave();
      }
    );

    socket.on(
      'webrtc:offer',
      async (payload: {
        fromSocketId: string;
        fromUser?: UserPresence;
        sdp: RTCSessionDescriptionInit;
      }) => {
        if (payload.fromUser) {
          this.peerUserIds.set(payload.fromSocketId, payload.fromUser.userId);
        }
        await this.handleRemoteOffer(payload.fromSocketId, payload.sdp);
      }
    );

    socket.on(
      'webrtc:answer',
      async (payload: {
        fromSocketId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        const pc = this.peerConnections.get(payload.fromSocketId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } catch (err) {
          console.warn('Uzak SDP cevabı ayarlanamadı:', err);
        }
      }
    );

    socket.on(
      'webrtc:ice-candidate',
      async (payload: {
        fromSocketId: string;
        candidate: RTCIceCandidateInit;
      }) => {
        const pc = this.peerConnections.get(payload.fromSocketId);
        if (!pc || !payload.candidate) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.warn('ICE adayı eklenemedi:', err);
        }
      }
    );
  }

  public disconnect() {
    this.leaveVoiceChannel();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public getSocketId(): string | null {
    return this.socket?.id || null;
  }

  public updateProfileOnServer(partial: {
    avatarColor?: string;
    avatarImage?: string | null;
    statusTag?: string;
  }): Promise<{ ok: boolean; user?: AccountPublic; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({ ok: false, error: 'Sunucu bağlantısı yok.' });
        return;
      }
      this.socket.emit(
        'profile:update',
        partial,
        (res: { ok: boolean; user?: AccountPublic; error?: string }) => {
          if (res?.ok && res.user) {
            useSokakStore.getState().updateCurrentUser(res.user);
          }
          resolve(res || { ok: false });
        }
      );
    });
  }

  // ───────────── LEADER / ADMIN Eylemleri ─────────────

  public adminMoveUser(targetUserId: string, targetChannelId: string) {
    this.socket?.emit(
      'admin:moveUser',
      { targetUserId, targetChannelId },
      (res?: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) {
          useSokakStore.getState().showToast(res.error, 'warning');
        }
      }
    );
  }

  public adminKickFromVoice(targetUserId: string) {
    this.socket?.emit(
      'admin:kickVoice',
      { targetUserId },
      (res?: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) {
          useSokakStore.getState().showToast(res.error, 'warning');
        }
      }
    );
  }

  public adminSetUserRank(targetUserId: string, rank: RankRole) {
    this.socket?.emit(
      'admin:setRank',
      { targetUserId, rank },
      (res?: { ok: boolean; error?: string }) => {
        if (res && !res.ok && res.error) {
          useSokakStore.getState().showToast(res.error, 'warning');
        } else if (res?.ok) {
          useSokakStore
            .getState()
            .showToast(`Kullanıcı rütbesi ${rank} olarak kaydedildi.`, 'success');
        }
      }
    );
  }

  public updateDetectedGame(gameName: string | null) {
    const store = useSokakStore.getState();
    if (store.activeGame !== gameName) {
      store.setActiveGame(gameName);
      this.socket?.emit('user:updateState', { activeGame: gameName });
    }
  }

  public emitWatchTogetherUpdate(payload: {
    videoId?: string;
    videoUrl?: string;
    isPlaying: boolean;
    currentTime: number;
  }) {
    this.socket?.emit('watch:update', payload);
  }

  public startReadyCheck() {
    this.socket?.emit('readycheck:start');
  }

  public confirmReadyCheck() {
    soundFX.playReadyCheck();
    this.socket?.emit('readycheck:confirm');
  }

  public clearReadyCheck() {
    this.socket?.emit('readycheck:clear');
  }

  public sendChatMessage(channelId: string, content: string) {
    this.socket?.emit('chat:send', { channelId, content });
  }

  public toggleMessageReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ) {
    this.socket?.emit('chat:react', { channelId, messageId, emoji });
  }

  public togglePinMessage(channelId: string, messageId: string) {
    this.socket?.emit('chat:togglePin', { channelId, messageId });
  }

  public createPoll(channelId: string, question: string, options: string[]) {
    this.socket?.emit('poll:create', { channelId, question, options });
  }

  public votePoll(channelId: string, optionId: string) {
    this.socket?.emit('poll:vote', { channelId, optionId });
  }

  public closePoll(channelId: string) {
    this.socket?.emit('poll:close', { channelId });
  }

  private optimizeOpusSdp(sdp: string): string {
    if (!sdp) return sdp;
    const lines = sdp.split('\r\n');
    let opusPayloadType: string | null = null;

    for (const line of lines) {
      const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000\/2/i);
      if (match) {
        opusPayloadType = match[1];
        break;
      }
    }

    if (!opusPayloadType) return sdp;

    const opusParams =
      'stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=1;useinbandfec=1;usedtx=0';
    let fmtpFound = false;

    const updatedLines = lines.map((line) => {
      if (line.startsWith(`a=fmtp:${opusPayloadType} `)) {
        fmtpFound = true;
        return `${line};${opusParams}`;
      }
      return line;
    });

    if (!fmtpFound) {
      const rtpmapIdx = updatedLines.findIndex((l) =>
        l.startsWith(`a=rtpmap:${opusPayloadType} `)
      );
      if (rtpmapIdx !== -1) {
        updatedLines.splice(
          rtpmapIdx + 1,
          0,
          `a=fmtp:${opusPayloadType} ${opusParams}`
        );
      }
    }

    return updatedLines.join('\r\n');
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioCtx({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  private async setupLocalMicPipeline(): Promise<MediaStream> {
    const store = useSokakStore.getState();
    const ctx = this.ensureAudioContext();

    if (this.rawMicStream) {
      this.rawMicStream.getTracks().forEach((t) => t.stop());
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2,
      sampleRate: 48000,
    };

    if (
      store.selectedAudioInputDeviceId &&
      store.selectedAudioInputDeviceId !== 'default'
    ) {
      audioConstraints.deviceId = { exact: store.selectedAudioInputDeviceId };
    }

    try {
      this.rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    } catch {
      try {
        this.rawMicStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch {
        const dest = ctx.createMediaStreamDestination();
        this.rawMicStream = dest.stream;
      }
    }

    const source = ctx.createMediaStreamSource(this.rawMicStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.25;

    const gateGain = ctx.createGain();
    gateGain.gain.value = 1.0;

    const destination = ctx.createMediaStreamDestination();

    source.connect(analyser);
    source.connect(gateGain);
    gateGain.connect(destination);

    this.micAnalyserNode = analyser;
    this.micGainGateNode = gateGain;
    this.processedMicStream = destination.stream;

    this.startNoiseGateLoop();
    return this.processedMicStream;
  }

  private startNoiseGateLoop() {
    if (this.noiseGateIntervalId) {
      window.clearInterval(this.noiseGateIntervalId);
    }

    const timeDomainBuffer = new Float32Array(512);

    this.noiseGateIntervalId = window.setInterval(() => {
      const state = useSokakStore.getState();
      if (!this.micAnalyserNode || !this.micGainGateNode || !this.audioContext) {
        return;
      }

      if (state.isMuted || state.isDeafened) {
        this.micGainGateNode.gain.setTargetAtTime(
          0,
          this.audioContext.currentTime,
          0.01
        );
        if (state.isSpeaking) {
          state.setSpeaking(false);
          this.socket?.emit('voice:speaking', false);
        }
        if (!isUiFrozenForGame(state)) {
          state.setCurrentInputLevelDb(-90);
        }
        return;
      }

      this.micAnalyserNode.getFloatTimeDomainData(timeDomainBuffer);
      let sumSquares = 0;
      for (let i = 0; i < timeDomainBuffer.length; i++) {
        sumSquares += timeDomainBuffer[i] * timeDomainBuffer[i];
      }
      const rms = Math.sqrt(sumSquares / timeDomainBuffer.length);
      const db = Math.max(-90, Math.round(20 * Math.log10(Math.max(rms, 1e-5))));

      if (!isUiFrozenForGame(state) && state.isSettingsModalOpen) {
        state.setCurrentInputLevelDb(db);
      }

      const gateOpen = db >= state.noiseGateThresholdDb;
      const targetGain = gateOpen ? 1.0 : 0.0;

      this.micGainGateNode.gain.setTargetAtTime(
        targetGain,
        this.audioContext.currentTime,
        gateOpen ? 0.008 : 0.04
      );

      if (state.isSpeaking !== gateOpen) {
        state.setSpeaking(gateOpen);
        this.socket?.emit('voice:speaking', gateOpen);
      }
    }, 65);
  }

  public async joinVoiceChannel(channelId: string, forceMoved = false) {
    const store = useSokakStore.getState();
    if (store.activeVoiceChannelId === channelId) return;

    const targetChannel = store.channels.find((c) => c.id === channelId);
    const minRank = targetChannel?.minRankLevel ?? 1;

    // İstemci tarafı RBAC kanal kilidi kontrolü (Yönetici çekmediyse engelle ve bildirim göster)
    if (!forceMoved && store.rankLevel < minRank) {
      store.showToast(
        'Bu odaya girmek için yetkiniz yetersiz — Sadece üst rütbeler girebilir veya bir yönetici sizi çekebilir',
        'warning'
      );
      return;
    }

    this.cleanupAllPeerConnections();
    await this.setupLocalMicPipeline();

    store.setActiveVoiceChannel(channelId);
    if (channelId === 'voice-afk') {
      store.setMuted(true);
      store.setDeafened(true);
    }

    soundFX.playUserJoin();
    this.socket?.emit('voice:join', { channelId, forceMoved });
    this.startTelemetryLoop();
  }

  public leaveVoiceChannel(skipEmit = false) {
    const store = useSokakStore.getState();
    if (!store.activeVoiceChannelId) return;

    this.stopScreenShare();
    if (!skipEmit) {
      this.socket?.emit('voice:leave');
    }
    this.cleanupAllPeerConnections();

    if (this.noiseGateIntervalId) {
      window.clearInterval(this.noiseGateIntervalId);
      this.noiseGateIntervalId = null;
    }
    if (this.telemetryIntervalId) {
      window.clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
    if (this.rawMicStream) {
      this.rawMicStream.getTracks().forEach((t) => t.stop());
      this.rawMicStream = null;
    }

    store.setActiveVoiceChannel(null);
    store.setSpeaking(false);
    soundFX.playUserLeave();
  }

  public toggleMute() {
    const store = useSokakStore.getState();
    const nextMuted = !store.isMuted;
    store.setMuted(nextMuted);
    if (!nextMuted && store.isDeafened) {
      store.setDeafened(false);
    }
    soundFX.playMute(nextMuted);
    this.socket?.emit('user:updateState', {
      isMuted: useSokakStore.getState().isMuted,
      isDeafened: useSokakStore.getState().isDeafened,
    });
    this.syncAllPeerVolumes();
  }

  public toggleDeafen() {
    const store = useSokakStore.getState();
    const nextDeafened = !store.isDeafened;
    store.setDeafened(nextDeafened);
    soundFX.playDeafen(nextDeafened);
    this.socket?.emit('user:updateState', {
      isMuted: useSokakStore.getState().isMuted,
      isDeafened: useSokakStore.getState().isDeafened,
    });
    this.syncAllPeerVolumes();
  }

  private createPeerConnection(peerSocketId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(peerSocketId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerSocketId, pc);

    if (this.processedMicStream) {
      this.processedMicStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.processedMicStream!);
      });
    }

    const localScreen = useSokakStore.getState().localScreenStream;
    if (localScreen) {
      localScreen.getTracks().forEach((track) => {
        pc.addTrack(track, localScreen);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('webrtc:ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      if (event.track.kind === 'audio') {
        this.attachPeerAudioGainPipeline(peerSocketId, stream);
      }

      if (event.track.kind === 'video') {
        useSokakStore.getState().setRemoteStream(peerSocketId, stream);
        event.track.onended = () => {
          useSokakStore.getState().setRemoteStream(peerSocketId, null);
        };
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        useSokakStore.getState().setRemoteStream(peerSocketId, null);
      }
    };

    return pc;
  }

  private attachPeerAudioGainPipeline(
    peerSocketId: string,
    remoteStream: MediaStream
  ) {
    const ctx = this.ensureAudioContext();

    const prev = this.peerAudioPipelines.get(peerSocketId);
    if (prev) {
      try {
        prev.sourceNode.disconnect();
        prev.gainNode.disconnect();
        prev.audioElement.pause();
      } catch {
        // yoksay
      }
    }

    const audioEl = new Audio();
    audioEl.srcObject = remoteStream;
    audioEl.muted = true;
    audioEl.play().catch(() => {});

    const sourceNode = ctx.createMediaStreamSource(remoteStream);
    const gainNode = ctx.createGain();

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    this.peerAudioPipelines.set(peerSocketId, {
      sourceNode,
      gainNode,
      audioElement: audioEl,
    });

    this.syncPeerVolume(peerSocketId);
  }

  public syncPeerVolume(peerSocketId: string) {
    const pipeline = this.peerAudioPipelines.get(peerSocketId);
    if (!pipeline || !this.audioContext) return;

    const store = useSokakStore.getState();
    if (store.isDeafened) {
      pipeline.gainNode.gain.setTargetAtTime(
        0,
        this.audioContext.currentTime,
        0.015
      );
      return;
    }

    const userId = this.peerUserIds.get(peerSocketId);
    const pref = userId ? store.userVolumes[userId] : undefined;

    if (pref?.localMuted) {
      pipeline.gainNode.gain.setTargetAtTime(
        0,
        this.audioContext.currentTime,
        0.015
      );
    } else {
      const gainScalar = (pref ? pref.volume : 100) / 100;
      pipeline.gainNode.gain.setTargetAtTime(
        gainScalar,
        this.audioContext.currentTime,
        0.015
      );
    }
  }

  public syncAllPeerVolumes() {
    for (const socketId of this.peerAudioPipelines.keys()) {
      this.syncPeerVolume(socketId);
    }
  }

  private async initiateOfferToPeer(peerSocketId: string) {
    const pc = this.createPeerConnection(peerSocketId);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      const optimizedSdp = this.optimizeOpusSdp(offer.sdp || '');
      const finalOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: optimizedSdp,
      };
      await pc.setLocalDescription(finalOffer);
      this.socket?.emit('webrtc:offer', {
        targetSocketId: peerSocketId,
        sdp: finalOffer,
      });
    } catch (err) {
      console.error('WebRTC teklifi başlatılamadı:', err);
    }
  }

  private async handleRemoteOffer(
    fromSocketId: string,
    sdp: RTCSessionDescriptionInit
  ) {
    let pc = this.peerConnections.get(fromSocketId);
    if (!pc) {
      pc = this.createPeerConnection(fromSocketId);
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      const optimizedSdp = this.optimizeOpusSdp(answer.sdp || '');
      const finalAnswer: RTCSessionDescriptionInit = {
        type: answer.type,
        sdp: optimizedSdp,
      };
      await pc.setLocalDescription(finalAnswer);
      this.socket?.emit('webrtc:answer', {
        targetSocketId: fromSocketId,
        sdp: finalAnswer,
      });
    } catch (err) {
      console.error('Uzak teklif işlenemedi:', err);
    }
  }

  public async startScreenShare(sourceId: string, sourceName: string) {
    const store = useSokakStore.getState();

    if (!store.activeVoiceChannelId) {
      await this.joinVoiceChannel('voice-sinema');
    }

    try {
      let stream: MediaStream;

      if (window.sokakDesktop) {
        await window.sokakDesktop.selectDesktopSource(sourceId);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
              },
            } as unknown as MediaTrackConstraints,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                minFrameRate: 60,
                maxFrameRate: 60,
              },
            } as unknown as MediaTrackConstraints,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                minFrameRate: 60,
                maxFrameRate: 60,
              },
            } as unknown as MediaTrackConstraints,
          });
        }
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 60, max: 60 },
          },
          audio: true,
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = 'motion';
        }
        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      store.setLocalScreenStream(stream);
      store.setScreenSharing(true, sourceName);
      store.setScreenPickerOpen(false);
      soundFX.playStreamStart();

      this.socket?.emit('user:updateState', { isScreenSharing: true });

      for (const [peerSocketId, pc] of this.peerConnections.entries()) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        await this.renegotiatePeer(peerSocketId, pc);
      }
    } catch (err) {
      console.error('1080p 60FPS ekran paylaşımı başlatılamadı:', err);
    }
  }

  public stopScreenShare() {
    const store = useSokakStore.getState();
    const localStream = store.localScreenStream;

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
        for (const pc of this.peerConnections.values()) {
          const sender = pc.getSenders().find((s) => s.track === track);
          if (sender) {
            pc.removeTrack(sender);
          }
        }
      });
    }

    store.setLocalScreenStream(null);
    store.setScreenSharing(false, null);
    this.socket?.emit('user:updateState', { isScreenSharing: false });

    for (const [peerSocketId, pc] of this.peerConnections.entries()) {
      this.renegotiatePeer(peerSocketId, pc).catch(() => {});
    }
  }

  private async renegotiatePeer(peerSocketId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer();
      const optimizedSdp = this.optimizeOpusSdp(offer.sdp || '');
      const finalOffer: RTCSessionDescriptionInit = {
        type: offer.type,
        sdp: optimizedSdp,
      };
      await pc.setLocalDescription(finalOffer);
      this.socket?.emit('webrtc:offer', {
        targetSocketId: peerSocketId,
        sdp: finalOffer,
      });
    } catch (err) {
      console.warn('Yeniden müzakere hatası:', err);
    }
  }

  private startTelemetryLoop() {
    if (this.telemetryIntervalId) {
      window.clearInterval(this.telemetryIntervalId);
    }

    this.telemetryIntervalId = window.setInterval(async () => {
      const state = useSokakStore.getState();

      const startTs = performance.now();
      this.socket?.emit('telemetry:ping', startTs, () => {
        const rtt = Math.max(1, Math.round(performance.now() - startTs));
        if (!isUiFrozenForGame(useSokakStore.getState())) {
          useSokakStore.getState().setTelemetry({ pingMs: rtt });
        }
        this.socket?.emit('user:updateState', { pingMs: rtt });
      });

      if (isUiFrozenForGame(state)) return;

      const firstPc = Array.from(this.peerConnections.values())[0];
      if (!firstPc) {
        state.setTelemetry({
          bitrateKbps: 128,
          packetLossPercent: 0.0,
        });
        return;
      }

      try {
        const stats = await firstPc.getStats();
        let bytesSent = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let currentRttMs: number | null = null;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            bytesSent += report.bytesSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
          }
          if (
            report.type === 'candidate-pair' &&
            report.state === 'succeeded' &&
            typeof report.currentRoundTripTime === 'number'
          ) {
            currentRttMs = Math.max(
              1,
              Math.round(report.currentRoundTripTime * 1000)
            );
          }
        });

        const now = performance.now();
        let bitrateKbps = 128;
        if (this.lastStatsTimestamp > 0 && bytesSent > this.lastBytesSent) {
          const elapsedSec = (now - this.lastStatsTimestamp) / 1000;
          const bitsPerSec = ((bytesSent - this.lastBytesSent) * 8) / elapsedSec;
          bitrateKbps = Math.min(
            512,
            Math.max(32, Math.round(bitsPerSec / 1000))
          );
        }
        this.lastBytesSent = bytesSent;
        this.lastStatsTimestamp = now;

        const totalPackets = packetsReceived + Math.max(0, packetsLost);
        const packetLossPercent =
          totalPackets > 0
            ? Number(((Math.max(0, packetsLost) / totalPackets) * 100).toFixed(1))
            : 0.0;

        state.setTelemetry({
          pingMs: currentRttMs ?? state.telemetry.pingMs,
          bitrateKbps,
          packetLossPercent,
        });
      } catch {
        // yoksay
      }
    }, 2000);
  }

  private closePeerConnection(peerSocketId: string) {
    const pc = this.peerConnections.get(peerSocketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerSocketId);
    }

    const pipeline = this.peerAudioPipelines.get(peerSocketId);
    if (pipeline) {
      try {
        pipeline.sourceNode.disconnect();
        pipeline.gainNode.disconnect();
        pipeline.audioElement.pause();
      } catch {
        // yoksay
      }
      this.peerAudioPipelines.delete(peerSocketId);
    }

    useSokakStore.getState().setRemoteStream(peerSocketId, null);
  }

  private cleanupAllPeerConnections() {
    for (const socketId of Array.from(this.peerConnections.keys())) {
      this.closePeerConnection(socketId);
    }
    useSokakStore.getState().clearRemoteStreams();
  }
}

export const rtcEngine = new RealTimeEngine();
