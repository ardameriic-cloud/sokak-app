import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  PauseCircle,
  PlayCircle,
  MonitorOff,
  Tv,
  ShieldAlert,
  Play,
  Pause,
  Youtube,
  FastForward,
  Rewind,
  Volume2,
  VolumeX,
  Sliders,
  MicOff,
  Headphones,
  CheckCircle2,
  Users,
  MonitorUp,
  ShieldCheck,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { getRankMeta, UserPresence } from '../types/sokak';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { UserContextMenu, UserContextTarget } from './UserContextMenu';

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const regExp =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = trimmed.match(regExp);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

interface StageContextMenuState {
  x: number;
  y: number;
  target: UserContextTarget;
}

export const StreamStage: React.FC = () => {
  const activeVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const channels = useSokakStore((s) => s.channels);
  const watchTogether = useSokakStore((s) => s.watchTogether);
  const userId = useSokakStore((s) => s.userId);
  const userVolumes = useSokakStore((s) => s.userVolumes);
  const setUserVolume = useSokakStore((s) => s.setUserVolume);
  const toggleUserLocalMute = useSokakStore((s) => s.toggleUserLocalMute);
  const activeReadyCheck = useSokakStore((s) => s.activeReadyCheck);

  const localScreenStream = useSokakStore((s) => s.localScreenStream);
  const activeScreenShareSourceName = useSokakStore(
    (s) => s.activeScreenShareSourceName
  );
  const remoteStreams = useSokakStore((s) => s.remoteStreams);
  const users = useSokakStore((s) => s.users);

  const isStreamPausedForFps = useSokakStore((s) => s.isStreamPausedForFps);
  const isGamingMode = useSokakStore((s) => s.isGamingMode);
  const isTheaterMode = useSokakStore((s) => s.isTheaterMode);
  const isWindowFocused = useSokakStore((s) => s.isWindowFocused);
  const isWindowMinimized = useSokakStore((s) => s.isWindowMinimized);

  const setStreamPausedForFps = useSokakStore((s) => s.setStreamPausedForFps);
  const setTheaterMode = useSokakStore((s) => s.setTheaterMode);
  const setScreenPickerOpen = useSokakStore((s) => s.setScreenPickerOpen);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);

  const [ytInputUrl, setYtInputUrl] = useState<string>(watchTogether.videoUrl);
  const [seekInputSec, setSeekInputSec] = useState<number>(
    Math.floor(watchTogether.currentTime)
  );
  const [showCardsInMediaRoom, setShowCardsInMediaRoom] =
    useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<StageContextMenuState | null>(
    null
  );

  const remoteEntries = Object.entries(remoteStreams);
  const activeRemoteSocketId = remoteEntries[0]?.[0] || null;
  const activeRemoteStream = remoteEntries[0]?.[1] || null;

  const activeStream = activeRemoteStream || localScreenStream;
  const isLocalPreview = !activeRemoteStream && Boolean(localScreenStream);
  const isInCinemaRoom = activeVoiceChannelId === 'voice-sinema';

  const activeChannelObj = channels.find((c) => c.id === activeVoiceChannelId);
  const voiceOccupants = activeVoiceChannelId
    ? users.filter((u) => u.activeVoiceChannelId === activeVoiceChannelId)
    : [];

  const remoteStreamerUser = activeRemoteSocketId
    ? users.find((u) => u.socketId === activeRemoteSocketId)
    : null;

  // Oyun oynarken pencere arka planda kaldığında (!isWindowFocused) yerel video çözümlemeyi otomatik durdur (0% GPU)
  const shouldDetachVideo =
    isStreamPausedForFps ||
    isWindowMinimized ||
    !isWindowFocused ||
    isGamingMode;
  const hasMediaStage = Boolean(activeStream || isInCinemaRoom);
  const renderEsportCards = !hasMediaStage || showCardsInMediaRoom;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (!activeStream || shouldDetachVideo || renderEsportCards) {
      videoEl.pause();
      videoEl.srcObject = null;
      return;
    }

    videoEl.srcObject = activeStream;
    videoEl.play().catch(() => {});
  }, [activeStream, shouldDetachVideo, renderEsportCards]);

  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args,
      }),
      '*'
    );
  };

  useEffect(() => {
    setYtInputUrl(watchTogether.videoUrl);
    setSeekInputSec(Math.floor(watchTogether.currentTime));

    if (!isInCinemaRoom || activeStream || shouldDetachVideo || renderEsportCards)
      return;

    const timer = window.setTimeout(() => {
      sendYouTubeCommand('seekTo', [Math.floor(watchTogether.currentTime), true]);
      if (watchTogether.isPlaying) {
        sendYouTubeCommand('playVideo', []);
      } else {
        sendYouTubeCommand('pauseVideo', []);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [
    watchTogether.videoId,
    watchTogether.isPlaying,
    watchTogether.currentTime,
    watchTogether.updatedAt,
    isInCinemaRoom,
    activeStream,
    shouldDetachVideo,
    renderEsportCards,
  ]);

  const handleLoadYouTubeUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(ytInputUrl);
    if (!id) return;
    rtcEngine.emitWatchTogetherUpdate({
      videoId: id,
      videoUrl: ytInputUrl.trim(),
      isPlaying: true,
      currentTime: 0,
    });
  };

  const handleTogglePlayPause = () => {
    const nextPlaying = !watchTogether.isPlaying;
    rtcEngine.emitWatchTogetherUpdate({
      isPlaying: nextPlaying,
      currentTime: seekInputSec,
    });
  };

  const handleSeekOffset = (deltaSec: number) => {
    const nextTime = Math.max(0, seekInputSec + deltaSec);
    setSeekInputSec(nextTime);
    rtcEngine.emitWatchTogetherUpdate({
      isPlaying: watchTogether.isPlaying,
      currentTime: nextTime,
    });
  };

  const openUserMenu = (e: React.MouseEvent, occ: UserPresence) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: {
        userId: occ.userId,
        username: occ.username,
        rank: occ.rank,
        avatarColor: occ.avatarColor,
        avatarImage: occ.avatarImage,
        activeVoiceChannelId: occ.activeVoiceChannelId,
        isOnline: true,
      },
    });
  };

  if (!activeVoiceChannelId && !activeStream) {
    return null;
  }

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <section
      className={`cyber-dot-matrix border-b border-white/[0.07] flex flex-col shrink-0 ${
        isTheaterMode
          ? 'h-[62vh]'
          : renderEsportCards
          ? 'h-56'
          : 'h-80'
      }`}
    >
      {/* Sahne Üst Çubuğu */}
      <div className="h-10 px-4 bg-[#0C0E14] border-b border-white/[0.07] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {activeStream && !renderEsportCards ? (
            <>
              <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 shrink-0">
                <Tv className="w-3 h-3" />
                CANLI 1080p 60FPS
              </span>
              <span className="text-xs font-semibold text-zinc-100 truncate">
                {isLocalPreview
                  ? `Senin Yayının: ${activeScreenShareSourceName || 'Oyun Ekranı'}`
                  : `${remoteStreamerUser?.username || 'Ekip Üyesi'} — Canlı Oyun Yayını`}
              </span>
            </>
          ) : isInCinemaRoom && !renderEsportCards ? (
            <>
              <span className="px-2 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 shrink-0">
                <Youtube className="w-3.5 h-3.5" />
                BİRLİKTE İZLE
              </span>
              <span className="text-xs font-semibold text-zinc-100 truncate">
                🍿 Sinema & Yayın — Senkronize YouTube ({watchTogether.updatedBy})
              </span>
            </>
          ) : (
            <>
              <span className="px-2 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1 shrink-0">
                <Users className="w-3 h-3" />
                ESPOR SES SAHNESİ
              </span>
              <span className="text-xs font-bold text-zinc-100 truncate">
                {activeChannelObj?.name || 'Ses Kanalı'} — {voiceOccupants.length}{' '}
                Oyuncu Bağlı
              </span>
            </>
          )}

          {!isWindowFocused && !isStreamPausedForFps && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#12151F] text-zinc-400 border border-white/[0.07] shrink-0">
              Arka Plan Optimize
            </span>
          )}
        </div>

        {/* Sahne Aksiyonları */}
        <div className="flex items-center gap-2 shrink-0">
          {hasMediaStage && (
            <button
              onClick={() => setShowCardsInMediaRoom(!showCardsInMediaRoom)}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 border ${
                showCardsInMediaRoom
                  ? 'bg-[#5865F2]/20 border-[#5865F2] text-zinc-100'
                  : 'bg-[#12151F] border-white/[0.08] text-zinc-300 hover:bg-[#191E2C]'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#10B981]" />
              <span>
                {showCardsInMediaRoom
                  ? 'Yayına / Sinemaya Dön'
                  : `Oyuncu Kartları (${voiceOccupants.length})`}
              </span>
            </button>
          )}

          {renderEsportCards && activeVoiceChannelId && (
            <>
              <button
                onClick={() => rtcEngine.startReadyCheck()}
                className="px-2.5 py-1 rounded bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Hazır Yoklaması</span>
              </button>
              <button
                onClick={() => setScreenPickerOpen(true)}
                className="px-2.5 py-1 rounded bg-[#12151F] hover:bg-[#1A1F2E] border border-white/[0.08] text-zinc-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <MonitorUp className="w-3.5 h-3.5 text-[#5865F2]" />
                <span>Yayın Aç</span>
              </button>
            </>
          )}

          {!renderEsportCards && (
            <button
              onClick={() => setStreamPausedForFps(!isStreamPausedForFps)}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border ${
                isStreamPausedForFps
                  ? 'bg-[#10B981]/15 border-[#10B981] text-[#10B981]'
                  : 'bg-[#12151F] border-white/[0.08] text-zinc-200 hover:bg-[#1C202C]'
              }`}
              title="Video çözücüyü (NVDEC/GPU) yerel olarak durdurur, sesli sohbet kesintisiz devam eder"
            >
              {isStreamPausedForFps ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Görüntüyü Aç</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Yayını Duraklat (FPS Koru)</span>
                </>
              )}
            </button>
          )}

          {isLocalPreview && !renderEsportCards && (
            <button
              onClick={() => rtcEngine.stopScreenShare()}
              className="px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300"
            >
              <MonitorOff className="w-3.5 h-3.5" />
              <span>Yayını Kapat</span>
            </button>
          )}

          <button
            onClick={() => setTheaterMode(!isTheaterMode)}
            className="p-1.5 rounded bg-[#12151F] hover:bg-[#1C202C] border border-white/[0.08] text-zinc-300"
            title={isTheaterMode ? 'Normal Boyut' : 'Geniş Sahne Modu'}
          >
            {isTheaterMode ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Birlikte İzle Üst Çubuğu (`🍿 Sinema & Yayın` Kanalı) */}
      {isInCinemaRoom && !activeStream && !renderEsportCards && (
        <div className="px-4 py-2 bg-[#07080C] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <form
            onSubmit={handleLoadYouTubeUrl}
            className="flex-1 min-w-[240px] flex items-center gap-2"
          >
            <input
              type="text"
              value={ytInputUrl}
              onChange={(e) => setYtInputUrl(e.target.value)}
              placeholder="YouTube Video URL veya ID yapıştırın (örn: https://www.youtube.com/watch?v=...)"
              className="flex-1 px-2.5 py-1 rounded bg-[#12151F] border border-white/[0.08] text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#10B981]"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold shrink-0"
            >
              Odaya Yansıt
            </button>
          </form>

          {/* Senkronize Oynat / Duraklat / İleri-Geri Sar */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlayPause}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 border ${
                watchTogether.isPlaying
                  ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                  : 'bg-[#12151F] border-white/[0.08] text-zinc-200 hover:bg-[#1C202C]'
              }`}
              title="Odadaki herkes için Oynat / Duraklat"
            >
              {watchTogether.isPlaying ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Duraklat</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Oynat</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSeekOffset(-15)}
              className="px-2 py-1 rounded bg-[#12151F] hover:bg-[#1C202C] border border-white/[0.08] text-[11px] font-mono text-zinc-300 flex items-center gap-1"
              title="15 Saniye Geri Sar (Herkes İçin)"
            >
              <Rewind className="w-3 h-3" />
              <span>-15s</span>
            </button>

            <button
              type="button"
              onClick={() => handleSeekOffset(15)}
              className="px-2 py-1 rounded bg-[#12151F] hover:bg-[#1C202C] border border-white/[0.08] text-[11px] font-mono text-zinc-300 flex items-center gap-1"
              title="15 Saniye İleri Sar (Herkes İçin)"
            >
              <span>+15s</span>
              <FastForward className="w-3 h-3" />
            </button>

            <div className="flex items-center gap-1.5 pl-2 border-l border-white/[0.07]">
              <input
                type="range"
                min={0}
                max={3600}
                step={5}
                value={seekInputSec}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSeekInputSec(next);
                  rtcEngine.emitWatchTogetherUpdate({
                    isPlaying: watchTogether.isPlaying,
                    currentTime: next,
                  });
                }}
                className="w-24 accent-[#10B981] cursor-pointer"
                title="Zaman Çubuğu (Tüm Odayla Senkronize)"
              />
              <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                {formatSec(seekInputSec)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Merkez Sahne Alanı: Espor Oyuncu Kartları VEYA Video/Sinema */}
      <div className="flex-1 relative cyber-dot-matrix flex items-center justify-center overflow-hidden">
        {renderEsportCards ? (
          <div className="w-full h-full overflow-y-auto px-5 py-3.5 flex items-center">
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {voiceOccupants.map((occ) => {
                const isSelf = occ.userId === userId;
                const rankMeta = getRankMeta(occ.rank);
                const volPref = userVolumes[occ.userId];
                const userVol = volPref ? volPref.volume : 100;
                const isLocalMuted = volPref?.localMuted ?? false;
                const isUserReady = Boolean(
                  activeReadyCheck &&
                    activeReadyCheck.channelId === activeVoiceChannelId &&
                    activeReadyCheck.readyUserIds.includes(occ.userId)
                );

                return (
                  <div
                    key={occ.socketId}
                    onContextMenu={(e) => openUserMenu(e, occ)}
                    style={{
                      borderTop: `2px solid ${rankMeta.color}`,
                    }}
                    className={`group relative rounded-md bg-[#12151F] border border-white/[0.07] p-3 flex flex-col justify-between gap-2.5 select-none ${
                      occ.isSpeaking
                        ? 'ring-1 ring-[#10B981]'
                        : 'hover:border-white/[0.14]'
                    }`}
                  >
                    {/* Üst Satır: Rütbe Hap Rozeti (👑 LEADER, 🛡️ ADMIN, ⭐ CAPTAIN) + Ping */}
                    <div className="flex items-center justify-between gap-1.5">
                      <RankBadge rank={occ.rank} pill />
                      <div className="flex items-center gap-1">
                        {isUserReady && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981] text-[9px] font-mono font-bold flex items-center gap-0.5"
                            title="Hazır Yoklaması Onaylandı"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>HAZIR</span>
                          </span>
                        )}
                        <span className="text-[10px] font-mono tabular-nums text-zinc-400 px-1.5 py-0.5 rounded bg-[#07080C] border border-white/[0.06]">
                          {occ.pingMs}ms
                        </span>
                      </div>
                    </div>

                    {/* Orta Satır: Canlı Konuşma Halkalı Avatar + Rütbe Renkli Kullanıcı Adı */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        username={occ.username}
                        color={occ.avatarColor}
                        image={occ.avatarImage}
                        size={38}
                        speaking={occ.isSpeaking}
                        ringOffsetColor="#12151F"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span
                            className="text-xs font-extrabold truncate"
                            style={{ color: rankMeta.color }}
                          >
                            {occ.username}
                          </span>
                          {isSelf && (
                            <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                              (Sen)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] truncate mt-0.5">
                          {occ.activeGame ? (
                            <span className="text-[#10B981] font-medium">
                              🎮 {occ.activeGame}
                            </span>
                          ) : occ.isSpeaking ? (
                            <span className="text-[#10B981] font-mono font-semibold">
                              ● Konuşuyor
                            </span>
                          ) : (
                            <span className="text-zinc-500">
                              {occ.statusTag || 'Ses Kanalında'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Alt Satır / Hızlı Hover Araç Çubuğu (Ses Seviyesi & Yönetici İşlemleri) */}
                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {occ.isMuted ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-mono">
                            <MicOff className="w-2.5 h-2.5" />
                            <span>Sustu</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#07080C] border border-white/[0.06] text-zinc-400 text-[9px] font-mono">
                            <span>Opus 128k</span>
                          </span>
                        )}
                        {occ.isDeafened && (
                          <Headphones className="w-3 h-3 text-rose-500" />
                        )}
                      </div>

                      {/* Hover Hızlı Ses & Yönetici Kontrol Çubuğu */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => toggleUserLocalMute(occ.userId)}
                              className={`p-1 rounded border ${
                                isLocalMuted
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                                  : 'bg-[#07080C] border-white/[0.08] text-zinc-300 hover:text-white'
                              }`}
                              title={
                                isLocalMuted
                                  ? 'Kişisel Susturmayı Kaldır'
                                  : 'Bu Kullanıcıyı Kendin İçin Sustur'
                              }
                            >
                              {isLocalMuted ? (
                                <VolumeX className="w-3 h-3" />
                              ) : (
                                <Volume2 className="w-3 h-3" />
                              )}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={200}
                              step={5}
                              value={userVol}
                              onChange={(e) =>
                                setUserVolume(occ.userId, Number(e.target.value))
                              }
                              className="w-12 accent-[#10B981] cursor-pointer"
                              title={`Kullanıcı Ses Seviyesi: %${userVol}`}
                            />
                          </>
                        )}
                        <button
                          onClick={(e) => openUserMenu(e, occ)}
                          className="p-1 rounded bg-[#07080C] hover:bg-[#191E2C] border border-white/[0.08] text-zinc-300 hover:text-white"
                          title="Yönetici & Rütbe İşlemleri (Odaya Çek / Taşı / Rütbe Ver)"
                        >
                          <Sliders className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : shouldDetachVideo ? (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-md space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#12151F] border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Yayın GPU Koruması İçin Duraklatıldı (0% NVDEC / GPU)
            </h3>
            <p className="text-xs text-zinc-400">
              Rekabetçi maç sırasında maksimum FPS için video akışı yerel olarak ayrıldı. Sesli iletişim (`128kbps Stereo Opus`) kesintisiz devam ediyor.
            </p>
            <button
              onClick={() => setStreamPausedForFps(false)}
              className="mt-2 px-3 py-1.5 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold"
            >
              Görüntüyü Tekrar Aç
            </button>
          </div>
        ) : activeStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalPreview}
            className="w-full h-full object-contain bg-[#07080C]"
          />
        ) : (
          <iframe
            ref={ytIframeRef}
            key={watchTogether.videoId}
            src={`https://www.youtube.com/embed/${watchTogether.videoId}?enablejsapi=1&autoplay=${
              watchTogether.isPlaying ? 1 : 0
            }&start=${Math.floor(
              watchTogether.currentTime
            )}&rel=0&modestbranding=1`}
            title="SOKAK Birlikte İzle Oynatıcısı"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0 bg-[#07080C]"
          />
        )}
      </div>

      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
};
