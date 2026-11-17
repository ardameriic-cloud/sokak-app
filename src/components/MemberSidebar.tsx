import React, { useMemo, useState } from 'react';
import { Volume2, Sliders, X, Radio, ArrowRightCircle } from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { getRankMeta, MemberEntry, RANK_ORDER } from '../types/sokak';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { UserContextMenu, UserContextTarget } from './UserContextMenu';

interface ContextMenuPos {
  x: number;
  y: number;
  target: UserContextTarget;
}

const MemberRow: React.FC<{
  member: MemberEntry;
  isSelf: boolean;
  isSpeaking: boolean;
  isSelected: boolean;
  onLeftClick: (member: MemberEntry) => void;
  onRightClick: (e: React.MouseEvent, member: MemberEntry) => void;
}> = ({
  member,
  isSelf,
  isSpeaking,
  isSelected,
  onLeftClick,
  onRightClick,
}) => {
  const online = member.isOnline;
  const rankMeta = getRankMeta(member.rank);

  return (
    <div
      onClick={() => onLeftClick(member)}
      onContextMenu={(e) => onRightClick(e, member)}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded border cursor-pointer gpu-safe-transition ${
        isSelected
          ? 'bg-[#12151F] border-white/[0.14]'
          : 'hover:bg-[#12151F]/80 border-transparent hover:border-white/[0.06]'
      }`}
      title="Sol Tık: Oyuncu Künyesi • Sağ Tık: Ses Mikseri & Yönetici İşlemleri"
    >
      <div className="relative shrink-0">
        <Avatar
          username={member.username}
          color={member.avatarColor}
          image={member.avatarImage}
          size={30}
          dimmed={!online}
          speaking={online && isSpeaking}
          ringOffsetColor="#0C0E14"
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0C0E14] ${
            online ? 'bg-[#10B981]' : 'bg-zinc-600'
          }`}
        />
      </div>
      <div className={`min-w-0 flex-1 ${online ? '' : 'opacity-50'}`}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="text-xs font-bold truncate"
              style={{ color: rankMeta.color }}
            >
              {member.username}
            </span>
            {isSelf && (
              <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                (sen)
              </span>
            )}
          </div>
          <RankBadge rank={member.rank} compact={false} />
        </div>
        {online && member.activeGame ? (
          <div className="text-[10px] text-[#10B981] font-medium truncate">
            🎮 {member.activeGame} oynuyor
          </div>
        ) : member.statusTag ? (
          <div className="text-[10px] text-zinc-500 truncate">
            {member.statusTag}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const MemberSidebar: React.FC = () => {
  const members = useSokakStore((s) => s.members);
  const users = useSokakStore((s) => s.users);
  const channels = useSokakStore((s) => s.channels);
  const userId = useSokakStore((s) => s.userId);
  const rankLevel = useSokakStore((s) => s.rankLevel);
  const activeVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const isOpen = useSokakStore((s) => s.isMemberListOpen);
  const userVolumes = useSokakStore((s) => s.userVolumes);
  const setUserVolume = useSokakStore((s) => s.setUserVolume);
  const toggleUserLocalMute = useSokakStore((s) => s.toggleUserLocalMute);

  const [ctxMenu, setCtxMenu] = useState<ContextMenuPos | null>(null);
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);

  const speakingIds = useMemo(
    () => new Set(users.filter((u) => u.isSpeaking).map((u) => u.userId)),
    [users]
  );

  const online = members.filter((m) => m.isOnline);
  const offline = members.filter((m) => !m.isOnline);

  const onlineGroups = useMemo(() => {
    return RANK_ORDER.map((role) => {
      const meta = getRankMeta(role);
      const list = online.filter((m) => (m.rank || 'ROOKIE') === role);
      return { role, meta, list };
    }).filter((g) => g.list.length > 0);
  }, [online]);

  if (!isOpen) return null;

  const inspectedMember = inspectedUserId
    ? members.find((m) => m.userId === inspectedUserId) || null
    : null;
  const inspectedRankMeta = inspectedMember
    ? getRankMeta(inspectedMember.rank)
    : null;
  const inspectedVoiceChannel = inspectedMember?.activeVoiceChannelId
    ? channels.find((c) => c.id === inspectedMember.activeVoiceChannelId)
    : null;

  const handleRightClick = (e: React.MouseEvent, member: MemberEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      target: {
        userId: member.userId,
        username: member.username,
        rank: member.rank,
        avatarColor: member.avatarColor,
        avatarImage: member.avatarImage,
        activeVoiceChannelId: member.activeVoiceChannelId,
        isOnline: member.isOnline,
      },
    });
  };

  return (
    <aside
      className="h-full cyber-sidebar-surface border-l border-white/[0.07] flex flex-col shrink-0 select-none"
      style={{ width: 252 }}
    >
      {/* SEÇİLİ OYUNCU ESPOR KÜNYESİ (Tıklayınca Açılan Kart) */}
      {inspectedMember && inspectedRankMeta && (
        <div
          className="m-2.5 p-3 rounded-lg bg-[#12151F] border border-white/[0.10] space-y-2.5 relative"
          style={{ borderTop: `2px solid ${inspectedRankMeta.color}` }}
        >
          <button
            onClick={() => setInspectedUserId(null)}
            className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-200"
            title="Künyeyi Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2.5 pr-4">
            <Avatar
              username={inspectedMember.username}
              color={inspectedMember.avatarColor}
              image={inspectedMember.avatarImage}
              size={38}
              speaking={speakingIds.has(inspectedMember.userId)}
              ringOffsetColor="#12151F"
            />
            <div className="min-w-0">
              <div
                className="text-xs font-extrabold truncate"
                style={{ color: inspectedRankMeta.color }}
              >
                {inspectedMember.username}
              </div>
              <div className="mt-0.5">
                <RankBadge rank={inspectedMember.rank} pill />
              </div>
            </div>
          </div>

          <div className="text-[10px] space-y-1 pt-1 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Durum:</span>
              <span className="font-mono text-zinc-200 flex items-center gap-1">
                <Radio
                  className={`w-2.5 h-2.5 ${
                    inspectedMember.isOnline
                      ? 'text-[#10B981]'
                      : 'text-zinc-500'
                  }`}
                />
                {inspectedMember.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </span>
            </div>
            {inspectedMember.activeGame && (
              <div className="flex items-center justify-between text-zinc-400">
                <span>Aktif Oyun:</span>
                <span className="font-semibold text-[#10B981] truncate max-w-[120px]">
                  🎮 {inspectedMember.activeGame}
                </span>
              </div>
            )}
            {inspectedVoiceChannel && (
              <div className="flex items-center justify-between text-zinc-400">
                <span>Ses Odası:</span>
                <span className="font-semibold text-zinc-200 truncate max-w-[120px]">
                  {inspectedVoiceChannel.name}
                </span>
              </div>
            )}
          </div>

          {/* Kişi Bazlı Ses Seviyesi (%0 - %200 GainNode) & Yerel Susturma */}
          {inspectedMember.userId !== userId && (
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 font-medium flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-[#10B981]" />
                  <span>Kullanıcı Sesi</span>
                </span>
                <span className="font-mono font-bold tabular-nums text-[#10B981]">
                  %{userVolumes[inspectedMember.userId]?.volume ?? 100}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={userVolumes[inspectedMember.userId]?.volume ?? 100}
                onChange={(e) => {
                  setUserVolume(inspectedMember.userId, Number(e.target.value));
                  rtcEngine.syncAllPeerVolumes();
                }}
                className="w-full accent-[#10B981] cursor-pointer"
              />
              <div className="flex items-center justify-between gap-1.5">
                <button
                  onClick={() => {
                    setUserVolume(inspectedMember.userId, 100);
                    rtcEngine.syncAllPeerVolumes();
                  }}
                  className="px-2 py-0.5 rounded bg-[#07080C] border border-white/[0.06] text-[10px] text-zinc-400 hover:text-zinc-200"
                >
                  %100 Sıfırla
                </button>
                <button
                  onClick={() => {
                    toggleUserLocalMute(inspectedMember.userId);
                    rtcEngine.syncAllPeerVolumes();
                  }}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                    userVolumes[inspectedMember.userId]?.localMuted
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                      : 'bg-[#07080C] border-white/[0.06] text-zinc-300 hover:text-white'
                  }`}
                >
                  {userVolumes[inspectedMember.userId]?.localMuted
                    ? 'Sesi Geri Aç'
                    : 'Yerel Sustur'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            {inspectedVoiceChannel &&
              inspectedVoiceChannel.id !== activeVoiceChannelId && (
                <button
                  onClick={() =>
                    rtcEngine.joinVoiceChannel(inspectedVoiceChannel.id)
                  }
                  className="flex-1 py-1 px-2 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/40 text-[#10B981] text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Odasına Katıl</span>
                </button>
              )}
            {rankLevel >= 4 &&
              activeVoiceChannelId &&
              inspectedMember.userId !== userId &&
              inspectedMember.isOnline && (
                <button
                  onClick={() =>
                    rtcEngine.adminMoveUser(
                      inspectedMember.userId,
                      activeVoiceChannelId
                    )
                  }
                  className="flex-1 py-1 px-2 rounded bg-[#5865F2]/20 hover:bg-[#5865F2]/30 border border-[#5865F2]/40 text-[#5865F2] text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <ArrowRightCircle className="w-3 h-3" />
                  <span>Yanıma Çek</span>
                </button>
              )}
            <button
              onClick={(e) => handleRightClick(e, inspectedMember)}
              className="py-1 px-2 rounded bg-[#07080C] hover:bg-[#191E2E] border border-white/[0.08] text-zinc-300 text-[10px] font-mono flex items-center gap-1"
              title="Ses Mikseri & Yetki Menüsü"
            >
              <Sliders className="w-3 h-3" />
              <span>Yönet</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* BÖLÜM 1: ÇEVRİMİÇİ (Rütbe Hiyerarşisine Göre Gruplanmış) */}
        <section className="space-y-3">
          <div className="px-2 flex items-center justify-between">
            <h3 className="text-[10px] font-extrabold tracking-wider uppercase text-[#10B981] tabular-nums">
              ● ÇEVRİMİÇİ — {online.length}
            </h3>
            <span className="text-[9px] font-mono text-zinc-500">
              Tıkla: Künye / Sağ: Yetki
            </span>
          </div>

          {onlineGroups.map((group) => (
            <div key={group.role} className="space-y-0.5">
              <div
                className="mx-1 px-2 py-0.5 rounded bg-[#07080C]/80 border border-white/[0.05] text-[9px] font-mono font-bold tracking-wider uppercase tabular-nums flex items-center justify-between"
                style={{ color: group.meta.color }}
              >
                <span>{group.meta.groupHeader}</span>
                <span>{group.list.length}</span>
              </div>
              {group.list.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  isSelf={m.userId === userId}
                  isSpeaking={speakingIds.has(m.userId)}
                  isSelected={inspectedUserId === m.userId}
                  onLeftClick={(mem) =>
                    setInspectedUserId(
                      inspectedUserId === mem.userId ? null : mem.userId
                    )
                  }
                  onRightClick={handleRightClick}
                />
              ))}
            </div>
          ))}

          {online.length === 0 && (
            <p className="px-2 text-[11px] text-zinc-600">
              Şu an kimse çevrimiçi değil.
            </p>
          )}
        </section>

        {/* BÖLÜM 2: ÇEVRİMDIŞI */}
        <section>
          <h3 className="px-2 mb-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500 tabular-nums">
            ○ ÇEVRİMDIŞI — {offline.length}
          </h3>
          <div className="space-y-0.5">
            {offline.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                isSelf={false}
                isSpeaking={false}
                isSelected={inspectedUserId === m.userId}
                onLeftClick={(mem) =>
                  setInspectedUserId(
                    inspectedUserId === mem.userId ? null : mem.userId
                  )
                }
                onRightClick={handleRightClick}
              />
            ))}
            {offline.length === 0 && (
              <p className="px-2 text-[11px] text-zinc-600">Herkes burada 🎉</p>
            )}
          </div>
        </section>
      </div>

      {ctxMenu && (
        <UserContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          target={ctxMenu.target}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </aside>
  );
};
