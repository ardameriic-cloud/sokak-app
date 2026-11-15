import React from 'react';
import { Crown, Shield, Star, UserCheck, User } from 'lucide-react';
import { getRankMeta, RankRole } from '../types/sokak';

interface RankBadgeProps {
  rank?: RankRole | null;
  compact?: boolean;
  pill?: boolean;
}

// Statik Cyber-Obsidian rütbe rozeti: sıfır blur, sıfır gölge, net 1px kenarlık
export const RankBadge: React.FC<RankBadgeProps> = ({
  rank,
  compact = false,
  pill = false,
}) => {
  const meta = getRankMeta(rank);

  const renderIcon = () => {
    switch (meta.role) {
      case 'LEADER':
        return <Crown className="w-2.5 h-2.5 shrink-0" />;
      case 'ADMIN':
        return <Shield className="w-2.5 h-2.5 shrink-0" />;
      case 'CAPTAIN':
        return <Star className="w-2.5 h-2.5 shrink-0" />;
      case 'MEMBER':
        return <UserCheck className="w-2.5 h-2.5 shrink-0" />;
      default:
        return <User className="w-2.5 h-2.5 shrink-0" />;
    }
  };

  const renderEmojiPrefix = () => {
    switch (meta.role) {
      case 'LEADER':
        return '👑 LEADER';
      case 'ADMIN':
        return '🛡️ ADMIN';
      case 'CAPTAIN':
        return '⭐ CAPTAIN';
      case 'MEMBER':
        return '✓ MEMBER';
      default:
        return '• ROOKIE';
    }
  };

  if (pill) {
    return (
      <span
        title={`Rütbe: ${meta.label} (Seviye ${meta.level})`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider uppercase shrink-0"
        style={{
          color: meta.color,
          backgroundColor: `${meta.color}16`,
          border: `1px solid ${meta.color}66`,
        }}
      >
        <span>{renderEmojiPrefix()}</span>
      </span>
    );
  }

  return (
    <span
      title={`Rütbe: ${meta.label} (Seviye ${meta.level})`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase shrink-0 bg-[#07080C]"
      style={{
        color: meta.color,
        border: `1px solid ${meta.color}55`,
      }}
    >
      {renderIcon()}
      {!compact && <span>{meta.shortLabel}</span>}
    </span>
  );
};
