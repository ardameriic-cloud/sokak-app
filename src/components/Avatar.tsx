import React from 'react';

interface AvatarProps {
  username: string;
  color: string;
  image?: string | null;
  size?: number; // piksel
  dimmed?: boolean;
  speaking?: boolean;
  ringOffsetColor?: string;
  className?: string;
}

// Statik avatar: gölge, blur veya animasyon yok — sadece düz renk / resim ve 2px halka
export const Avatar: React.FC<AvatarProps> = ({
  username,
  color,
  image,
  size = 28,
  dimmed = false,
  speaking = false,
  ringOffsetColor = '#090A0F',
  className = '',
}) => {
  const initials = (username || '?').slice(0, 2).toLocaleUpperCase('tr-TR');
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(9, Math.round(size * 0.36)),
    backgroundColor: image ? '#151821' : color,
    boxShadow: speaking ? `0 0 0 2px ${ringOffsetColor}, 0 0 0 4px #10B981` : undefined,
  };

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-zinc-950 shrink-0 overflow-hidden ${
        dimmed ? 'opacity-50' : ''
      } ${className}`}
      style={style}
    >
      {image ? (
        <img src={image} alt={username} className="w-full h-full object-cover" draggable={false} />
      ) : (
        initials
      )}
    </div>
  );
};
