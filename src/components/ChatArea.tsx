import React, { useEffect, useRef, useState } from 'react';
import {
  Hash,
  Send,
  ExternalLink,
  SmilePlus,
  MonitorUp,
  Image as ImageIcon,
  Sparkles,
  Users,
  Pin,
  BarChart3,
  Plus,
  X,
  CheckCircle2,
  Camera,
  Download,
  Film,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import {
  ChatMessage,
  getRankMeta,
  RankRole,
  THEME_ACCENT_PRESETS,
} from '../types/sokak';
import { MemberSidebar } from './MemberSidebar';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { TacticalCommandDeck } from './TacticalCommandDeck';

const QUICK_EMOJIS = ['⚡', '🔥', '🎯', 'GG', '❤️', '😂'];

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function getDomainHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

function renderFormattedLine(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      const codeContent = token.slice(1, -1);
      return (
        <code
          key={idx}
          onClick={() => {
            navigator.clipboard?.writeText(codeContent).catch(() => {});
          }}
          title="Kopyalamak için tıkla"
          className="cursor-pointer px-1.5 py-0.5 mx-0.5 rounded bg-[#12151F] hover:bg-[#191E2E] border border-white/[0.10] font-mono text-[11px] text-[#10B981]"
        >
          {codeContent}
        </code>
      );
    }
    if (/^https?:\/\//.test(token)) {
      return (
        <a
          key={idx}
          href={token}
          target="_blank"
          rel="noreferrer"
          className="text-[#5865F2] hover:underline break-all inline-flex items-center gap-1"
        >
          <span>{token}</span>
          <ExternalLink className="w-3 h-3 inline shrink-0" />
        </a>
      );
    }
    return <span key={idx}>{token}</span>;
  });
}

export const ChatArea: React.FC = () => {
  const channels = useSokakStore((s) => s.channels);
  const selectedTextChannelId = useSokakStore((s) => s.selectedTextChannelId);
  const messagesByChannel = useSokakStore((s) => s.messagesByChannel);
  const pollsByChannel = useSokakStore((s) => s.pollsByChannel);
  const username = useSokakStore((s) => s.username);
  const members = useSokakStore((s) => s.members);
  const themeAccent = useSokakStore((s) => s.themeAccent);
  const isMemberListOpen = useSokakStore((s) => s.isMemberListOpen);
  const isSavingClip = useSokakStore((s) => s.isSavingClip);
  const localClipObjectUrls = useSokakStore((s) => s.localClipObjectUrls);
  const setMemberListOpen = useSokakStore((s) => s.setMemberListOpen);
  const setScreenPickerOpen = useSokakStore((s) => s.setScreenPickerOpen);

  const [draft, setDraft] = useState('');
  const [showPinnedDrawer, setShowPinnedDrawer] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState(
    'Bu akşam saat kaçta oyuna giriyoruz?'
  );
  const [pollOptionsText, setPollOptionsText] = useState(
    '21:00 Hazırım\n22:30 Gece Vardiyası\nBu akşam yokum'
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activePreset =
    THEME_ACCENT_PRESETS.find((p) => p.id === themeAccent) ||
    THEME_ACCENT_PRESETS[0];

  const currentChannel =
    channels.find((c) => c.id === selectedTextChannelId) || channels[0];
  const messages: ChatMessage[] =
    messagesByChannel[selectedTextChannelId] || [];
  const pinnedMessages = messages.filter((m) => m.pinned);
  const activePoll = pollsByChannel[selectedTextChannelId] || null;

  const memberInfoMap = React.useMemo(() => {
    const map = new Map<string, { avatarImage: string | null; rank: RankRole }>();
    for (const m of members) {
      map.set(m.userId, { avatarImage: m.avatarImage, rank: m.rank });
    }
    return map;
  }, [members]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length, selectedTextChannelId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    rtcEngine.sendChatMessage(selectedTextChannelId, draft);
    setDraft('');
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    const opts = pollOptionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2) return;
    rtcEngine.createPoll(selectedTextChannelId, pollQuestion.trim(), opts);
    setShowPollCreator(false);
  };

  const handleQuickClipShare = () => {
    const sampleUrl =
      '🎯 **Maç Anı (1080p 60FPS)** — Harika raunt! https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=900&q=80';
    rtcEngine.sendChatMessage(selectedTextChannelId, sampleUrl);
  };

  const totalPollVotes = activePoll
    ? activePoll.options.reduce((acc, o) => acc + o.voterNames.length, 0)
    : 0;

  return (
    <main className="flex-1 flex flex-col h-full cyber-dot-matrix min-w-0">
      {/* Üst Kanal Başlığı */}
      <div className="h-12 px-5 bg-[#0C0E14] border-b border-white/[0.07] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Hash
            className="w-4 h-4 shrink-0"
            style={{ color: activePreset.color }}
          />
          <h2 className="text-sm font-bold text-zinc-100 truncate">
            {currentChannel?.name || 'genel-sohbet'}
          </h2>
          <span className="hidden lg:inline-block text-xs text-zinc-500 border-l border-white/[0.07] pl-2.5 truncate">
            {selectedTextChannelId === 'text-klipler'
              ? 'Oyun klipleri, ekran görüntüleri ve bağlantı paylaşımları'
              : 'SOKAK — Ekip içi anlık sesli ve yazılı iletişim'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 📌 Sabitlenmiş Mesajlar Çekmecesi Butonu */}
          <button
            onClick={() => setShowPinnedDrawer(!showPinnedDrawer)}
            className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 ${
              showPinnedDrawer || pinnedMessages.length > 0
                ? 'bg-[#12151F] border-amber-500/40 text-amber-400'
                : 'bg-[#12151F] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
            title="Sabitlenmiş Mesajları Göster"
          >
            <Pin className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sabitlenenler</span>
            <span className="font-mono text-[10px] tabular-nums">
              {pinnedMessages.length}
            </span>
          </button>

          {/* 📊 Canlı Ekip Anketi Butonu */}
          <button
            onClick={() => setShowPollCreator(!showPollCreator)}
            className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 ${
              showPollCreator || activePoll
                ? 'bg-[#12151F] border-[#10B981]/40 text-[#10B981]'
                : 'bg-[#12151F] border-white/[0.08] text-zinc-300 hover:text-white'
            }`}
            title="Ekip Anketi Oluştur"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Anket</span>
          </button>

          {/* 🎬 Son 30 Sn Klip Al (F8) Butonu */}
          <button
            onClick={() => rtcEngine.saveInstantClip()}
            disabled={isSavingClip}
            className="px-2.5 py-1 rounded bg-[#12151F] hover:bg-[#1C202C] border border-[#5865F2]/50 text-xs font-semibold text-zinc-100 flex items-center gap-1.5 disabled:opacity-50"
            title="🎬 Son 30 Sn Klip Al (F8 veya Ctrl+Shift+S) — #klipler-ve-linkler kanalında otomatik paylaşır"
          >
            <Camera className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="hidden md:inline">
              {isSavingClip ? 'Kaydediliyor...' : '🎬 Son 30 Sn Klip Al (F8)'}
            </span>
          </button>

          {selectedTextChannelId === 'text-klipler' && (
            <button
              onClick={handleQuickClipShare}
              className="px-2.5 py-1 rounded bg-[#12151F] hover:bg-[#1C202C] border border-white/[0.08] text-xs text-zinc-300 flex items-center gap-1.5"
              title="Örnek Oyun Görseli Gönder"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#5865F2]" />
              <span className="hidden xl:inline">Örnek Görsel</span>
            </button>
          )}

          <button
            onClick={() => setScreenPickerOpen(true)}
            className="px-3 py-1 rounded text-zinc-950 text-xs font-bold flex items-center gap-1.5"
            style={{ backgroundColor: activePreset.color }}
          >
            <MonitorUp className="w-3.5 h-3.5" />
            <span className="hidden md:inline">1080p 60FPS Yayın</span>
          </button>

          <button
            onClick={() => setMemberListOpen(!isMemberListOpen)}
            className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 ${
              isMemberListOpen
                ? 'bg-[#12151F] border-[#10B981]/40 text-[#10B981]'
                : 'bg-[#12151F] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
            title={isMemberListOpen ? 'Üye Listesini Gizle' : 'Üye Listesini Göster'}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Üyeler</span>
            <span className="font-mono text-[10px] tabular-nums">{members.length}</span>
          </button>
        </div>
      </div>

      {/* Ana İçerik: Mesaj Akışı + Sağ Katlanabilir Üye Listesi */}
      <div className="flex-1 flex min-h-0">
        {/* Mesaj Akışı */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ⚡ SOKAK TAKTİK KOMUTA MERKEZİ (Canlı Odalar, Crosshair Kasası, 5v5 Kura) */}
          <TacticalCommandDeck />

          {/* 📌 SABİTLENMİŞ MESAJLAR ÇEKMECESİ */}
          {showPinnedDrawer && (
            <div className="px-5 py-3 bg-[#0C0E14] border-b border-amber-500/30 space-y-2 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Pin className="w-3.5 h-3.5" />
                  <span>
                    Sabitlenmiş Mesajlar ({pinnedMessages.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowPinnedDrawer(false)}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {pinnedMessages.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Bu kanalda henüz sabitlenmiş mesaj yok. Herhangi bir mesajın sağ üstündeki 📌 ikonuna tıklayarak sabitleyebilirsin.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {pinnedMessages.map((pm) => (
                    <div
                      key={pm.id}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-[#12151F] border border-amber-500/30 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-amber-400 mr-2">
                          {pm.username}:
                        </span>
                        <span className="text-zinc-200">{pm.content}</span>
                      </div>
                      <button
                        onClick={() =>
                          rtcEngine.togglePinMessage(selectedTextChannelId, pm.id)
                        }
                        className="text-[10px] font-mono text-zinc-400 hover:text-rose-400 shrink-0"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 📊 ANKET OLUŞTURMA PANELİ */}
          {showPollCreator && (
            <form
              onSubmit={handleCreatePoll}
              className="px-5 py-3 bg-[#0C0E14] border-b border-white/[0.08] space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#10B981]">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Canlı Ekip Anketi Başlat</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPollQuestion('Bu akşam hangi oyuna giriyoruz?');
                      setPollOptionsText(
                        '🎯 VALORANT (5 Pre)\n⚔️ Counter-Strike 2\n🏆 League of Legends (Esnek)\n⚽ EA SPORTS FC'
                      );
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#12151F] border border-white/[0.08] text-zinc-300 hover:text-white"
                  >
                    Oyun Şablonu
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPollCreator(false)}
                    className="text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Anket sorusu yazın..."
                className="w-full px-3 py-1.5 rounded bg-[#12151F] border border-white/[0.08] text-xs text-zinc-100 focus:outline-none focus:border-[#10B981]"
              />
              <textarea
                rows={3}
                value={pollOptionsText}
                onChange={(e) => setPollOptionsText(e.target.value)}
                placeholder="Her satıra bir seçenek yazın (en az 2 seçenek)..."
                className="w-full px-3 py-1.5 rounded bg-[#12151F] border border-white/[0.08] text-xs text-zinc-100 focus:outline-none focus:border-[#10B981]"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3 py-1 rounded text-zinc-950 text-xs font-bold flex items-center gap-1"
                  style={{ backgroundColor: activePreset.color }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Anketi Kanalda Yayınla</span>
                </button>
              </div>
            </form>
          )}

          {/* 📊 AKTİF CANLI ANKET KARTI */}
          {activePoll && (
            <div className="mx-5 mt-3 p-3 rounded-md bg-[#12151F] border border-white/[0.10] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase text-zinc-950 shrink-0"
                    style={{ backgroundColor: activePreset.color }}
                  >
                    📊 CANLI ANKET
                  </span>
                  <h4 className="text-xs font-bold text-zinc-100 truncate">
                    {activePoll.question}
                  </h4>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                    {totalPollVotes} Oy • {activePoll.createdBy}
                  </span>
                  <button
                    onClick={() => rtcEngine.closePoll(selectedTextChannelId)}
                    className="text-zinc-500 hover:text-rose-400"
                    title="Anketi Sonlandır"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {activePoll.options.map((opt) => {
                  const count = opt.voterNames.length;
                  const pct =
                    totalPollVotes > 0
                      ? Math.round((count / totalPollVotes) * 100)
                      : 0;
                  const votedByMe = opt.voterNames.includes(username);

                  return (
                    <button
                      key={opt.id}
                      onClick={() =>
                        rtcEngine.votePoll(selectedTextChannelId, opt.id)
                      }
                      className={`relative overflow-hidden text-left px-3 py-2 rounded bg-[#07080C] border flex items-center justify-between gap-2 ${
                        votedByMe
                          ? 'border-[#10B981]'
                          : 'border-white/[0.07] hover:border-white/[0.15]'
                      }`}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 opacity-15 pointer-events-none"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: activePreset.color,
                        }}
                      />
                      <div className="relative flex items-center gap-1.5 min-w-0">
                        {votedByMe && (
                          <CheckCircle2
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: activePreset.color }}
                          />
                        )}
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {opt.text}
                        </span>
                      </div>
                      <div className="relative flex items-center gap-1.5 shrink-0">
                        {opt.voterNames.length > 0 && (
                          <span className="text-[9px] text-zinc-400 truncate max-w-[90px]">
                            ({opt.voterNames.join(', ')})
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-bold tabular-nums text-zinc-200">
                          %{pct} ({count})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((msg) => {
              const urls = msg.content.match(URL_REGEX) || [];
              const imageUrls = urls.filter(
                (u) =>
                  IMAGE_EXT_REGEX.test(u) ||
                  u.includes('images.unsplash.com')
              );
              const regularUrls = urls.filter((u) => !imageUrls.includes(u));
              const timeStr = new Date(msg.timestamp).toLocaleTimeString(
                'tr-TR',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                }
              );

              return (
                <div
                  key={msg.id}
                  className={`group flex items-start gap-3 p-2.5 rounded-md border ${
                    msg.pinned
                      ? 'bg-[#12151F]/90 border-amber-500/35'
                      : 'hover:bg-[#0C0E14] border-transparent hover:border-white/[0.06]'
                  }`}
                >
                  <Avatar
                    username={msg.username}
                    color={msg.avatarColor}
                    image={memberInfoMap.get(msg.userId)?.avatarImage ?? null}
                    size={36}
                    className="mt-0.5"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-bold"
                          style={{
                            color: getRankMeta(
                              memberInfoMap.get(msg.userId)?.rank || msg.rank
                            ).color,
                          }}
                        >
                          {msg.username}
                        </span>
                        {msg.userId === 'sokak-sistem' ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#5865F2] text-[9px] font-bold uppercase">
                            SİSTEM
                          </span>
                        ) : (
                          <RankBadge
                            rank={memberInfoMap.get(msg.userId)?.rank || msg.rank}
                          />
                        )}
                        <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                          {timeStr}
                        </span>
                        {msg.pinned && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] font-mono font-bold">
                            <Pin className="w-2.5 h-2.5" />
                            <span>SABİTLENDİ</span>
                          </span>
                        )}
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-[#12151F] border border-white/[0.08] rounded px-1.5 py-0.5 gpu-safe-transition">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() =>
                              rtcEngine.toggleMessageReaction(
                                selectedTextChannelId,
                                msg.id,
                                emoji
                              )
                            }
                            className="text-[11px] px-1 hover:scale-110 text-zinc-300 hover:text-white"
                            title={`${emoji} ile tepki ver`}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            rtcEngine.togglePinMessage(
                              selectedTextChannelId,
                              msg.id
                            )
                          }
                          className={`p-1 rounded border-l border-white/[0.08] ml-0.5 ${
                            msg.pinned
                              ? 'text-amber-400'
                              : 'text-zinc-400 hover:text-amber-400'
                          }`}
                          title={
                            msg.pinned
                              ? 'Sabitlemeyi Kaldır'
                              : '📌 Mesajı Kanala Sabitle'
                          }
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">
                      {msg.content.split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                          {renderFormattedLine(line)}
                          {i < msg.content.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* 🎬 ANLIK 30 SN .WEBM VİDEO KLİP OYNATICISI + BİLGİSAYARA İNDİR BUTONU */}
                    {msg.clipAttachment && (
                      <div className="mt-3 rounded-md overflow-hidden bg-[#0C0E14] border border-[#10B981]/35 max-w-xl">
                        <div className="px-3 py-2 bg-[#12151F] border-b border-white/[0.07] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981] text-[9px] font-mono font-bold uppercase flex items-center gap-1 shrink-0">
                              <Film className="w-3 h-3" />
                              <span>{msg.clipAttachment.durationSec}SN KLİP</span>
                            </span>
                            <span className="text-xs font-bold text-zinc-100 truncate">
                              {msg.clipAttachment.title}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                              {(
                                msg.clipAttachment.sizeBytes /
                                (1024 * 1024)
                              ).toFixed(1)}{' '}
                              MB
                            </span>
                          </div>

                          <a
                            href={
                              localClipObjectUrls[msg.clipAttachment.id] ||
                              msg.clipAttachment.videoUrl
                            }
                            download={msg.clipAttachment.fileName}
                            className="px-2.5 py-1 rounded bg-[#10B981] hover:bg-[#059669] text-zinc-950 text-[11px] font-extrabold flex items-center gap-1 shrink-0"
                            title="Klibi .webm olarak bilgisayara indir"
                          >
                            <Download className="w-3 h-3" />
                            <span>Bilgisayara İndir</span>
                          </a>
                        </div>

                        <video
                          src={
                            localClipObjectUrls[msg.clipAttachment.id] ||
                            msg.clipAttachment.videoUrl
                          }
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full max-h-80 bg-[#07080C] object-contain block"
                        />
                      </div>
                    )}

                    {imageUrls.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {imageUrls.map((imgUrl, idx) => (
                          <a
                            key={idx}
                            href={imgUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md overflow-hidden border border-white/[0.08] bg-[#0C0E14] max-w-md"
                          >
                            <img
                              src={imgUrl}
                              alt="Kanal Medya Önizlemesi"
                              loading="lazy"
                              className="max-h-60 w-auto object-cover block"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {regularUrls.length > 0 && (
                      <div className="mt-2 space-y-1.5 max-w-md">
                        {regularUrls.map((linkUrl, idx) => (
                          <a
                            key={idx}
                            href={linkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-2.5 rounded bg-[#0C0E14] hover:bg-[#12151F] border-l-2 border-l-[#5865F2] border border-white/[0.06]"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="text-[10px] font-mono uppercase text-[#5865F2] flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>{getDomainHostname(linkUrl)}</span>
                              </div>
                              <div className="text-xs font-medium text-zinc-200 truncate mt-0.5">
                                {linkUrl}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}

                    {msg.reactions.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {msg.reactions.map((r) => {
                          const hasReacted = r.users.includes(username);
                          return (
                            <button
                              key={r.emoji}
                              onClick={() =>
                                rtcEngine.toggleMessageReaction(
                                  selectedTextChannelId,
                                  msg.id,
                                  r.emoji
                                )
                              }
                              title={r.users.join(', ')}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border ${
                                hasReacted
                                  ? 'bg-[#5865F2]/20 border-[#5865F2] text-zinc-100'
                                  : 'bg-[#12151F] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span className="tabular-nums">
                                {r.users.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSend}
            className="p-3 bg-[#07080C] border-t border-white/[0.07]"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0C0E14] border border-white/[0.08] focus-within:border-[#5865F2]">
              <SmilePlus className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`#${currentChannel?.name || 'genel-sohbet'} kanalına mesaj gönder (**kalın**, \`kod\`, resim veya video bağlantısı)...`}
                className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="px-3 py-1 rounded disabled:opacity-40 text-zinc-950 text-xs font-bold flex items-center gap-1.5"
                style={{ backgroundColor: activePreset.color }}
              >
                <span>Gönder</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>

        {/* Sağ Katlanabilir SOKAK Üye Listesi (Çevrimiçi & Çevrimdışı) */}
        <MemberSidebar />
      </div>
    </main>
  );
};
