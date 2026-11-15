import React, { useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  LogIn,
  Server,
  UserPlus,
  X,
  Zap,
  Crosshair,
  Crown,
  MonitorUp,
  ShieldCheck,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import {
  authApi,
  AuthRequestError,
  resizeAvatarImage,
} from '../services/authApi';
import { rtcEngine } from '../services/rtcEngine';
import { Avatar } from './Avatar';

const AVATAR_COLORS = [
  '#10B981',
  '#5865F2',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#EF4444',
];

type Mode = 'login' | 'register';

export const AuthScreen: React.FC = () => {
  const serverUrl = useSokakStore((s) => s.serverUrl);
  const authError = useSokakStore((s) => s.authError);
  const platform = useSokakStore((s) => s.platform);
  const setServerUrl = useSokakStore((s) => s.setServerUrl);
  const setSession = useSokakStore((s) => s.setSession);
  const setAuthError = useSokakStore((s) => s.setAuthError);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [showServer, setShowServer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const errorText = localError || authError;

  const switchMode = (next: Mode) => {
    setMode(next);
    setLocalError(null);
    setAuthError(null);
    setPassword('');
    setPasswordConfirm('');
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setAvatarImage(await resizeAvatarImage(file));
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Resim yüklenemedi.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setAuthError(null);

    const name = username.trim();
    if (!name || !password) {
      setLocalError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('Şifre en az 6 karakter olmalı.');
        return;
      }
      if (password !== passwordConfirm) {
        setLocalError('Şifreler eşleşmiyor.');
        return;
      }
    }

    if (serverDraft.trim() && serverDraft.trim() !== serverUrl) {
      setServerUrl(serverDraft);
    }

    setIsSubmitting(true);
    try {
      const result =
        mode === 'register'
          ? await authApi.register({
              username: name,
              password,
              avatarColor,
              avatarImage,
            })
          : await authApi.login({ username: name, password });

      setSession(result.token, result.user, rememberMe);
      rtcEngine.connect();
    } catch (err) {
      setLocalError(
        err instanceof AuthRequestError
          ? err.message
          : 'Beklenmeyen bir hata oluştu.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMac = platform === 'darwin';

  return (
    <div className="w-screen h-screen cyber-dot-matrix text-zinc-100 flex flex-col select-none">
      {/* Sürüklenebilir Üst Şerit */}
      <div className="h-9 w-full app-drag-region shrink-0 flex items-center justify-between px-4 border-b border-white/[0.06] bg-[#07080C]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#10B981]" />
          <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-400">
            SOKAK // CYBER-OBSIDIAN ESPORTS ENGINE
          </span>
        </div>
        {!isMac && window.sokakDesktop && (
          <button
            onClick={() => window.sokakDesktop?.closeToTray()}
            className="app-no-drag h-7 w-9 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-rose-600 rounded"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* SOL PANEL: ESPOR VITRİNİ & TEKNİK ÖZELLİKLER */}
          <div className="lg:col-span-7 space-y-5 pr-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10B981]/12 border border-[#10B981]/35 text-[11px] font-mono font-bold text-[#10B981]">
              <Zap className="w-3.5 h-3.5" />
              <span>SIFIR FPS DÜŞÜŞÜ GARANTİLİ • %0 GPU YÜKÜ</span>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-xl bg-[#12151F] border border-[#10B981]/45 flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  className="w-8 h-8 text-[#10B981]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
                  <path d="M9 12l2 2 4-4" stroke="#5865F2" strokeWidth="2.4" />
                </svg>
              </div>
              <div>
                <h1
                  className="text-4xl font-black tracking-[0.18em] uppercase bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, #10B981 0%, #F4F4F5 50%, #5865F2 100%)',
                  }}
                >
                  SOKAK
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                  Yeni Nesil Espor & Ekip İçi Sesli / Görüntülü Komuta Merkezi
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-lg bg-[#0C0E14] border border-white/[0.08] border-l-2 border-l-[#10B981] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  <span>128kbps Stereo Opus Ses</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Ultra düşük gecikmeli P2P ses motoru ve gürültü kapısı (Noise Gate) ile kristal netliğinde takım iletişimi.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0C0E14] border border-white/[0.08] border-l-2 border-l-[#5865F2] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <MonitorUp className="w-4 h-4 text-[#5865F2]" />
                  <span>1080p 60FPS Yayın & Sinema</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Donanım hızlandırmalı 60FPS oyun yayını ve senkronize YouTube Birlikte İzle odası.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0C0E14] border border-white/[0.08] border-l-2 border-l-[#EF4444] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <Crown className="w-4 h-4 text-[#EF4444]" />
                  <span>LEADER & Rütbe Hiyerarşisi</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  LEADER, ADMIN, CAPTAIN, MEMBER, ROOKIE rütbeleri; kilitli odalar ve sağ tıkla Odaya Çek yetkileri.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0C0E14] border border-white/[0.08] border-l-2 border-l-[#F59E0B] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                  <Crosshair className="w-4 h-4 text-[#F59E0B]" />
                  <span>Oyun İçi Click-Through HUD</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Ctrl+Shift+O ile tam ekran oyunun üstünde tıklama geçirgen konuşma göstergesi.
                </p>
              </div>
            </div>
          </div>

          {/* SAĞ PANEL: GİRİŞ YAP / KAYIT OL KARTI */}
          <div className="lg:col-span-5">
            <div className="rounded-xl bg-[#0C0E14] border border-white/[0.10] overflow-hidden relative">
              <div
                className="h-1 w-full"
                style={{
                  backgroundImage:
                    'linear-gradient(90deg, #10B981 0%, #5865F2 100%)',
                }}
              />

              {/* Sekmeler */}
              <div className="grid grid-cols-2 border-b border-white/[0.07] bg-[#07080C]/60">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`py-3 text-xs font-extrabold tracking-wider uppercase border-b-2 ${
                    mode === 'login'
                      ? 'text-zinc-100 border-[#10B981] bg-[#12151F]/60'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  Giriş Yap
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`py-3 text-xs font-extrabold tracking-wider uppercase border-b-2 ${
                    mode === 'register'
                      ? 'text-zinc-100 border-[#10B981] bg-[#12151F]/60'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  Kayıt Ol
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {mode === 'register' && (
                  <div className="flex items-center gap-4 p-2.5 rounded-lg bg-[#07080C] border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="relative group"
                      title="Profil resmi seç (isteğe bağlı)"
                    >
                      <Avatar
                        username={username || '?'}
                        color={avatarColor}
                        image={avatarImage}
                        size={52}
                      />
                      <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#12151F] border border-white/[0.12] flex items-center justify-center text-zinc-300 group-hover:text-white">
                        <ImagePlus className="w-3 h-3" />
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handlePickImage}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5">
                        Avatar Rengi Seç
                      </div>
                      <div className="flex items-center gap-1.5">
                        {AVATAR_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAvatarColor(c)}
                            className={`w-5 h-5 rounded-full border-2 ${
                              avatarColor === c
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      {avatarImage && (
                        <button
                          type="button"
                          onClick={() => setAvatarImage(null)}
                          className="mt-1.5 text-[10px] text-zinc-500 hover:text-rose-400"
                        >
                          Resmi kaldır
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-mono font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                    Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    autoComplete="username"
                    maxLength={20}
                    placeholder={
                      mode === 'register'
                        ? 'Kalıcı oyuncu adın (örn: meriç)'
                        : 'Oyuncu adın'
                    }
                    className="w-full px-3 py-2 rounded bg-[#07080C] border border-white/[0.09] text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#10B981]"
                  />
                  {mode === 'register' && (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      İlk kayıt olan hesap otomatik olarak 👑 LEADER rütbesi alır.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                    Şifre
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        mode === 'register'
                          ? 'new-password'
                          : 'current-password'
                      }
                      placeholder="••••••"
                      className="w-full px-3 py-2 pr-9 rounded bg-[#07080C] border border-white/[0.09] text-sm text-zinc-100 focus:outline-none focus:border-[#10B981]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">
                      Şifre (Tekrar)
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="••••••"
                      className="w-full px-3 py-2 rounded bg-[#07080C] border border-white/[0.09] text-sm text-zinc-100 focus:outline-none focus:border-[#10B981]"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="accent-[#10B981] w-3.5 h-3.5"
                  />
                  <span className="text-xs text-zinc-300">
                    Beni Hatırla (Otomatik Giriş)
                  </span>
                </label>

                {errorText && (
                  <div className="px-3 py-2 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-300">
                    {errorText}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-zinc-950 text-xs font-black tracking-wider uppercase flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'login' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>
                    {mode === 'login'
                      ? "SOKAK'A GİRİŞ YAP"
                      : 'KALICI HESAP OLUŞTUR'}
                  </span>
                </button>
              </form>
            </div>

            {/* Sunucu Adresi Ayarı */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowServer((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                <Server className="w-3 h-3 text-[#10B981]" />
                <span className="font-mono">{serverUrl}</span>
                <span>· Sunucu Adresini Değiştir</span>
              </button>
              {showServer && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={serverDraft}
                    onChange={(e) => setServerDraft(e.target.value)}
                    placeholder="http://192.168.1.x:3001"
                    className="flex-1 px-3 py-1.5 rounded bg-[#0C0E14] border border-white/[0.08] font-mono text-xs text-zinc-100 focus:outline-none focus:border-[#10B981]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrl(serverDraft);
                      setShowServer(false);
                    }}
                    className="px-3 py-1.5 rounded bg-[#12151F] hover:bg-[#1C202C] border border-white/[0.08] text-xs text-zinc-200 font-semibold"
                  >
                    Kaydet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
