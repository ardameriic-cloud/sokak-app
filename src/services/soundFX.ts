// Synthesized UI Sound Effects via pure Web Audio API Oscillators (Zero external asset overhead, 0% GPU)

class SoundFXEngine {
  private ctx: AudioContext | null = null;

  private isEnabled(): boolean {
    try {
      return localStorage.getItem('sokak_sfx_enabled') !== 'false';
    } catch {
      return true;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined' || !this.isEnabled()) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    delaySec = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd),
        now + durationSec
      );
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  }

  public playUserJoin() {
    // Odaya Giriş: Kristal Yükselen Çift Ton (Emerald Chime)
    this.playTone(523.25, 587.33, 0.09, 'sine', 0.075, 0);
    this.playTone(659.25, 783.99, 0.14, 'triangle', 0.085, 0.07);
  }

  public playUserLeave() {
    // Odadan Çıkış: Yumuşak Alçalan Çift Ton
    this.playTone(587.33, 493.88, 0.09, 'sine', 0.07, 0);
    this.playTone(440.0, 329.63, 0.15, 'triangle', 0.065, 0.07);
  }

  public playMute(isMuted: boolean) {
    if (isMuted) {
      this.playTone(420, 260, 0.08, 'sine', 0.07, 0);
    } else {
      this.playTone(320, 540, 0.08, 'sine', 0.07, 0);
    }
  }

  public playDeafen(isDeafened: boolean) {
    if (isDeafened) {
      this.playTone(360, 220, 0.08, 'triangle', 0.07, 0);
      this.playTone(220, 165, 0.11, 'triangle', 0.07, 0.06);
    } else {
      this.playTone(220, 360, 0.08, 'triangle', 0.07, 0);
      this.playTone(360, 520, 0.11, 'triangle', 0.07, 0.06);
    }
  }

  public playPttCue(opened: boolean) {
    // Bas-Konuş (Push-to-Talk) oyun içi düşük sesli taktiksel tık/bip geri bildirimi
    if (opened) {
      this.playTone(620, 820, 0.038, 'sine', 0.045, 0);
    } else {
      this.playTone(540, 380, 0.038, 'sine', 0.04, 0);
    }
  }

  public playStreamStart() {
    // Yayın Başlangıcı: 3 Notalı Taktiksel Yayın Tonu
    this.playTone(440, 554.37, 0.08, 'sine', 0.065, 0);
    this.playTone(554.37, 659.25, 0.08, 'sine', 0.075, 0.06);
    this.playTone(659.25, 880, 0.18, 'triangle', 0.085, 0.12);
  }

  public playReadyCheck() {
    // Hazır Yoklaması: Keskin İki Notalı Çağrı
    this.playTone(587.33, 587.33, 0.09, 'sine', 0.07, 0);
    this.playTone(880.0, 880.0, 0.18, 'sine', 0.08, 0.08);
  }

  public playPinOrPoll() {
    // Sabitlenen Mesaj & Yeni Anket Bildirim Sesi
    this.playTone(493.88, 659.25, 0.07, 'sine', 0.06, 0);
    this.playTone(659.25, 987.77, 0.12, 'triangle', 0.07, 0.06);
  }

  public playClipShutter() {
    // 🎬 Kamera Deklanşör Sesi + Taktiksel Onay Tonu (Anlık 30 Sn Klip)
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Kısa mekanik deklanşör tıkırtısı (yüksek frekanslı darbe)
    const bufferSize = Math.floor(ctx.sampleRate * 0.045);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (bufferSize * 0.22));
      output[i] = (Math.random() * 2 - 1) * env;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(1.8, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    whiteNoise.start(now);

    // 2. İkinci deklanşör perdesi + Zümrüt onay tınısı
    this.playTone(1200, 380, 0.035, 'triangle', 0.07, 0.04);
    this.playTone(783.99, 1046.5, 0.13, 'sine', 0.075, 0.08);
  }
}

export const soundFX = new SoundFXEngine();
