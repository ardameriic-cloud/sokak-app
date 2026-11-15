import React, { useEffect, useState } from 'react';
import {
  Monitor,
  AppWindow,
  RefreshCw,
  X,
  Volume2,
  Zap,
  Play,
} from 'lucide-react';
import { useSokakStore } from '../store/useSokakStore';
import { rtcEngine } from '../services/rtcEngine';
import { DesktopSourceItem } from '../types/sokak';

export const ScreenPickerModal: React.FC = () => {
  const isOpen = useSokakStore((s) => s.isScreenPickerOpen);
  const setScreenPickerOpen = useSokakStore((s) => s.setScreenPickerOpen);

  const [sources, setSources] = useState<DesktopSourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'window' | 'screen'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadSources = async () => {
    setIsLoading(true);
    try {
      if (window.sokakDesktop) {
        const list = await window.sokakDesktop.getDesktopSources();
        setSources(list);
        if (list.length > 0 && !selectedSourceId) {
          setSelectedSourceId(list[0].id);
        }
      } else {
        setSources([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSources = sources.filter((s) => {
    if (filterTab === 'screen') return s.isScreen;
    if (filterTab === 'window') return !s.isScreen;
    return true;
  });

  const selectedSource =
    sources.find((s) => s.id === selectedSourceId) || filteredSources[0];

  const handleStartStream = () => {
    if (window.sokakDesktop && selectedSource) {
      rtcEngine.startScreenShare(selectedSource.id, selectedSource.name);
    } else {
      rtcEngine.startScreenShare('browser-display', '1080p 60FPS Oyun Yayını');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-lg bg-[#0F1117] border border-white/[0.1] flex flex-col max-h-[85vh] overflow-hidden">
        {/* Başlık */}
        <div className="px-5 py-3.5 bg-[#090A0F] border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-[#5865F2]">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                1080p 60FPS Oyun & Ekran Paylaşımı Seçici
              </h3>
              <p className="text-[11px] text-zinc-400">
                Donanım hızlandırmalı WebRTC akışı ve sistem sesi (`Loopback Audio`)
              </p>
            </div>
          </div>

          <button
            onClick={() => setScreenPickerOpen(false)}
            className="p-1.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filtre Çubuğu */}
        <div className="px-5 py-2.5 bg-[#0F1117] border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded text-xs font-medium border ${
                filterTab === 'all'
                  ? 'bg-[#5865F2] border-[#5865F2] text-white'
                  : 'bg-[#151821] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tümü ({sources.length})
            </button>
            <button
              onClick={() => setFilterTab('window')}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 border ${
                filterTab === 'window'
                  ? 'bg-[#5865F2] border-[#5865F2] text-white'
                  : 'bg-[#151821] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <AppWindow className="w-3.5 h-3.5" />
              <span>Oyun / Uygulama Pencereleri</span>
            </button>
            <button
              onClick={() => setFilterTab('screen')}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 border ${
                filterTab === 'screen'
                  ? 'bg-[#5865F2] border-[#5865F2] text-white'
                  : 'bg-[#151821] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Monitörler</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981]">
              1920x1080 @ 60FPS
            </span>
            <button
              onClick={loadSources}
              className="p-1.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.06] text-zinc-300"
              title="Pencere Listesini Yenile"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Kaynak Izgarası */}
        <div className="flex-1 overflow-y-auto p-5">
          {!window.sokakDesktop ? (
            <div className="p-6 rounded-md bg-[#151821] border border-white/[0.08] text-center space-y-2">
              <p className="text-xs font-semibold text-zinc-200">
                Tarayıcı LAN Modu Algılandı
              </p>
              <p className="text-xs text-zinc-400">
                Aşağıdaki <strong>"1080p 60FPS Yayını Başlat"</strong> butonuna tıkladığınızda sisteminizin yerleşik ekran seçicisi açılacaktır.
              </p>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-500">
              Paylaşılabilir ekran veya pencere bulunamadı. Sistem Ayarları &gt; Ekran Kaydı iznini kontrol edin.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredSources.map((src) => {
                const isSelected = selectedSource?.id === src.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => setSelectedSourceId(src.id)}
                    className={`group text-left rounded-md overflow-hidden border p-2 flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#151821] border-[#10B981]'
                        : 'bg-[#090A0F] border-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="aspect-video w-full rounded bg-[#0F1117] overflow-hidden border border-white/[0.04] mb-2 relative">
                      <img
                        src={src.thumbnailDataUrl}
                        alt={src.name}
                        className="w-full h-full object-contain"
                      />
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-zinc-300 border border-white/[0.08]">
                        {src.isScreen ? 'EKRAN' : 'PENCERE'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      {src.appIconDataUrl ? (
                        <img
                          src={src.appIconDataUrl}
                          alt=""
                          className="w-4 h-4 shrink-0"
                        />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-zinc-200 truncate">
                        {src.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Bilgi & Başlat Butonu */}
        <div className="px-5 py-3.5 bg-[#090A0F] border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-[#10B981]" />
              <span>Sistem Sesi Dahil (Loopback)</span>
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#5865F2]" />
              <span>Hareket Odaklı 60FPS Akış</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreenPickerOpen(false)}
              className="px-3.5 py-1.5 rounded bg-[#151821] hover:bg-[#1C202C] border border-white/[0.08] text-xs text-zinc-300"
            >
              İptal
            </button>
            <button
              onClick={handleStartStream}
              className="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-zinc-950 font-bold text-xs flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>1080p 60FPS Yayını Başlat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
