import { useSokakStore } from '../store/useSokakStore';
import { soundFX } from './soundFX';
import { ClipAttachment } from '../types/sokak';

interface RingChunk {
  index: number;
  bytes: Uint8Array;
  timestamp: number;
}

const CHUNK_DURATION_MS = 5000; // 5 saniyelik WebM parçaları
const MAX_RING_CHUNKS = 6; // Son 6 parça = 30 saniye dairesel RAM tamponu (Sıfır Disk I/O)

// Matroska / WebM Cluster Element ID: 0x1F 0x43 0xB6 0x75
function findWebmClusterOffset(data: Uint8Array): number {
  for (let i = 0; i + 3 < data.length; i++) {
    if (
      data[i] === 0x1f &&
      data[i + 1] === 0x43 &&
      data[i + 2] === 0xb6 &&
      data[i + 3] === 0x75
    ) {
      return i;
    }
  }
  return -1;
}

function pickSupportedWebmMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'video/webm';
}

class ReplayBufferEngine {
  private recorder: MediaRecorder | null = null;
  private activeStream: MediaStream | null = null;
  private ownsStandaloneStream = false;
  private sourceName = 'Oyun Ekranı';
  private mimeType = 'video/webm';
  private chunkCounter = 0;
  private initHeaderBytes: Uint8Array | null = null;
  private ringBuffer: RingChunk[] = [];
  private flushWaiters: Array<() => void> = [];

  public isRunning(): boolean {
    return Boolean(this.recorder && this.recorder.state === 'recording');
  }

  /**
   * Ekran paylaşımı başladığında sıfır ek maliyetle aynı akışa bağlanır
   */
  public attachToScreenShareStream(stream: MediaStream, sourceName?: string | null) {
    if (this.ownsStandaloneStream && this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.ownsStandaloneStream = false;
    }
    this.startRecorderOnStream(stream, sourceName || 'Canlı Yayın', false);
  }

  /**
   * Ekran paylaşımı kapandığında çağrılır
   */
  public detachFromScreenShareStream() {
    if (!this.ownsStandaloneStream) {
      this.stopBuffer();
    }
  }

  /**
   * Alt bardaki "🎬 Klip Modu" butonu ile bağımsız 30sn RAM tamponunu aç/kapat
   */
  public async toggleReplayMode(): Promise<boolean> {
    const store = useSokakStore.getState();

    if (this.isRunning()) {
      // Eğer ekran paylaşımı açıksa ve klip modu kapatılmak isteniyorsa sadece recorder'ı durdur
      this.stopBuffer();
      store.showToast('🎬 Klip Modu (30sn RAM Tamponu) kapatıldı.', 'info');
      return false;
    }

    const started = await this.ensureBufferRunning();
    if (started) {
      store.showToast(
        '🎬 Klip Modu Aktif! Son 30 saniye RAM üzerinde tutuluyor (0 Disk I/O, 0 FPS Kaybı). Klip almak için F8 tuşuna basın.',
        'success'
      );
    }
    return started;
  }

  public async ensureBufferRunning(): Promise<boolean> {
    if (this.isRunning()) return true;

    const store = useSokakStore.getState();

    // 1. Yerel ekran paylaşımı zaten açıksa doğrudan onu kullan
    if (store.localScreenStream) {
      this.startRecorderOnStream(
        store.localScreenStream,
        store.activeScreenShareSourceName || store.activeGame || 'Canlı Yayın',
        false
      );
      return true;
    }

    // 2. Odada başka birinin canlı yayını varsa onu tamponla
    const remoteList = Object.values(store.remoteStreams);
    if (remoteList.length > 0) {
      this.startRecorderOnStream(
        remoteList[0],
        store.activeGame || 'Ekip Yayını',
        false
      );
      return true;
    }

    // 3. Masaüstü (Electron) ortamında aktif oyunu veya ana ekranı arka planda yakala
    try {
      let stream: MediaStream;
      let label = store.activeGame || 'Oyun Ekranı';

      if (window.sokakDesktop) {
        const sources = await window.sokakDesktop.getDesktopSources();
        const activeGameLower = (store.activeGame || '').toLowerCase();
        const chosen =
          (activeGameLower &&
            sources.find((s) =>
              s.name.toLowerCase().includes(activeGameLower)
            )) ||
          sources.find((s) => s.isScreen) ||
          sources[0];

        if (!chosen) {
          store.showToast('Yakalanacak ekran kaynağı bulunamadı.', 'warning');
          return false;
        }

        label = chosen.name || label;
        await window.sokakDesktop.selectDesktopSource(chosen.id);

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
              },
            } as unknown as MediaTrackConstraints,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: chosen.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                minFrameRate: 60,
                maxFrameRate: 60,
              },
            } as unknown as MediaTrackConstraints,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: chosen.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                minFrameRate: 60,
                maxFrameRate: 60,
              },
            } as unknown as MediaTrackConstraints,
          });
        }
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 60, max: 60 },
          },
          audio: true,
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.stopBuffer();
        };
      }

      this.startRecorderOnStream(stream, label, true);
      return true;
    } catch (err) {
      console.warn('[SOKAK Klip Modu] Ekran yakalama başlatılamadı:', err);
      store.showToast(
        'Klip Modu için ekran yakalama izni gerekiyor.',
        'warning'
      );
      return false;
    }
  }

  private startRecorderOnStream(
    stream: MediaStream,
    sourceName: string,
    standalone: boolean
  ) {
    this.stopRecorderOnly();

    this.activeStream = stream;
    this.ownsStandaloneStream = standalone;
    this.sourceName = sourceName;
    this.mimeType = pickSupportedWebmMimeType();
    this.chunkCounter = 0;
    this.initHeaderBytes = null;
    this.ringBuffer = [];

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: 2_200_000, // 2.2 Mbps (30sn = ~8MB RAM, sıfır takılma)
      });

      recorder.ondataavailable = async (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) {
          this.notifyFlushWaiters();
          return;
        }

        try {
          const arrayBuffer = await event.data.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const currentIndex = this.chunkCounter++;

          if (currentIndex === 0) {
            const clusterOffset = findWebmClusterOffset(uint8);
            if (clusterOffset > 0) {
              this.initHeaderBytes = uint8.slice(0, clusterOffset);
            }
          }

          this.ringBuffer.push({
            index: currentIndex,
            bytes: uint8,
            timestamp: Date.now(),
          });

          while (this.ringBuffer.length > MAX_RING_CHUNKS) {
            this.ringBuffer.shift();
          }

          const bufferedSeconds = Math.min(30, this.ringBuffer.length * 5);
          useSokakStore.getState().setReplayBufferState(true, bufferedSeconds);
        } catch {
          // yoksay
        } finally {
          this.notifyFlushWaiters();
        }
      };

      recorder.onerror = () => {
        this.stopBuffer();
      };

      recorder.start(CHUNK_DURATION_MS);
      this.recorder = recorder;
      useSokakStore.getState().setReplayBufferState(true, 5);
    } catch (err) {
      console.error('[SOKAK Klip Modu] MediaRecorder başlatılamadı:', err);
      useSokakStore.getState().setReplayBufferState(false, 0);
    }
  }

  private notifyFlushWaiters() {
    const waiters = this.flushWaiters.splice(0, this.flushWaiters.length);
    for (const resolve of waiters) {
      resolve();
    }
  }

  private flushCurrentChunk(timeoutMs = 350): Promise<void> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        resolve();
        return;
      }
      const timer = window.setTimeout(() => {
        resolve();
      }, timeoutMs);

      this.flushWaiters.push(() => {
        window.clearTimeout(timer);
        resolve();
      });

      try {
        this.recorder.requestData();
      } catch {
        window.clearTimeout(timer);
        resolve();
      }
    });
  }

  private stopRecorderOnly() {
    if (this.recorder) {
      try {
        if (this.recorder.state !== 'inactive') {
          this.recorder.stop();
        }
      } catch {
        // yoksay
      }
      this.recorder = null;
    }
  }

  public stopBuffer() {
    this.stopRecorderOnly();
    if (this.ownsStandaloneStream && this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
    }
    this.activeStream = null;
    this.ownsStandaloneStream = false;
    this.ringBuffer = [];
    this.initHeaderBytes = null;
    useSokakStore.getState().setReplayBufferState(false, 0);
  }

  private assembleWebmBlob(): { blob: Blob; durationSec: number } | null {
    if (this.ringBuffer.length === 0) return null;

    const chunks = [...this.ringBuffer];
    const durationSec = Math.min(30, Math.max(5, chunks.length * 5));

    // İlk parça (index 0) hala tampondaki ilk eleman ise doğrudan birleştir
    if (chunks[0].index === 0 || !this.initHeaderBytes) {
      const parts = chunks.map((c) => c.bytes as unknown as BlobPart);
      return {
        blob: new Blob(parts, { type: 'video/webm' }),
        durationSec,
      };
    }

    // İlk parça 30sn sonrasında silindiyse: EBML başlığını + ilk küme (Cluster) hizasından itibaren son 6 parçayı birleştir
    const parts: BlobPart[] = [this.initHeaderBytes as unknown as BlobPart];
    const firstChunkOffset = findWebmClusterOffset(chunks[0].bytes);
    if (firstChunkOffset >= 0) {
      parts.push(
        chunks[0].bytes.slice(firstChunkOffset) as unknown as BlobPart
      );
    } else {
      parts.push(chunks[0].bytes as unknown as BlobPart);
    }

    for (let i = 1; i < chunks.length; i++) {
      parts.push(chunks[i].bytes as unknown as BlobPart);
    }

    return {
      blob: new Blob(parts, { type: 'video/webm' }),
      durationSec,
    };
  }

  /**
   * 🎬 F8 / Ctrl+Shift+S veya "Son 30 Sn Klip Al" butonuna basıldığında:
   * Son 30 saniyeyi RAM'den tek bir .webm klibine dönüştürür, deklanşör sesi çalar ve #klipler-ve-linkler kanalına gönderir.
   */
  public async captureAndShareClip(
    sendClipMessage: (channelId: string, content: string, attachment: ClipAttachment) => void
  ): Promise<boolean> {
    const store = useSokakStore.getState();
    if (store.isSavingClip) return false;

    store.setSavingClip(true);

    try {
      // Eğer Klip Modu henüz açık değilse otomatik başlat ve hızlı 2.5sn anlık klip kaydet
      if (!this.isRunning()) {
        const started = await this.ensureBufferRunning();
        if (!started) {
          store.setSavingClip(false);
          return false;
        }
        store.showToast(
          '🎬 Klip Modu başlatıldı, anlık görüntü kaydediliyor...',
          'info'
        );
        await new Promise((r) => setTimeout(r, 2200));
      }

      // Mevcut açık parçayı tampon içerisine aktar
      await this.flushCurrentChunk();

      const assembled = this.assembleWebmBlob();
      if (!assembled || assembled.blob.size === 0) {
        store.showToast(
          'Henüz klip verisi oluşmadı, birkaç saniye sonra tekrar F8 tuşuna basın.',
          'warning'
        );
        store.setSavingClip(false);
        return false;
      }

      // Kamera deklanşör bildirim sesini çal
      soundFX.playClipShutter();

      const { blob, durationSec } = assembled;
      const nowIso = new Date().toISOString().replace(/[:.]/g, '-');
      const clipId = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const fileName = `SOKAK-Klip-${nowIso}.webm`;
      const gameLabel = store.activeGame || this.sourceName || 'Oyun Anı';

      // Yerel kullanıcı için anında (0ms) oynatma ve indirme bağlantısı
      const localBlobUrl = URL.createObjectURL(blob);
      store.registerLocalClipUrl(clipId, localBlobUrl);

      // Bulut sunucusuna (.webm) yükle ki #klipler-ve-linkler kanalındaki diğer ekip üyeleri de izleyebilsin
      let remoteVideoUrl = localBlobUrl;
      try {
        const serverBase = store.serverUrl.replace(/\/+$/, '');
        const resp = await fetch(`${serverBase}/api/clips`, {
          method: 'POST',
          headers: {
            'Content-Type': 'video/webm',
            ...(store.authToken
              ? { Authorization: `Bearer ${store.authToken}` }
              : {}),
          },
          body: blob,
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.path) {
            remoteVideoUrl = `${serverBase}${data.path}`;
          }
        }
      } catch {
        // Çevrimdışı veya yükleme hatasında yerel Blob URL çalışmaya devam eder
      }

      const attachment: ClipAttachment = {
        id: clipId,
        title: `${gameLabel} — Son ${durationSec} Saniye Anlık Klip`,
        fileName,
        mimeType: 'video/webm',
        durationSec,
        sizeBytes: blob.size,
        videoUrl: remoteVideoUrl,
        sourceName: gameLabel,
      };

      const messageText = `🎬 **${gameLabel}** — Son ${durationSec} saniye anlık oyun klibi yakalandı! (\`60 FPS WebM • Sıfır FPS Kaybı\`)`;

      sendClipMessage('text-klipler', messageText, attachment);
      store.selectTextChannel('text-klipler');
      store.showToast(
        `🎬 Son ${durationSec} sn klip alındı ve #klipler-ve-linkler kanalında paylaşıldı!`,
        'success'
      );
      return true;
    } catch (err) {
      console.error('[SOKAK Klip] Klip alma hatası:', err);
      store.showToast('Klip oluşturulurken bir hata oluştu.', 'warning');
      return false;
    } finally {
      store.setSavingClip(false);
    }
  }
}

export const replayBuffer = new ReplayBufferEngine();
