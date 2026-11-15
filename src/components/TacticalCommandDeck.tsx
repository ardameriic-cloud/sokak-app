import React, { useState } from 'react';
import {
  Zap,
  Crosshair,
  Shuffle,
  Volume2,
  Lock,
  Copy,
  Send,
  ChevronUp,
  ChevronDown,
  Crown,
  Activity,
  Sparkles,
  Check,
  Users,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { getRankMeta, THEME_ACCENT_PRESETS } from '../types/sokak';
import { Avatar } from './Avatar';
import { soundFX } from '../services/soundFX';

interface ProCrosshair {
  id: string;
  player: string;
  game: 'VALORANT' | 'CS2';
  title: string;
  color: string;
  code: string;
  sens: string;
  style: 'plus' | 'dot' | 'gap' | 'box';
}

const PRO_CROSSHAIRS: ProCrosshair[] = [
  {
    id: 'ch-tenz',
    player: 'TenZ',
    game: 'VALORANT',
    title: 'Turkuaz Mikro Artı (1422)',
    color: '#06B6D4',
    code: '0;s;1;P;c;5;h;0;m;1;0l;4;0o;2;0a;1;0f;0;1b;0;S;c;4;o;1',
    sens: '800 DPI • 0.275',
    style: 'gap',
  },
  {
    id: 'ch-cned',
    player: 'cNed',
    game: 'VALORANT',
    title: 'Beyaz Keskin Odak (1420)',
    color: '#F4F4F5',
    code: '0;P;h;0;f;0;0l;4;0o;0;0a;1;0f;0;1b;0',
    sens: '800 DPI • 0.32',
    style: 'plus',
  },
  {
    id: 'ch-aspas',
    player: 'aspas',
    game: 'VALORANT',
    title: 'Zümrüt Dengeli Artı',
    color: '#10B981',
    code: '0;P;c;1;o;1;d;1;z;3;f;0;0b;0;1b;0',
    sens: '800 DPI • 0.40',
    style: 'plus',
  },
  {
    id: 'ch-demon1',
    player: 'Demon1',
    game: 'VALORANT',
    title: 'One-Tap Nokta Nişangah',
    color: '#EF4444',
    code: '0;s;1;P;o;1;d;1;m;1;0b;0;1b;0',
    sens: '1600 DPI • 0.10',
    style: 'dot',
  },
  {
    id: 'ch-donk',
    player: 'donk',
    game: 'CS2',
    title: 'CS2 Yeşil Taktik Artı',
    color: '#10B981',
    code: 'CSGO-Jhfkc-4UpR6-DJftC-VfGek-pL3ED',
    sens: '800 DPI • 1.25',
    style: 'gap',
  },
];

const COMPETITIVE_MAPS = [
  'Ascent',
  'Haven',
  'Bind',
  'Split',
  'Lotus',
  'Sunset',
  'Mirage (CS2)',
  'Inferno (CS2)',
  'Dust II (CS2)',
];

export const TacticalCommandDeck: React.FC = () => {
  const channels = useSokakStore((s) => s.channels);
  const users = useSokakStore((s) => s.users);
  const members = useSokakStore((s) => s.members);
  const activeVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const selectedTextChannelId = useSokakStore((s) => s.selectedTextChannelId);
  const rankLevel = useSokakStore((s) => s.rankLevel);
  const telemetry = useSokakStore((s) => s.telemetry);
  const themeAccent = useSokakStore((s) => s.themeAccent);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'hub' | 'crosshair' | 'scrim'>(
    'hub'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 5v5 Kura Durumu
  const [customRosterInput, setCustomRosterInput] = useState<string>('');
  const [scrimResult, setScrimResult] = useState<{
    map: string;
    teamA: string[];
    teamB: string[];
  } | null>(null);

  const activePreset =
    THEME_ACCENT_PRESETS.find((p) => p.id === themeAccent) ||
    THEME_ACCENT_PRESETS[0];

  const voiceChannels = channels.filter((c) => c.type === 'voice').slice(0, 4);
  const leaderMember =
    members.find((m) => m.rank === 'LEADER') || members[0] || null;

  const handleCopyCrosshair = (ch: ProCrosshair, shareToChat: boolean) => {
    navigator.clipboard?.writeText(ch.code).catch(() => {});
    setCopiedId(ch.id);
    soundFX.playPinOrPoll();
    window.setTimeout(() => setCopiedId(null), 1800);

    if (shareToChat) {
      rtcEngine.sendChatMessage(
        selectedTextChannelId,
        `🎯 **${ch.player} (${ch.game}) — ${ch.title}** (${ch.sens})\nKod: \`${ch.code}\``
      );
    }
  };

  const handleGenerateScrim = () => {
    const manualNames = customRosterInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const basePool =
      manualNames.length >= 2
        ? manualNames
        : members.filter((m) => m.isOnline).map((m) => m.username);

    const pool =
      basePool.length >= 2
        ? [...basePool]
        : [
            ...(basePool.length ? basePool : ['Oyuncu 1']),
            'Kaptan Alfa',
            'Nişancı Beta',
            'Destek Gama',
          ];

    // Fisher-Yates karıştırma
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const mid = Math.ceil(pool.length / 2);
    const randomMap =
      COMPETITIVE_MAPS[Math.floor(Math.random() * COMPETITIVE_MAPS.length)];

    setScrimResult({
      map: randomMap,
      teamA: pool.slice(0, mid),
      teamB: pool.slice(mid),
    });
    soundFX.playReadyCheck();
  };

  const handleShareScrimToChat = () => {
    if (!scrimResult) return;
    const msg =
      `🏆 **SOKAK 5v5 KURA SONUCU** — Harita: **${scrimResult.map}**\n` +
      `🔴 **SALDIRI TAKIMI:** \`${scrimResult.teamA.join('`, `')}\`\n` +
      `🔵 **SAVUNMA TAKIMI:** \`${scrimResult.teamB.join('`, `')}\``;
    rtcEngine.sendChatMessage(selectedTextChannelId, msg);
  };

  const renderCrosshairSvg = (ch: ProCrosshair) => {
    return (
      <svg
        viewBox="0 0 36 36"
        className="w-9 h-9 rounded bg-[#07080C] border border-white/[0.08] shrink-0"
      >
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
        {ch.style === 'dot' && (
          <circle cx="18" cy="18" r="2.3" fill={ch.color} />
        )}
        {ch.style === 'plus' && (
          <>
            <line
              x1="18"
              y1="9"
              x2="18"
              y2="27"
              stroke={ch.color}
              strokeWidth="2"
            />
            <line
              x1="9"
              y1="18"
              x2="27"
              y2="18"
              stroke={ch.color}
              strokeWidth="2"
            />
          </>
        )}
        {ch.style === 'gap' && (
          <>
            <line
              x1="18"
              y1="8"
              x2="18"
              y2="14"
              stroke={ch.color}
              strokeWidth="2"
            />
            <line
              x1="18"
              y1="22"
              x2="18"
              y2="28"
              stroke={ch.color}
              strokeWidth="2"
            />
            <line
              x1="8"
              y1="18"
              x2="14"
              y2="18"
              stroke={ch.color}
              strokeWidth="2"
            />
            <line
              x1="22"
              y1="18"
              x2="28"
              y2="18"
              stroke={ch.color}
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    );
  };

  return (
    <section
      className="mx-5 mt-3 rounded-lg border border-white/[0.09] overflow-hidden select-none shrink-0 relative"
      style={{
        backgroundImage:
          'linear-gradient(135deg, #0D111C 0%, #07080C 55%, #111626 100%)',
      }}
    >
      {/* Üst Taktik Vurgu Şeridi */}
      <div
        className="h-[2px] w-full"
        style={{
          backgroundImage: `linear-gradient(90deg, ${activePreset.color} 0%, #5865F2 50%, transparent 100%)`,
        }}
      />

      {/* Komuta Merkezi Üst Sekme Çubuğu */}
      <div className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0C0E14]/90">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setActiveTab('hub');
              setIsCollapsed(false);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 border ${
              activeTab === 'hub' && !isCollapsed
                ? 'bg-[#12151F] text-zinc-100 border-white/[0.14]'
                : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-transparent'
            }`}
          >
            <Zap
              className="w-3.5 h-3.5"
              style={{ color: activePreset.color }}
            />
            <span>⚡ SOKAK KOMUTA MERKEZİ</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('crosshair');
              setIsCollapsed(false);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 border ${
              activeTab === 'crosshair' && !isCollapsed
                ? 'bg-[#12151F] text-zinc-100 border-white/[0.14]'
                : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-transparent'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-[#06B6D4]" />
            <span>🎯 Crosshair & Config Kasası</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('scrim');
              setIsCollapsed(false);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 border ${
              activeTab === 'scrim' && !isCollapsed
                ? 'bg-[#12151F] text-zinc-100 border-white/[0.14]'
                : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-transparent'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            <span>🎲 5v5 Takım Seçici</span>
          </button>
        </div>

        {/* Sağ Canlı Telemetri Özeti & Küçültme Butonu */}
        <div className="flex items-center gap-2">
          {leaderMember && (
            <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#07080C] border border-[#EF4444]/35 text-[10px] font-mono text-[#EF4444]">
              <Crown className="w-3 h-3" />
              <span>LEADER: {leaderMember.username}</span>
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#07080C] border border-white/[0.07] text-[10px] font-mono text-zinc-300 tabular-nums">
            <Activity
              className="w-3 h-3"
              style={{ color: activePreset.color }}
            />
            <span>{telemetry.pingMs}ms • 0% GPU</span>
          </span>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded bg-[#12151F] hover:bg-[#191E2C] border border-white/[0.08] text-zinc-400 hover:text-white"
            title={
              isCollapsed ? 'Komuta Merkezini Genişlet' : 'Komuta Merkezini Daralt'
            }
          >
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* İçerik Alanı */}
      {!isCollapsed && (
        <div className="p-3.5">
          {/* SEKME 1: CANLI KOMUTA MERKEZİ & HIZLI ODA KARTLARI */}
          {activeTab === 'hub' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {voiceChannels.map((ch) => {
                const isJoined = activeVoiceChannelId === ch.id;
                const minRank = ch.minRankLevel ?? 1;
                const isLocked = rankLevel < minRank && !isJoined;
                const occupants = users.filter(
                  (u) => u.activeVoiceChannelId === ch.id
                );

                return (
                  <div
                    key={ch.id}
                    onClick={() => rtcEngine.joinVoiceChannel(ch.id)}
                    className={`group cursor-pointer rounded-md p-2.5 border flex flex-col justify-between gap-2 gpu-safe-transition ${
                      isJoined
                        ? 'bg-[#12151F] border-[#10B981]/60'
                        : isLocked
                        ? 'bg-[#07080C]/60 border-amber-500/25 opacity-80'
                        : 'bg-[#0C0E14]/90 hover:bg-[#12151F] border-white/[0.07] hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isLocked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Volume2
                            className="w-3.5 h-3.5 shrink-0"
                            style={{
                              color: isJoined ? activePreset.color : '#A1A1AA',
                            }}
                          />
                        )}
                        <span className="text-xs font-bold text-zinc-100 truncate">
                          {ch.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#07080C] border border-white/[0.06] text-zinc-400 shrink-0">
                        {occupants.length} Aktif
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05]">
                      {occupants.length > 0 ? (
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {occupants.slice(0, 4).map((occ) => (
                            <Avatar
                              key={occ.socketId}
                              username={occ.username}
                              color={occ.avatarColor}
                              image={occ.avatarImage}
                              size={20}
                              speaking={occ.isSpeaking}
                              ringOffsetColor="#12151F"
                            />
                          ))}
                          {occupants.length > 4 && (
                            <span className="text-[9px] font-mono text-zinc-400 pl-2">
                              +{occupants.length - 4}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-500">
                          {isLocked ? 'Üst Rütbe Odası' : 'Oda müsait — Katıl'}
                        </span>
                      )}

                      <span
                        className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: isJoined
                            ? `${activePreset.color}22`
                            : 'rgba(255,255,255,0.04)',
                          color: isJoined ? activePreset.color : '#A1A1AA',
                        }}
                      >
                        {isJoined ? 'BAĞLISIN ✓' : isLocked ? 'KİLİTLİ' : 'BAĞLAN →'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SEKME 2: 🎯 CROSSHAIR & CONFIG KASASI */}
          {activeTab === 'crosshair' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PRO_CROSSHAIRS.map((ch) => {
                const isCopied = copiedId === ch.id;
                return (
                  <div
                    key={ch.id}
                    className="rounded-md bg-[#0C0E14] border border-white/[0.08] p-2.5 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderCrosshairSvg(ch)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-zinc-100">
                            {ch.player}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#12151F] border border-white/[0.07] text-[#10B981]">
                            {ch.game}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {ch.title} • {ch.sens}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopyCrosshair(ch, false)}
                        className="px-2 py-1 rounded bg-[#12151F] hover:bg-[#1A2030] border border-white/[0.08] text-[10px] font-mono text-zinc-200 flex items-center gap-1"
                        title="Crosshair Kodunu Kopyala"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 text-[#10B981]" />
                            <span className="text-[#10B981]">Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Kopyala</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleCopyCrosshair(ch, true)}
                        className="p-1.5 rounded bg-[#5865F2]/20 hover:bg-[#5865F2]/35 border border-[#5865F2]/40 text-[#5865F2]"
                        title="Sohbet Kanalına Gönder"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SEKME 3: 🎲 5v5 KURA & TAKIM SEÇİCİ */}
          {activeTab === 'scrim' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              <div className="space-y-2">
                <label className="block text-[10px] font-mono uppercase text-zinc-400">
                  Oyuncu Havuzu (Boş bırakırsan çevrimiçi üyeleri alır)
                </label>
                <input
                  type="text"
                  value={customRosterInput}
                  onChange={(e) => setCustomRosterInput(e.target.value)}
                  placeholder="Virgülle isim yaz (örn: meriç, ahmet, can, emre...)"
                  className="w-full px-2.5 py-1.5 rounded bg-[#07080C] border border-white/[0.08] text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#10B981]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateScrim}
                    className="px-3 py-1.5 rounded text-zinc-950 text-xs font-bold flex items-center gap-1.5"
                    style={{ backgroundColor: activePreset.color }}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Takımları & Haritayı Çek</span>
                  </button>
                  {scrimResult && (
                    <button
                      type="button"
                      onClick={handleShareScrimToChat}
                      className="px-3 py-1.5 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Send className="w-3 h-3" />
                      <span>Sohbete Yayınla</span>
                    </button>
                  )}
                </div>
              </div>

              {scrimResult ? (
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded bg-[#0C0E14] border-t-2 border-t-[#EF4444] border border-white/[0.07]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-bold text-[#EF4444]">
                        🔴 A TAKIMI (SALDIRI)
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        Harita: {scrimResult.map}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {scrimResult.teamA.map((p, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-[#12151F] border border-white/[0.07] text-xs font-semibold text-zinc-100"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-[#0C0E14] border-t-2 border-t-[#5865F2] border border-white/[0.07]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-bold text-[#5865F2]">
                        🔵 B TAKIMI (SAVUNMA)
                      </span>
                      <span className="text-[10px] font-mono text-[#10B981]">
                        Dengeli Kura ✓
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {scrimResult.teamB.map((p, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-[#12151F] border border-white/[0.07] text-xs font-semibold text-zinc-100"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="lg:col-span-2 p-3 rounded bg-[#0C0E14]/60 border border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Tek tıkla çevrimiçi üyeleri veya yazdığın oyuncuları 2 dengeli takıma bölüp rastgele harita seçebilirsin.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
