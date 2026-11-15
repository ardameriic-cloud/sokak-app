import React, { useEffect, useState } from 'react';
import { MicOff, Headphones, Radio } from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import {
  getRankMeta,
  OverlayOccupantItem,
  OverlayStatePayload,
} from '../types/sokak';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';

interface InGameOverlayProps {
  standalone?: boolean;
}

export const InGameOverlay: React.FC<InGameOverlayProps> = ({
  standalone = false,
}) => {
  const storeActiveVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const storeChannels = useSokakStore((s) => s.channels);
  const storeUsers = useSokakStore((s) => s.users);
  const isOverlayActive = useSokakStore((s) => s.isOverlayActive);

  const [ipcState, setIpcState] = useState<OverlayStatePayload>({
    channelName: null,
    occupants: [],
  });

  useEffect(() => {
    if (!standalone) return;
    document.body.classList.add('sokak-overlay-mode');
    document.documentElement.classList.add('sokak-overlay-mode');

    let unsub: (() => void) | undefined;
    if (window.sokakDesktop?.onOverlayStateUpdated) {
      unsub = window.sokakDesktop.onOverlayStateUpdated((state) => {
        setIpcState(state);
      });
    }

    return () => {
      unsub?.();
      document.body.classList.remove('sokak-overlay-mode');
      document.documentElement.classList.remove('sokak-overlay-mode');
    };
  }, [standalone]);

  // Web/Ana pencere kompakt HUD verisi
  const storeChannelObj = storeChannels.find(
    (c) => c.id === storeActiveVoiceChannelId
  );
  const storeOccupants: OverlayOccupantItem[] = storeActiveVoiceChannelId
    ? storeUsers
        .filter((u) => u.activeVoiceChannelId === storeActiveVoiceChannelId)
        .map((u) => ({
          userId: u.userId,
          username: u.username,
          rank: u.rank,
          avatarColor: u.avatarColor,
          avatarImage: u.avatarImage,
          isSpeaking: u.isSpeaking,
          isMuted: u.isMuted,
          isDeafened: u.isDeafened,
          pingMs: u.pingMs,
        }))
    : [];

  const channelName = standalone
    ? ipcState.channelName
    : storeChannelObj?.name || null;
  const occupants = standalone ? ipcState.occupants : storeOccupants;

  if (!standalone && !isOverlayActive) {
    return null;
  }

  return (
    <div
      className={
        standalone
          ? 'w-screen h-screen bg-transparent p-2.5 pointer-events-none select-none overflow-hidden'
          : 'fixed top-11 left-3 z-50 pointer-events-none select-none'
      }
    >
      <div className="w-64 space-y-1.5">
        {/* Üst HUD Başlık Rozeti */}
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#07080C]/90 border border-white/[0.10]">
          <span className="w-2 h-2 rounded-full bg-[#10B981]" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[#10B981]">
            SOKAK HUD
          </span>
          <span className="text-[10px] font-medium text-zinc-300 truncate max-w-[130px]">
            {channelName ? `• ${channelName}` : '• Ses Kanalı Bekleniyor'}
          </span>
        </div>

        {/* Sadece Aktif Ses Kanalındaki Kullanıcılar */}
        {occupants.length > 0 ? (
          <div className="space-y-1">
            {occupants.map((occ) => {
              const rankMeta = getRankMeta(occ.rank);
              const speaking = occ.isSpeaking && !occ.isMuted;

              return (
                <div
                  key={occ.userId}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#0C0E14]/95 border ${
                    speaking
                      ? 'border-[#10B981] opacity-100'
                      : 'border-white/[0.08] opacity-40'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar
                      username={occ.username}
                      color={occ.avatarColor}
                      image={occ.avatarImage}
                      size={24}
                      speaking={speaking}
                      ringOffsetColor="#0C0E14"
                    />
                    <span
                      className="text-xs font-bold truncate"
                      style={{ color: rankMeta.color }}
                    >
                      {occ.username}
                    </span>
                    <RankBadge rank={occ.rank} compact={false} />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {occ.isMuted && (
                      <span className="p-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-500">
                        <MicOff className="w-3 h-3" />
                      </span>
                    )}
                    {occ.isDeafened && (
                      <span className="p-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-500">
                        <Headphones className="w-3 h-3" />
                      </span>
                    )}
                    {speaking && !occ.isMuted && (
                      <Radio className="w-3 h-3 text-[#10B981]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-2.5 py-1.5 rounded bg-[#0C0E14]/80 border border-white/[0.07] text-[10px] font-mono text-zinc-400">
            Aktif ses kanalında kimse yok (Gizlemek için Ctrl+Shift+O)
          </div>
        )}
      </div>
    </div>
  );
};
