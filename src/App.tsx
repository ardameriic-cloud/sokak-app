import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { StreamStage } from './components/StreamStage';
import { ChatArea } from './components/ChatArea';
import { ScreenPickerModal } from './components/ScreenPickerModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthScreen } from './components/AuthScreen';
import { InGameOverlay } from './components/InGameOverlay';
import { useSokakStore, isUiFrozenForGame } from './store/useSokakStore';
import { rtcEngine } from './services/rtcEngine';
import { authApi } from './services/authApi';

export const App: React.FC = () => {
  const isStandaloneOverlay =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('overlay') === '1';

  const authStatus = useSokakStore((s) => s.authStatus);
  const authToken = useSokakStore((s) => s.authToken);
  const toastNotice = useSokakStore((s) => s.toastNotice);
  const clearToast = useSokakStore((s) => s.clearToast);
  const isGamingMode = useSokakStore((s) => s.isGamingMode);
  const isWindowFocused = useSokakStore((s) => s.isWindowFocused);
  const isWindowMinimized = useSokakStore((s) => s.isWindowMinimized);
  const activeVoiceChannelId = useSokakStore((s) => s.activeVoiceChannelId);
  const channels = useSokakStore((s) => s.channels);
  const users = useSokakStore((s) => s.users);

  const setWindowVisibility = useSokakStore((s) => s.setWindowVisibility);
  const setPlatformInfo = useSokakStore((s) => s.setPlatformInfo);
  const setSession = useSokakStore((s) => s.setSession);
  const clearSession = useSokakStore((s) => s.clearSession);
  const setOverlayActive = useSokakStore((s) => s.setOverlayActive);

  // Pencere odak dışı olduğunda tüm CSS animasyonlarını dondur
  useEffect(() => {
    if (isStandaloneOverlay) return;
    const frozen = isUiFrozenForGame(useSokakStore.getState());
    if (frozen) {
      document.body.classList.add('sokak-ui-frozen');
    } else {
      document.body.classList.remove('sokak-ui-frozen');
    }
  }, [isStandaloneOverlay, isGamingMode, isWindowFocused, isWindowMinimized]);

  // Otomatik Giriş ("Beni Hatırla" oturum doğrulaması)
  useEffect(() => {
    if (isStandaloneOverlay) return;
    if (!authToken) {
      clearSession(null);
      return;
    }
    if (authStatus === 'authenticated') {
      rtcEngine.connect();
      return;
    }

    let cancelled = false;
    authApi
      .me(authToken)
      .then((res) => {
        if (cancelled) return;
        const remembered = Boolean(localStorage.getItem('sokak_auth_token'));
        setSession(authToken, res.user, remembered);
        rtcEngine.connect();
      })
      .catch(() => {
        if (cancelled) return;
        clearSession(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isStandaloneOverlay, authToken]);

  // Aktif ses kanalı katılımcılarını Oyun İçi HUD (Overlay) penceresine senkronize et
  useEffect(() => {
    if (isStandaloneOverlay) return;
    if (!window.sokakDesktop?.syncOverlayState) return;

    const channelObj = channels.find((c) => c.id === activeVoiceChannelId);
    const occupants = activeVoiceChannelId
      ? users
          .filter((u) => u.activeVoiceChannelId === activeVoiceChannelId)
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

    window.sokakDesktop.syncOverlayState({
      channelName: channelObj?.name || null,
      occupants,
    });
  }, [isStandaloneOverlay, activeVoiceChannelId, channels, users]);

  // Masaüstü kısayolları ve pencere görünürlük izleyicisi
  useEffect(() => {
    if (isStandaloneOverlay) return;

    const handleVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      setWindowVisibility(!hidden && document.hasFocus(), hidden);
    };

    const handleWindowBlur = () => {
      setWindowVisibility(false, document.visibilityState === 'hidden');
    };

    const handleWindowFocus = () => {
      setWindowVisibility(true, false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'm') {
          e.preventDefault();
          rtcEngine.toggleMute();
        } else if (key === 'd') {
          e.preventDefault();
          rtcEngine.toggleDeafen();
        } else if (key === 'o') {
          e.preventDefault();
          if (window.sokakDesktop?.toggleOverlayWindow) {
            window.sokakDesktop
              .toggleOverlayWindow()
              .then((res) => setOverlayActive(res.visible))
              .catch(() => {});
          } else {
            const current = useSokakStore.getState().isOverlayActive;
            setOverlayActive(!current);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let unsubMute: (() => void) | undefined;
    let unsubDeafen: (() => void) | undefined;
    let unsubVisibility: (() => void) | undefined;
    let unsubGameDetected: (() => void) | undefined;
    let unsubOverlayVisibility: (() => void) | undefined;

    if (window.sokakDesktop) {
      window.sokakDesktop
        .getPlatformInfo()
        .then((info) => {
          setPlatformInfo(info.platform, info.disableHardwareAcceleration);
        })
        .catch(() => {});

      unsubMute = window.sokakDesktop.onToggleMuteShortcut(() => {
        rtcEngine.toggleMute();
      });

      unsubDeafen = window.sokakDesktop.onToggleDeafenShortcut(() => {
        rtcEngine.toggleDeafen();
      });

      unsubVisibility = window.sokakDesktop.onWindowVisibilityState((state) => {
        setWindowVisibility(state.isFocused, state.isMinimized);
      });

      if (window.sokakDesktop.onGameDetected) {
        unsubGameDetected = window.sokakDesktop.onGameDetected((gameName) => {
          rtcEngine.updateDetectedGame(gameName);
        });
      }

      if (window.sokakDesktop.onOverlayVisibilityChanged) {
        unsubOverlayVisibility = window.sokakDesktop.onOverlayVisibilityChanged(
          (visible) => {
            setOverlayActive(visible);
          }
        );
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown);
      unsubMute?.();
      unsubDeafen?.();
      unsubVisibility?.();
      unsubGameDetected?.();
      unsubOverlayVisibility?.();
    };
  }, [isStandaloneOverlay, setPlatformInfo, setWindowVisibility, setOverlayActive]);

  // İkincil Şeffaf Click-Through Oyun İçi HUD Penceresi (?overlay=1)
  if (isStandaloneOverlay) {
    return <InGameOverlay standalone />;
  }

  if (authStatus === 'checking') {
    return (
      <div className="w-screen h-screen bg-[#07080C] text-zinc-100 flex flex-col items-center justify-center select-none gap-3">
        <div className="w-11 h-11 rounded-lg bg-[#0C0E14] border border-white/[0.08] flex items-center justify-center text-sm font-black text-[#10B981]">
          SK
        </div>
        <div className="text-xs font-bold tracking-[0.2em] text-zinc-400">
          SOKAK OTURUMU DOĞRULANIYOR...
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return <AuthScreen />;
  }

  return (
    <div className="w-screen h-screen bg-[#07080C] text-zinc-100 flex flex-col overflow-hidden select-none">
      <TitleBar />
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <StreamStage />
          <ChatArea />
        </div>
        {/* Kompakt Oyun İçi HUD Yedek Görünümü (Web / LAN ve Pencere İçi Önizleme) */}
        <InGameOverlay standalone={false} />
      </div>
      <ScreenPickerModal />
      <SettingsModal />
      {toastNotice && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md px-4 py-2.5 rounded-md bg-[#12151F] border border-amber-500/40 text-xs text-zinc-100 flex items-center justify-between gap-3">
          <span>{toastNotice.message}</span>
          <button
            onClick={clearToast}
            className="text-[10px] font-mono text-zinc-400 hover:text-white shrink-0"
          >
            Kapat
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
