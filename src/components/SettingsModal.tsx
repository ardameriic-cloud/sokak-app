import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Server,
  Mic,
  Zap,
  User,
  Check,
  Volume2,
  RotateCcw,
  LogOut,
  ImagePlus,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { soundFX } from '../services/soundFX';
import { authApi, resizeAvatarImage } from '../services/authApi';
import { Avatar } from './Avatar';

const AVATAR_COLORS = [
  '#10B981',
  '#5865F2',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#EF4444',
];

export const SettingsModal: React.FC = () => {
  const isOpen = useSokakStore((s) => s.isSettingsModalOpen);
  const setSettingsModalOpen = useSokakStore((s) => s.setSettingsModalOpen);

  const authToken = useSokakStore((s) => s.authToken);
  const username = useSokakStore((s) => s.username);
  const avatarColor = useSokakStore((s) => s.avatarColor);
  const avatarImage = useSokakStore((s) => s.avatarImage);
  const statusTag = useSokakStore((s) => s.statusTag);
  const serverUrl = useSokakStore((s) => s.serverUrl);
  const isConnected = useSokakStore((s) => s.isConnected);
  const connectionError = useSokakStore((s) => s.connectionError);
  const lanIps = useSokakStore((s) => s.lanIps);

  const noiseGateThresholdDb = useSokakStore((s) => s.noiseGateThresholdDb);
  const currentInputLevelDb = useSokakStore((s) => s.currentInputLevelDb);
  const selectedAudioInputDeviceId = useSokakStore(
    (s) => s.selectedAudioInputDeviceId
  );
  const isGamingMode = useSokakStore((s) => s.isGamingMode);
  const disableHwAccelOnRestart = useSokakStore(
    (s) => s.disableHwAccelOnRestart
  );

  const setServerUrl = useSokakStore((s) => s.setServerUrl);
  const clearSession = useSokakStore((s) => s.clearSession);
  const setNoiseGateThresholdDb = useSokakStore(
    (s) => s.setNoiseGateThresholdDb
  );
  const setSelectedAudioInputDeviceId = useSokakStore(
    (s) => s.setSelectedAudioInputDeviceId
  );
  const setGamingMode = useSokakStore((s) => s.setGamingMode);
  const setDisableHwAccelOnRestart = useSokakStore(
    (s) => s.setDisableHwAccelOnRestart
  );

  const [draftTag, setDraftTag] = useState(statusTag);
  const [draftColor, setDraftColor] = useState(avatarColor);
  const [draftImage, setDraftImage] = useState<string | null>(avatarImage);
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftTag(statusTag);
    setDraftColor(avatarColor);
    setDraftImage(avatarImage);
    setDraftServerUrl(serverUrl);

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
        })
        .catch(() => {});
    }
  }, [isOpen, statusTag, avatarColor, avatarImage, serverUrl]);

  if (!isOpen) return null;

  const handlePickAvatarImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setDraftImage(await resizeAvatarImage(file));
    } catch {
      // yoksay
    }
  };

  const handleSaveProfileAndServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextUrl = draftServerUrl.trim() || 'http://localhost:3001';
    const urlChanged = nextUrl !== serverUrl.trim();

    if (urlChanged) {
      setServerUrl(nextUrl);
      rtcEngine.connect(nextUrl);
    }

    await rtcEngine.updateProfileOnServer({
      avatarColor: draftColor,
      avatarImage: draftImage,
      statusTag: draftTag.trim(),
    });

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleLogout = async () => {
    const token = authToken;
    rtcEngine.disconnect();
    await authApi.logout(token);
    clearSession(null);
  };

  const handleToggleHardwareAcceleration = async (nextDisabled: boolean) => {
    setDisableHwAccelOnRestart(nextDisabled);
    if (window.sokakDesktop) {
      await window.sokakDesktop.setHardwareAccelerationDisabled(nextDisabled);
    }
  };

  const meterPercent = Math.max(
    0,
    Math.min(100, ((currentInputLevelDb + 90) / 90) * 100)
  );
  const thresholdPercent = Math.max(
    0,
    Math.min(100, ((noiseGateThresholdDb + 90) / 90) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg bg-[#0F1117] border border-white/[0.1] flex flex-col max-h-[88vh] overflow-hidden">
        {/* Başlık */}
        <div className="px-5 py-3.5 bg-[#090A0F] border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-100">
              SOKAK Hesap, Ses & Performans Ayarları
            </h3>
            <p className="text-[11px] text-zinc-400">
              SOKAK — Ekip içi anlık sesli ve yazılı iletişim
            </p>
          </div>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="p-1.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kaydırılabilir İçerik */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* BÖLÜM 1: KALICI HESAP, PROFİL & SUNUCU */}
          <form
            onSubmit={handleSaveProfileAndServer}
            className="p-4 rounded-md bg-[#090A0F] border border-white/[0.06] space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-100 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-[#5865F2]" />
                <span>SOKAK Hesabı & Sunucu Adresi</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    isConnected
                      ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {isConnected ? 'BAĞLI' : 'BAĞLANTI YOK'}
                </span>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1"
                  title="Oturumu Kapat"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Çıkış Yap</span>
                </button>
              </div>
            </div>

            {/* Avatar & Kalıcı Kullanıcı Adı */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group"
                title="Profil resmini değiştir"
              >
                <Avatar
                  username={username}
                  color={draftColor}
                  image={draftImage}
                  size={52}
                />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#151821] border border-white/[0.1] flex items-center justify-center text-zinc-300 group-hover:text-white">
                  <ImagePlus className="w-3 h-3" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handlePickAvatarImage}
              />

              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Kalıcı Kullanıcı Adı
                </div>
                <div className="text-sm font-bold text-zinc-100 truncate">
                  {username}
                </div>
                {draftImage && (
                  <button
                    type="button"
                    onClick={() => setDraftImage(null)}
                    className="text-[10px] text-zinc-500 hover:text-rose-400"
                  >
                    Profil resmini kaldır
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Durum Etiketi
                </label>
                <input
                  type="text"
                  value={draftTag}
                  onChange={(e) => setDraftTag(e.target.value)}
                  placeholder="Rekabetçi maç hazır..."
                  className="w-full px-3 py-1.5 rounded bg-[#151821] border border-white/[0.08] text-xs text-zinc-100 focus:outline-none focus:border-[#5865F2]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1.5">
                  Avatar Rengi
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraftColor(c)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        draftColor === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Sunucu URL Yapılandırması */}
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              <label className="block text-[11px] text-zinc-300 font-medium flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#10B981]" />
                <span>
                  SOKAK Sunucu Adresi (Yerel Ağ / LAN veya Bulut Sunucusu)
                </span>
              </label>
              <input
                type="text"
                value={draftServerUrl}
                onChange={(e) => setDraftServerUrl(e.target.value)}
                placeholder="http://localhost:3001 veya http://192.168.1.x:3001"
                className="w-full px-3 py-1.5 rounded bg-[#151821] border border-white/[0.08] font-mono text-xs text-zinc-100 focus:outline-none focus:border-[#10B981]"
              />

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-zinc-500">Hızlı Seçim:</span>
                <button
                  type="button"
                  onClick={() => setDraftServerUrl('http://localhost:3001')}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-300"
                >
                  http://localhost:3001
                </button>
                {lanIps.map((ip) => (
                  <button
                    key={ip}
                    type="button"
                    onClick={() => setDraftServerUrl(`http://${ip}:3001`)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 text-[#10B981]"
                  >
                    LAN: http://{ip}:3001
                  </button>
                ))}
              </div>

              {connectionError && (
                <p className="text-[11px] text-rose-400">{connectionError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {savedNotice && (
                <span className="text-xs text-[#10B981] flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Kaydedildi
                </span>
              )}
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold"
              >
                Profili & Sunucuyu Kaydet
              </button>
            </div>
          </form>

          {/* BÖLÜM 2: STÜDYO SES MOTORU & GÜRÜLTÜ FİLTRESİ */}
          <div className="p-4 rounded-md bg-[#090A0F] border border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-100 uppercase tracking-wider">
                <Mic className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Stüdyo Ses Motoru & Mekanik Klavye Gürültü Filtresi</span>
              </div>
              <span className="text-[10px] font-mono text-[#10B981]">
                Opus 128kbps Stereo CBR + FEC
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Mikrofon Giriş Aygıtı
              </label>
              <select
                value={selectedAudioInputDeviceId}
                onChange={(e) => setSelectedAudioInputDeviceId(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-[#151821] border border-white/[0.08] text-xs text-zinc-100 focus:outline-none"
              >
                <option value="default">Sistem Varsayılan Mikrofonu</option>
                {audioInputs.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label || `Mikrofon (${dev.deviceId.slice(0, 6)})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">
                  Gürültü Kapısı Eşik Değeri (Mekanik Klavye / Fare Sesi Engelleyici)
                </span>
                <span className="font-mono font-bold tabular-nums text-[#10B981]">
                  {noiseGateThresholdDb} dB
                </span>
              </div>

              <input
                type="range"
                min={-80}
                max={-15}
                step={1}
                value={noiseGateThresholdDb}
                onChange={(e) =>
                  setNoiseGateThresholdDb(Number(e.target.value))
                }
                className="w-full accent-[#10B981] cursor-pointer"
              />

              <div className="relative h-3 w-full rounded bg-[#151821] overflow-hidden border border-white/[0.06]">
                <div
                  className="h-full bg-[#10B981]"
                  style={{ width: `${meterPercent}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500"
                  style={{ left: `${thresholdPercent}%` }}
                  title={`Eşik: ${noiseGateThresholdDb} dB`}
                />
              </div>

              <div className="flex justify-between text-[10px] font-mono tabular-nums text-zinc-500">
                <span>-80 dB (Hassas)</span>
                <span>Anlık Giriş: {currentInputLevelDb} dB</span>
                <span>-15 dB (Sıkı Filtre)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#5865F2]" />
                <span>Sentezlenmiş Bildirim Sesleri:</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => soundFX.playUserJoin()}
                  className="px-2 py-1 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-[10px] text-zinc-300"
                >
                  Katılma Sesi
                </button>
                <button
                  type="button"
                  onClick={() => soundFX.playStreamStart()}
                  className="px-2 py-1 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-[10px] text-zinc-300"
                >
                  Yayın Sesi
                </button>
              </div>
            </div>
          </div>

          {/* BÖLÜM 3: PERFORMANS & DONANIM İVMESİ */}
          <div className="p-4 rounded-md bg-[#090A0F] border border-white/[0.06] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-100 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Sıfır FPS Kaybı & Ekran Kartı (GPU) Koruması</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-xs font-medium text-zinc-200">
                  ⚡ Oyun Modu (Tüm Arayüz Geçişlerini Dondur)
                </div>
                <div className="text-[11px] text-zinc-400">
                  Aktif edildiğinde arayüz animasyonlarını ve ses göstergelerini tamamen kapatır.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGamingMode(!isGamingMode)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold border ${
                  isGamingMode
                    ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981]'
                    : 'bg-[#151821] border-white/[0.08] text-zinc-400'
                }`}
              >
                {isGamingMode ? 'AKTİF' : 'KAPALI'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-white/[0.06] pt-3">
              <div>
                <div className="text-xs font-medium text-zinc-200">
                  GPU Donanım İvmesini Devre Dışı Bırak
                </div>
                <div className="text-[11px] text-zinc-400">
                  Yeniden başlatmada ekran kartının %100 gücünü oyunlara ayırır.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleToggleHardwareAcceleration(!disableHwAccelOnRestart)
                  }
                  className={`px-3 py-1 rounded text-xs font-mono font-bold border ${
                    disableHwAccelOnRestart
                      ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981]'
                      : 'bg-[#151821] border-white/[0.08] text-zinc-400'
                  }`}
                >
                  {disableHwAccelOnRestart ? 'GPU KAPALI' : 'VARSAYILAN'}
                </button>
                {window.sokakDesktop && (
                  <button
                    type="button"
                    onClick={() => window.sokakDesktop?.relaunchApp()}
                    className="p-1.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.08] text-zinc-300"
                    title="Uygulamayı Şimdi Yeniden Başlat"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
