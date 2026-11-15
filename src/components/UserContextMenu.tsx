import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  ChevronRight,
  PhoneOff,
  Shield,
  UserPlus,
  Volume2,
  Check,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import {
  ASSIGNABLE_RANKS,
  getRankMeta,
  RankRole,
} from '../types/sokak';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';

export interface UserContextTarget {
  userId: string;
  username: string;
  rank: RankRole;
  avatarColor: string;
  avatarImage?: string | null;
  activeVoiceChannelId?: string | null;
  isOnline?: boolean;
}

interface UserContextMenuProps {
  x: number;
  y: number;
  target: UserContextTarget;
  onClose: () => void;
}

export const UserContextMenu: React.FC<UserContextMenuProps> = ({
  x,
  y,
  target,
  onClose,
}) => {
  const selfUserId = useSokakStore((s) => s.userId);
  const selfRank = useSokakStore((s) => s.rank);
  const selfRankLevel = useSokakStore((s) => s.rankLevel);
  const selfVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const channels = useSokakStore((s) => s.channels);
  const userVolumes = useSokakStore((s) => s.userVolumes);
  const setUserVolume = useSokakStore((s) => s.setUserVolume);
  const toggleUserLocalMute = useSokakStore((s) => s.toggleUserLocalMute);

  const [openSubMenu, setOpenSubMenu] = useState<'move' | 'rank' | null>(null);

  useEffect(() => {
    const handleOutside = () => onClose();
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, [onClose]);

  const isSelf = target.userId === selfUserId;
  const isAdminOrLeader = selfRankLevel >= 4; // ADMIN (4) veya LEADER (5)
  const targetMeta = getRankMeta(target.rank);
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const canPullToMyChannel =
    isAdminOrLeader &&
    !isSelf &&
    Boolean(target.isOnline) &&
    Boolean(selfVoiceChannelId) &&
    target.activeVoiceChannelId !== selfVoiceChannelId;

  const canMoveToAnyChannel = isAdminOrLeader && !isSelf && Boolean(target.isOnline);
  const canKickFromVoice =
    isAdminOrLeader &&
    !isSelf &&
    Boolean(target.activeVoiceChannelId) &&
    !(selfRank !== 'LEADER' && target.rank === 'LEADER');

  const canChangeRank =
    isAdminOrLeader &&
    !isSelf &&
    target.rank !== 'LEADER' &&
    !(selfRank === 'ADMIN' && targetMeta.level >= 4);

  const safeX = Math.min(x, window.innerWidth - 280);
  const safeY = Math.min(y, window.innerHeight - 360);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ top: safeY, left: safeX }}
      className="fixed z-50 w-64 rounded-md bg-[#151821] border border-white/[0.12] p-3 space-y-2.5 select-none"
    >
      {/* Üst Kullanıcı Başlığı & Rütbe Rozeti */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            username={target.username}
            color={target.avatarColor}
            image={target.avatarImage}
            size={24}
          />
          <span
            className="text-xs font-bold truncate"
            style={{ color: targetMeta.color }}
          >
            {target.username}
          </span>
        </div>
        <RankBadge rank={target.rank} />
      </div>

      {/* BÖLÜM 1: KULLANICI SES MİKSERİ (Kendisi değilse) */}
      {isSelf ? (
        <p className="text-[11px] text-zinc-400">
          Kendi mikrofon seviyenizi ve gürültü filtresi eşik değerinizi Ayarlar menüsünden yapılandırabilirsiniz.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Kullanıcı Sesi</span>
            </span>
            <span className="font-mono font-bold tabular-nums text-[#10B981]">
              %{userVolumes[target.userId]?.volume ?? 100}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={userVolumes[target.userId]?.volume ?? 100}
            onChange={(e) => {
              const val = Number(e.target.value);
              setUserVolume(target.userId, val);
              rtcEngine.syncAllPeerVolumes();
            }}
            className="w-full accent-[#10B981] cursor-pointer"
          />
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => {
                setUserVolume(target.userId, 100);
                rtcEngine.syncAllPeerVolumes();
              }}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded bg-[#0F1117] border border-white/[0.06]"
            >
              %100 Sıfırla
            </button>

            <button
              onClick={() => {
                toggleUserLocalMute(target.userId);
                rtcEngine.syncAllPeerVolumes();
              }}
              className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                userVolumes[target.userId]?.localMuted
                  ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                  : 'bg-[#0F1117] border-white/[0.06] text-zinc-300 hover:text-white'
              }`}
            >
              {userVolumes[target.userId]?.localMuted
                ? 'Sesi Geri Aç'
                : 'Yerel Sustur'}
            </button>
          </div>
        </div>
      )}

      {/* BÖLÜM 2: LEADER & ADMIN YETKİ KONTROLLERİ */}
      {isAdminOrLeader && !isSelf && (
        <div className="pt-2 border-t border-white/[0.08] space-y-1">
          <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 px-1 mb-1">
            Yönetici Kontrolleri ({selfRank})
          </div>

          {/* 1. Yanıma Çek (Pull to My Channel) */}
          <button
            disabled={!canPullToMyChannel}
            onClick={() => {
              if (!selfVoiceChannelId) return;
              rtcEngine.adminMoveUser(target.userId, selfVoiceChannelId);
              onClose();
            }}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left bg-[#0F1117] hover:bg-[#1C202C] disabled:opacity-40 border border-white/[0.06] text-zinc-200"
            title={
              !selfVoiceChannelId
                ? 'Önce bir ses kanalına katılın'
                : 'Kullanıcıyı kendi ses kanalınıza çeker (kanal kilidini aşar)'
            }
          >
            <span className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Yanıma Çek (Pull to My Channel)</span>
            </span>
          </button>

          {/* 2. Başka Odaya Taşı (Move to Channel...) */}
          {canMoveToAnyChannel && (
            <div className="space-y-1">
              <button
                onClick={() =>
                  setOpenSubMenu(openSubMenu === 'move' ? null : 'move')
                }
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left bg-[#0F1117] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-200"
              >
                <span className="flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-[#5865F2]" />
                  <span>Başka Odaya Taşı (Move to...)</span>
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-zinc-400 ${
                    openSubMenu === 'move' ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {openSubMenu === 'move' && (
                <div className="pl-2 space-y-0.5 py-1 border-l border-white/[0.08]">
                  {voiceChannels.map((ch) => {
                    const isCurrent = target.activeVoiceChannelId === ch.id;
                    return (
                      <button
                        key={ch.id}
                        disabled={isCurrent}
                        onClick={() => {
                          rtcEngine.adminMoveUser(target.userId, ch.id);
                          onClose();
                        }}
                        className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] text-left hover:bg-[#0F1117] disabled:opacity-40 text-zinc-300 hover:text-white"
                      >
                        <span className="truncate">{ch.name}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-mono text-[#10B981]">
                            Odada
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Odadan At (Disconnect from Voice) */}
          {canKickFromVoice && (
            <button
              onClick={() => {
                rtcEngine.adminKickFromVoice(target.userId);
                onClose();
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300"
            >
              <span className="flex items-center gap-1.5">
                <PhoneOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Odadan At (Disconnect from Voice)</span>
              </span>
            </button>
          )}

          {/* 4. Rütbe Ver (Set Rank) */}
          {canChangeRank && (
            <div className="space-y-1">
              <button
                onClick={() =>
                  setOpenSubMenu(openSubMenu === 'rank' ? null : 'rank')
                }
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left bg-[#0F1117] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-200"
              >
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#A855F7]" />
                  <span>Rütbe Ver (Set Rank)</span>
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-zinc-400 ${
                    openSubMenu === 'rank' ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {openSubMenu === 'rank' && (
                <div className="pl-2 space-y-0.5 py-1 border-l border-white/[0.08]">
                  {ASSIGNABLE_RANKS.map((role) => {
                    const meta = getRankMeta(role);
                    const isCurrentRank = target.rank === role;
                    // ADMIN yalnızca CAPTAIN, MEMBER ve ROOKIE atayabilir; LEADER ise ADMIN dahil hepsini atayabilir
                    const disabledForAdmin =
                      selfRank === 'ADMIN' && role === 'ADMIN';
                    return (
                      <button
                        key={role}
                        disabled={disabledForAdmin}
                        onClick={() => {
                          rtcEngine.adminSetUserRank(target.userId, role);
                          onClose();
                        }}
                        className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] text-left hover:bg-[#0F1117] disabled:opacity-40"
                      >
                        <span
                          className="font-mono font-bold"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        {isCurrentRank && (
                          <Check className="w-3.5 h-3.5 text-[#10B981]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
