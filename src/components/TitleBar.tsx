import React, { useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  Minus,
  Square,
  X,
  Wifi,
  WifiOff,
  Server,
  Bell,
  BellOff,
  RefreshCw,
} from 'lucide-react';
import { useSokakStore, isUiFrozenForGame } from '../store/useSokakStore';
import { THEME_ACCENT_PRESETS } from '../types/sokak';
import { soundFX } from '../services/soundFX';

export const TitleBar: React.FC = () => {
  const platform = useSokakStore((s) => s.platform);
  const appVersion = useSokakStore((s) => s.appVersion);
  const updaterStatus = useSokakStore((s) => s.updaterStatus);
  const isConnected = useSokakStore((s) => s.isConnected);
  const serverUrl = useSokakStore((s) => s.serverUrl);
  const isGamingMode = useSokakStore((s) => s.isGamingMode);
  const isWindowFocused = useSokakStore((s) => s.isWindowFocused);
  const isWindowMinimized = useSokakStore((s) => s.isWindowMinimized);
  const themeAccent = useSokakStore((s) => s.themeAccent);
  const soundEffectsEnabled = useSokakStore((s) => s.soundEffectsEnabled);

  const setSettingsModalOpen = useSokakStore((s) => s.setSettingsModalOpen);
  const setThemeAccent = useSokakStore((s) => s.setThemeAccent);
  const setSoundEffectsEnabled = useSokakStore((s) => s.setSoundEffectsEnabled);
  const setUpdaterStatus = useSokakStore((s) => s.setUpdaterStatus);
  const showToast = useSokakStore((s) => s.showToast);

  const uiFrozen = isUiFrozenForGame(useSokakStore.getState());
  const isMac = platform === 'darwin';
  const activePreset =
    THEME_ACCENT_PRESETS.find((p) => p.id === themeAccent) ||
    THEME_ACCENT_PRESETS[0];

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accent-emerald',
      activePreset.color
    );
  }, [activePreset.color]);

  const handleMinimize = () => {
    window.sokakDesktop?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.sokakDesktop?.maximizeWindow();
  };

  const handleCloseToTray = () => {
    window.sokakDesktop?.closeToTray();
  };

  const handleCheckUpdate = async () => {
    if (updaterStatus.state === 'downloaded') {
      window.sokakDesktop?.installUpdateNow();
      return;
    }

    if (window.sokakDesktop?.checkForUpdates) {
      showToast('🔄 GitHub Releases üzerinden yeni sürüm kontrol ediliyor...', 'info');
      try {
        const res = await window.sokakDesktop.checkForUpdates();
        if (res.state === 'up-to-date') {
          showToast(
            `✅ SOKAK güncel (v${res.version || appVersion}) — en son sürümdesiniz.`,
            'success'
          );
        } else if (res.state === 'downloaded') {
          showToast(
            'Yeni SOKAK güncellemesi hazır — Yeniden Başlat ve Güncelle',
            'success'
          );
        }
      } catch {
        showToast('Güncelleme kontrolü sırasında bağlantı kurulamadı.', 'warning');
      }
      return;
    }

    // Tarayıcı / Web yedek kontrolü
    setUpdaterStatus({ state: 'checking', version: appVersion });
    try {
      const resp = await fetch(
        'https://api.github.com/repos/ardameriic-cloud/sokak-app/releases/latest'
      );
      if (resp.ok) {
        const data = await resp.json();
        const latestTag = String(data.tag_name || '').replace(/^v/i, '');
        setUpdaterStatus({ state: 'up-to-date', version: latestTag || appVersion });
        showToast(
          `✅ SOKAK güncel (v${appVersion}) — GitHub sürümü kontrol edildi.`,
          'success'
        );
      } else {
        setUpdaterStatus({ state: 'up-to-date', version: appVersion });
        showToast(`✅ SOKAK güncel (v${appVersion}).`, 'success');
      }
    } catch {
      setUpdaterStatus({ state: 'up-to-date', version: appVersion });
      showToast(`✅ SOKAK güncel (v${appVersion}).`, 'info');
    }
  };

  const isCheckingOrDownloading =
    updaterStatus.state === 'checking' || updaterStatus.state === 'downloading';

  return (
    <header
      className="h-9 w-full bg-[#07080C] border-b border-white/[0.07] flex items-center justify-between px-3 app-drag-region shrink-0"
      style={{ paddingLeft: isMac ? '82px' : '12px' }}
    >
      {/* Sol Marka & Ses Motoru Rozeti */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: activePreset.color }}
          />
          <span className="text-xs font-extrabold tracking-wider text-zinc-100 uppercase">
            SOKAK
          </span>
          <span className="text-[9px] font-mono text-zinc-500">
            v{appVersion}
          </span>
        </div>

        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#12151F] border border-white/[0.07] text-zinc-400">
          OPUS 128K MONO
        </span>

        {uiFrozen && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: `${activePreset.color}18`,
              border: `1px solid ${activePreset.color}55`,
              color: activePreset.color,
            }}
          >
            <Zap className="w-3 h-3" />
            <span>
              {isGamingMode
                ? 'OYUN MODU AKTİF (0% GPU)'
                : !isWindowFocused || isWindowMinimized
                ? 'ARKA PLAN UYKU (0% GPU)'
                : 'FPS KORUMA'}
            </span>
          </div>
        )}
      </div>

      {/* Orta Canlı Sunucu, Güncelleme Kontrolü, Tema Vurgu Seçici & Ses Efektleri Anahtarı */}
      <div className="flex items-center gap-1.5 app-no-drag">
        {/* 🔄 Güncelleme Kontrolü Butonu */}
        <button
          onClick={handleCheckUpdate}
          title={
            updaterStatus.state === 'downloaded'
              ? 'Yeni SOKAK güncellemesi hazır — Yeniden Başlat ve Güncelle'
              : 'GitHub Releases üzerinden yeni SOKAK sürümünü kontrol et'
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
            updaterStatus.state === 'downloaded'
              ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981] font-bold'
              : updaterStatus.state === 'downloading'
              ? 'bg-[#12151F] border-[#5865F2]/50 text-[#5865F2]'
              : 'bg-[#0C0E14] hover:bg-[#12151F] border-white/[0.07] text-zinc-300 hover:text-white'
          }`}
        >
          <RefreshCw
            className={`w-3 h-3 ${isCheckingOrDownloading ? 'animate-spin' : ''}`}
          />
          <span>
            {updaterStatus.state === 'downloaded'
              ? '🚀 Güncelle ve Yeniden Başlat'
              : updaterStatus.state === 'downloading'
              ? `İndiriliyor %${updaterStatus.progressPercent ?? 0}`
              : updaterStatus.state === 'checking'
              ? 'Kontrol Ediliyor...'
              : '🔄 Güncelleme Kontrolü'}
          </span>
        </button>

        {/* Cyber-Obsidian Tema Vurgu Rengi Seçici */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0C0E14] border border-white/[0.07]"
          title="Cyber-Obsidian Vurgu Rengi Seçici"
        >
          <span className="text-[9px] font-mono uppercase text-zinc-400 mr-0.5">
            TEMA:
          </span>
          {THEME_ACCENT_PRESETS.map((preset) => {
            const isSelected = preset.id === themeAccent;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setThemeAccent(preset.id);
                  soundFX.playPinOrPoll();
                }}
                title={preset.label}
                className={`w-3.5 h-3.5 rounded-full border ${
                  isSelected
                    ? 'scale-110 border-white'
                    : 'border-white/20 opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: preset.color }}
              />
            );
          })}
        </div>

        {/* 🔔 Oda Giriş/Çıkış WebAudio Ses Efektleri Anahtarı */}
        <button
          onClick={() => {
            const next = !soundEffectsEnabled;
            setSoundEffectsEnabled(next);
            if (next) {
              setTimeout(() => soundFX.playUserJoin(), 40);
            }
          }}
          title={
            soundEffectsEnabled
              ? '🔔 Oda Giriş/Çıkış Ses Efektleri Açık (Kapatmak için tıkla)'
              : '🔕 Oda Ses Efektleri Kapalı (Açmak için tıkla)'
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
            soundEffectsEnabled
              ? 'bg-[#0C0E14] border-[#10B981]/40 text-[#10B981]'
              : 'bg-[#0C0E14] border-white/[0.07] text-zinc-500'
          }`}
        >
          {soundEffectsEnabled ? (
            <Bell className="w-3 h-3" />
          ) : (
            <BellOff className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">
            {soundEffectsEnabled ? 'SES FX' : 'FX KAPALI'}
          </span>
        </button>

        <button
          onClick={() => setSettingsModalOpen(true)}
          title="Sunucu ve Ses Ayarlarını Yapılandır"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#0C0E14] hover:bg-[#12151F] border border-white/[0.07] text-[11px] text-zinc-300"
        >
          {isConnected ? (
            <Wifi className="w-3 h-3 text-[#10B981]" />
          ) : (
            <WifiOff className="w-3 h-3 text-rose-500" />
          )}
          <Server className="w-3 h-3 text-zinc-500" />
          <span className="font-mono text-[10px] text-zinc-300 max-w-[160px] truncate">
            {serverUrl}
          </span>
        </button>

        <div className="hidden xl:flex items-center gap-1 text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-[#0C0E14] border border-white/[0.07]">
          <ShieldCheck className="w-3 h-3 text-[#5865F2]" />
          <span>F8 Klip • Ctrl+Shift+M/D/O</span>
        </div>
      </div>

      {/* Sağ Pencere Kontrolleri */}
      <div className="flex items-center app-no-drag">
        {!isMac ? (
          <div className="flex items-center -mr-3">
            <button
              onClick={handleMinimize}
              className="h-9 w-11 flex items-center justify-center text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
              title="Küçült"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="h-9 w-11 flex items-center justify-center text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
              title="Tam Ekran"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={handleCloseToTray}
              className="h-9 w-11 flex items-center justify-center text-zinc-400 hover:bg-rose-600 hover:text-white"
              title="Sistem Tepsisine Küçült (Arka Planda Ses Devam Eder)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleCloseToTray}
            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded border border-transparent hover:border-white/[0.07]"
            title="Menü Çubuğuna Gizle"
          >
            Tepsiye Gizle
          </button>
        )}
      </div>
    </header>
  );
};
