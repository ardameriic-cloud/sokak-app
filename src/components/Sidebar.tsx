import React, { useEffect, useState } from 'react';
import {
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Settings,
  Zap,
  MonitorUp,
  Radio,
  Signal,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Crosshair,
  X,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { getRankMeta, THEME_ACCENT_PRESETS, UserPresence } from '../types/sokak';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { UserContextMenu, UserContextTarget } from './UserContextMenu';

interface ContextMenuState {
  x: number;
  y: number;
  target: UserContextTarget;
}

export const Sidebar: React.FC = () => {
  const channels = useSokakStore((s) => s.channels);
  const selectedTextChannelId = useSokakStore((s) => s.selectedTextChannelId);
  const activeVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const users = useSokakStore((s) => s.users);
  const members = useSokakStore((s) => s.members);
  const userId = useSokakStore((s) => s.userId);
  const username = useSokakStore((s) => s.username);
  const rank = useSokakStore((s) => s.rank);
  const rankLevel = useSokakStore((s) => s.rankLevel);
  const avatarColor = useSokakStore((s) => s.avatarColor);
  const avatarImage = useSokakStore((s) => s.avatarImage);
  const statusTag = useSokakStore((s) => s.statusTag);
  const activeGame = useSokakStore((s) => s.activeGame);
  const activeReadyCheck = useSokakStore((s) => s.activeReadyCheck);
  const isConnected = useSokakStore((s) => s.isConnected);

  const isMuted = useSokakStore((s) => s.isMuted);
  const isDeafened = useSokakStore((s) => s.isDeafened);
  const isSpeaking = useSokakStore((s) => s.isSpeaking);
  const isScreenSharing = useSokakStore((s) => s.isScreenSharing);
  const telemetry = useSokakStore((s) => s.telemetry);
  const callStartedAt = useSokakStore((s) => s.callStartedAt);

  const isGamingMode = useSokakStore((s) => s.isGamingMode);
  const isOverlayActive = useSokakStore((s) => s.isOverlayActive);
  const themeAccent = useSokakStore((s) => s.themeAccent);
  const isWindowFocused = useSokakStore((s) => s.isWindowFocused);
  const isWindowMinimized = useSokakStore((s) => s.isWindowMinimized);
  const userVolumes = useSokakStore((s) => s.userVolumes);

  const selectTextChannel = useSokakStore((s) => s.selectTextChannel);
  const setScreenPickerOpen = useSokakStore((s) => s.setScreenPickerOpen);
  const setSettingsModalOpen = useSokakStore((s) => s.setSettingsModalOpen);
  const setGamingMode = useSokakStore((s) => s.setGamingMode);
  const setOverlayActive = useSokakStore((s) => s.setOverlayActive);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const uiFrozen = isGamingMode || !isWindowFocused || isWindowMinimized;
  const selfRankMeta = getRankMeta(rank);
  const activePreset =
    THEME_ACCENT_PRESETS.find((p) => p.id === themeAccent) ||
    THEME_ACCENT_PRESETS[0];

  useEffect(() => {
    if (!callStartedAt || uiFrozen) return;
    const updateTimer = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    };
    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [callStartedAt, uiFrozen]);

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const rem = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${rem}`;
  };

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const handleToggleOverlay = async () => {
    if (window.sokakDesktop?.toggleOverlayWindow) {
      const res = await window.sokakDesktop.toggleOverlayWindow();
      setOverlayActive(res.visible);
    } else {
      setOverlayActive(!isOverlayActive);
    }
  };

  const handleUserRightClick = (e: React.MouseEvent, targetUser: UserPresence) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: {
        userId: targetUser.userId,
        username: targetUser.username,
        rank: targetUser.rank,
        avatarColor: targetUser.avatarColor,
        avatarImage: targetUser.avatarImage,
        activeVoiceChannelId: targetUser.activeVoiceChannelId,
        isOnline: true,
      },
    });
  };

  const activeVoiceChannelObj = channels.find((c) => c.id === activeVoiceChannelId);
  const activeVoiceOccupants = activeVoiceChannelId
    ? users.filter((u) => u.activeVoiceChannelId === activeVoiceChannelId)
    : [];
  const isSelfReady = Boolean(
    activeReadyCheck && activeReadyCheck.readyUserIds.includes(userId)
  );
  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <aside className="w-72 cyber-sidebar-surface border-r border-white/[0.07] flex flex-col h-full shrink-0 select-none">
      {/* SOL ÜST SOKAK MARKA BAŞLIĞI (Geometrik Amblem + Zümrüt/İndigo Vurgu + SOKAK ONLINE) */}
      <div className="h-14 px-3.5 border-b border-white/[0.07] flex items-center justify-between bg-[#07080C]/50">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Özel Geometrik Amblem */}
          <div
            className="w-8 h-8 rounded-md bg-[#12151F] flex items-center justify-center shrink-0 relative"
            style={{ border: `1px solid ${activePreset.color}66` }}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: activePreset.color }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
              <path d="M9 12l2 2 4-4" stroke="#5865F2" strokeWidth="2.4" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1
                className="text-sm font-black tracking-wider uppercase bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${activePreset.color} 0%, #5865F2 100%)`,
                }}
              >
                SOKAK
              </h1>
              <span
                className="px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold tracking-wider shrink-0"
                style={{
                  backgroundColor: `${activePreset.color}1F`,
                  border: `1px solid ${activePreset.color}59`,
                  color: activePreset.color,
                }}
              >
                {isConnected ? '● SOKAK ONLINE' : '○ BAĞLANIYOR'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tabular-nums truncate">
              {onlineCount} Çevrimiçi • {members.length} Kayıtlı Üye
            </p>
          </div>
        </div>

        <button
          onClick={() => setSettingsModalOpen(true)}
          className="p-1.5 rounded bg-[#12151F] hover:bg-[#1A1F2E] border border-white/[0.07] text-zinc-400 hover:text-zinc-100 shrink-0"
          title="Ses & Sunucu Ayarları"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Kanallar & Canlı Oda Listesi */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {/* METİN KANALLARI (Taktil Kartlar + 3px Sol Vurgu Çubuğu) */}
        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500">
              Metin Kanalları
            </span>
          </div>
          <div className="space-y-1">
            {textChannels.map((channel) => {
              const isSelected = channel.id === selectedTextChannelId;
              return (
                <button
                  key={channel.id}
                  onClick={() => selectTextChannel(channel.id)}
                  className={`group relative w-full flex items-center justify-between px-3 py-1.5 rounded text-left text-xs border gpu-safe-transition overflow-hidden ${
                    isSelected
                      ? 'cyber-text-active text-zinc-100 font-semibold border-white/[0.09]'
                      : 'text-zinc-400 hover:bg-[#12151F]/80 hover:text-zinc-200 border-transparent hover:border-white/[0.06]'
                  }`}
                >
                  {/* 3px Sol Vurgu Çubuğu */}
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                      isSelected
                        ? 'bg-[#5865F2]'
                        : 'bg-transparent group-hover:bg-[#5865F2]/50'
                    }`}
                  />
                  <div className="flex items-center gap-2 truncate pl-0.5">
                    <Hash
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-[#5865F2]' : 'text-zinc-500'
                      }`}
                    />
                    <span className="truncate">{channel.name}</span>
                  </div>
                  {channel.badge && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#07080C] text-zinc-400 border border-white/[0.07]">
                      {channel.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* SES KANALLARI & KİLİTLİ ODALAR (Taktil Kartlar + 3px #10B981 Sol Vurgu) */}
        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500">
              Ses Kanalları (Opus)
            </span>
            <div className="flex items-center gap-1.5">
              {activeVoiceChannelId && (
                <button
                  onClick={() => rtcEngine.startReadyCheck()}
                  className="px-2 py-0.5 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] text-[9px] font-bold tracking-wide uppercase flex items-center gap-1"
                  title="Odadaki herkes için Hazır Yoklaması başlat"
                >
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>Hazır Yoklaması</span>
                </button>
              )}
              {!activeVoiceChannelId && (
                <span className="text-[9px] font-mono text-zinc-500">
                  Sağ Tık: Yetki/Ses
                </span>
              )}
            </div>
          </div>

          {/* HAZIR YOKLAMASI BANNER */}
          {activeReadyCheck &&
            activeReadyCheck.channelId === activeVoiceChannelId && (
              <div className="mb-2 p-2.5 rounded bg-[#12151F] border border-[#10B981]/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[11px] font-bold text-zinc-100">
                      Hazır Yoklaması ({activeReadyCheck.readyUserIds.length}/
                      {Math.max(1, activeVoiceOccupants.length)})
                    </span>
                  </div>
                  <button
                    onClick={() => rtcEngine.clearReadyCheck()}
                    className="text-zinc-500 hover:text-zinc-300"
                    title="Yoklamayı Kapat"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-400 truncate">
                    {activeReadyCheck.initiatedBy} yoklama başlattı
                  </span>
                  <button
                    onClick={() => rtcEngine.confirmReadyCheck()}
                    disabled={isSelfReady}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                      isSelfReady
                        ? 'bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981]'
                        : 'bg-[#10B981] hover:bg-[#059669] text-zinc-950'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isSelfReady ? 'Hazırsın ✓' : 'Hazırım'}</span>
                  </button>
                </div>
              </div>
            )}

          <div className="space-y-1.5">
            {voiceChannels.map((channel) => {
              const isJoined = activeVoiceChannelId === channel.id;
              const minRank = channel.minRankLevel ?? 1;
              const isLockedForSelf = rankLevel < minRank && !isJoined;
              const occupants = users.filter(
                (u) => u.activeVoiceChannelId === channel.id
              );
              const hasLiveStream = occupants.some((u) => u.isScreenSharing);

              return (
                <div
                  key={channel.id}
                  className={`group relative rounded border overflow-hidden ${
                    isJoined
                      ? 'cyber-voice-active bg-[#12151F]/90 border-[#10B981]/35'
                      : isLockedForSelf
                      ? 'bg-[#07080C]/40 border-white/[0.05]'
                      : 'bg-[#07080C]/60 border-white/[0.07] hover:border-white/[0.12]'
                  }`}
                >
                  {/* 3px Sol Zümrüt Vurgu Çubuğu */}
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                      isJoined
                        ? 'bg-[#10B981]'
                        : isLockedForSelf
                        ? 'bg-amber-500/40'
                        : 'bg-transparent group-hover:bg-[#10B981]/60'
                    }`}
                  />

                  <button
                    onClick={() => rtcEngine.joinVoiceChannel(channel.id)}
                    className="w-full flex items-center justify-between pl-3.5 pr-2.5 py-2 text-left text-xs hover:bg-[#12151F]/70 rounded-t gpu-safe-transition"
                    title={
                      isLockedForSelf
                        ? 'Kilitli Kanal — Giriş için üst rütbe veya yönetici çekimi gerekir'
                        : channel.name
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isLockedForSelf ? (
                        <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <Volume2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isJoined ? 'text-[#10B981]' : 'text-zinc-400'
                          }`}
                        />
                      )}
                      <span
                        className={`truncate ${
                          isJoined
                            ? 'text-zinc-100 font-bold'
                            : isLockedForSelf
                            ? 'text-zinc-500 font-medium'
                            : 'text-zinc-200 font-medium'
                        }`}
                      >
                        {channel.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasLiveStream && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold tracking-wider uppercase">
                          CANLI
                        </span>
                      )}
                      {isLockedForSelf && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          KİLİTLİ
                        </span>
                      )}
                      <span className="text-[10px] font-mono tabular-nums text-zinc-400 px-1.5 py-0.5 rounded bg-[#07080C] border border-white/[0.07]">
                        {channel.bitrate || 128}k
                      </span>
                    </div>
                  </button>

                  {/* Odadaki Aktif Kullanıcılar */}
                  {occupants.length > 0 && (
                    <div className="pl-3 pr-2 pb-2 pt-1 space-y-1 border-t border-white/[0.06]">
                      {occupants.map((occ) => {
                        const isSelf = occ.userId === userId;
                        const occRankMeta = getRankMeta(occ.rank);
                        const volPref = userVolumes[occ.userId];
                        const userVol = volPref ? volPref.volume : 100;
                        const isLocalMuted = volPref?.localMuted ?? false;
                        const isUserReady = Boolean(
                          activeReadyCheck &&
                            activeReadyCheck.channelId === channel.id &&
                            activeReadyCheck.readyUserIds.includes(occ.userId)
                        );

                        return (
                          <div
                            key={occ.socketId}
                            onContextMenu={(e) => handleUserRightClick(e, occ)}
                            title={
                              isSelf
                                ? 'Sen'
                                : 'Sağ Tık: Ses Mikseri & Yönetici İşlemleri'
                            }
                            className="flex items-center justify-between px-2 py-1 rounded bg-[#0C0E14] hover:bg-[#12151F] border border-white/[0.06] cursor-context-menu"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar
                                username={occ.username}
                                color={occ.avatarColor}
                                image={occ.avatarImage}
                                size={24}
                                speaking={occ.isSpeaking}
                                ringOffsetColor="#0C0E14"
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="text-xs font-bold truncate"
                                    style={{ color: occRankMeta.color }}
                                  >
                                    {occ.username}
                                  </span>
                                  <RankBadge rank={occ.rank} />
                                  {isUserReady && (
                                    <span title="Hazır!" className="inline-flex shrink-0">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                                    </span>
                                  )}
                                  {!isSelf && userVol !== 100 && (
                                    <span className="text-[9px] font-mono tabular-nums text-[#5865F2]">
                                      {userVol}%
                                    </span>
                                  )}
                                  {isLocalMuted && (
                                    <span className="text-[9px] font-mono text-rose-400">
                                      [SUSTURULDU]
                                    </span>
                                  )}
                                </div>
                                {occ.activeGame && (
                                  <div className="text-[9px] text-[#10B981] truncate">
                                    🎮 {occ.activeGame} oynuyor
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Rozetler: CANLI, Susturuldu, Sağırlaştırıldı, Ping */}
                            <div className="flex items-center gap-1 shrink-0">
                              {occ.isScreenSharing && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold tracking-wider">
                                  CANLI
                                </span>
                              )}
                              {occ.isMuted && (
                                <MicOff className="w-3 h-3 text-rose-500" />
                              )}
                              {occ.isDeafened && (
                                <Headphones className="w-3 h-3 text-rose-500" />
                              )}
                              <span className="text-[9px] font-mono tabular-nums text-zinc-500 ml-0.5">
                                {occ.pingMs}ms
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ALT KOKPİT KOMUTA DOCK'U (#11141D + 1px solid rgba(255,255,255,0.1)) */}
      <div className="p-2.5 bg-[#07080C] border-t border-white/[0.07]">
        <div className="rounded-lg bg-[#11141D] border border-white/[0.10] p-2.5 space-y-2.5">
          {/* Canlı Ses Bağlantısı ve Ping/Bitrate Telemetri Rozeti */}
          {activeVoiceChannelId ? (
            <div className="pb-2 border-b border-white/[0.07] space-y-2">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Signal className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-[#10B981] flex items-center gap-1">
                      <span className="truncate">
                        {activeVoiceChannelObj?.name || 'Ses Kanalı'}
                      </span>
                      <span className="font-mono text-[9px] text-zinc-400 tabular-nums shrink-0">
                        ({formatCallTime(elapsedSeconds)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-[#07080C] border border-[#10B981]/30 text-[9px] font-mono font-bold tabular-nums text-[#10B981]">
                    {telemetry.pingMs}ms • {telemetry.bitrateKbps}k
                  </span>
                  <button
                    onClick={() => rtcEngine.leaveVoiceChannel()}
                    className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400"
                    title="Ses Kanalından Ayrıl"
                  >
                    <PhoneOff className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
              <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                SOKAK SES MOTORU HAZIR
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#07080C] border border-white/[0.07] text-[9px] font-mono tabular-nums text-[#10B981]">
                {telemetry.pingMs}ms • 128kbps
              </span>
            </div>
          )}

          {/* Kullanıcı Kimliği ve Rütbe Satırı */}
          <div className="flex items-center justify-between gap-2">
            <div
              onClick={() => setSettingsModalOpen(true)}
              className="flex items-center gap-2 min-w-0 cursor-pointer group"
              title="Hesap ve Ses Ayarlarını Aç"
            >
              <Avatar
                username={username}
                color={avatarColor}
                image={avatarImage}
                size={30}
                speaking={isSpeaking}
                ringOffsetColor="#11141D"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-bold truncate"
                    style={{ color: selfRankMeta.color }}
                  >
                    {username}
                  </span>
                  <RankBadge rank={rank} />
                </div>
                <div className="text-[9px] text-zinc-400 truncate flex items-center gap-1">
                  {activeGame ? (
                    <span className="text-[#10B981] truncate font-semibold">
                      🎮 {activeGame} oynuyor
                    </span>
                  ) : (
                    <>
                      <Radio className="w-2.5 h-2.5 text-[#10B981] shrink-0" />
                      <span className="truncate">{statusTag || 'Çevrimiçi'}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSettingsModalOpen(true)}
              className="p-1.5 rounded bg-[#07080C] hover:bg-[#191E2B] border border-white/[0.08] text-zinc-300 hover:text-white shrink-0"
              title="Hesap, Ses ve Sunucu Ayarları"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Renk Kodlu Kokpit Hap (Pill) Butonları: Mic, Deafen, Screen Share, Overlay (🎯 HUD), Gaming Mode (⚡) */}
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {/* 1. Mikrofon */}
            <button
              onClick={() => rtcEngine.toggleMute()}
              className={`px-1.5 py-1.5 rounded text-[9px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 border ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                  : 'bg-[#07080C] hover:bg-[#161B26] border-white/[0.08] text-zinc-200'
              }`}
              title="Mikrofonu Sustur / Aç (Ctrl+Shift+M)"
            >
              {isMuted ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-[#10B981]" />
              )}
              <span>{isMuted ? 'SUSTU' : 'MİK'}</span>
            </button>

            {/* 2. Kulaklık (Deafen) */}
            <button
              onClick={() => rtcEngine.toggleDeafen()}
              className={`px-1.5 py-1.5 rounded text-[9px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 border ${
                isDeafened
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                  : 'bg-[#07080C] hover:bg-[#161B26] border-white/[0.08] text-zinc-200'
              }`}
              title="Kulaklığı Sağırlaştır (Ctrl+Shift+D)"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{isDeafened ? 'SAĞIR' : 'SES'}</span>
            </button>

            {/* 3. Yayın / Ekran Paylaşımı */}
            <button
              onClick={() => {
                if (isScreenSharing) {
                  rtcEngine.stopScreenShare();
                } else {
                  setScreenPickerOpen(true);
                }
              }}
              className={`px-1.5 py-1.5 rounded text-[9px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 border ${
                isScreenSharing
                  ? 'bg-rose-600/25 border-rose-500 text-rose-300'
                  : 'bg-[#07080C] hover:bg-[#161B26] border-white/[0.08] text-zinc-200'
              }`}
              title="1080p 60FPS Oyun / Ekran Paylaşımı"
            >
              <MonitorUp className="w-3.5 h-3.5 text-[#5865F2]" />
              <span>{isScreenSharing ? 'YAYINDA' : 'YAYIN'}</span>
            </button>

            {/* 4. 🎯 Oyun İçi Arayüz (Overlay / HUD) */}
            <button
              onClick={handleToggleOverlay}
              className={`px-1.5 py-1.5 rounded text-[9px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 border ${
                isOverlayActive
                  ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981]'
                  : 'bg-[#07080C] hover:bg-[#161B26] border-white/[0.08] text-zinc-200'
              }`}
              title="🎯 Oyun İçi Arayüz (Overlay) Aç/Kapat (Ctrl+Shift+O)"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>🎯 HUD</span>
            </button>

            {/* 5. ⚡ Oyun Modu (0% GPU) */}
            <button
              onClick={() => setGamingMode(!isGamingMode)}
              className={`px-1.5 py-1.5 rounded text-[9px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 border ${
                isGamingMode
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-[#07080C] hover:bg-[#161B26] border-white/[0.08] text-zinc-200'
              }`}
              title="⚡ Oyun Modu: Tüm arayüz animasyonlarını dondurur (0% GPU)"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ FPS</span>
            </button>
          </div>
        </div>
      </div>

      {/* SAĞ TIK SES MİKSERİ & YÖNETİCİ KONTROL MENÜSÜ */}
      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
};
