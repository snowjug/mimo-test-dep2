import React, { useState, useEffect, useCallback } from 'react';
import {
  Tv,
  Volume2,
  VolumeX,
  Upload,
  Trash2,
  Save,
  CheckCircle2,
  Loader2,
  Cpu,
  Plus,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Globe,
  Layers,
  Info,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

interface KioskOption {
  kioskId: string;
  name?: string;
  locationName?: string;
}

const DEFAULT_KIOSKS: KioskOption[] = [
  { kioskId: 'CV-001', name: 'MIMO 1.0 (CV Raman Block)' },
  { kioskId: 'SV-002', name: 'MIMO 2.0 (Central Library)' },
];

export const ConfigurationPage: React.FC = () => {
  const { isDark } = useTheme();

  // Kiosks Fleet list
  const [kiosks, setKiosks] = useState<KioskOption[]>(DEFAULT_KIOSKS);
  const [selectedKiosk, setSelectedKiosk] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('kioskId') || 'global';
  });

  const [screensaver, setScreensaver] = useState({
    videos: [] as string[],
    playSound: false,
    idleTimeoutSeconds: 60,
    useGlobalFallback: false,
    isCustom: false,
  });

  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [savingScreensaver, setSavingScreensaver] = useState(false);
  const [savedScreensaver, setSavedScreensaver] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Hardware thresholds
  const [thresholds, setThresholds] = useState({
    paperLowLimit: 15,
    tonerLowLimit: 20,
    maxRetries: 3,
    heartbeatInterval: 15,
  });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [savedThresholds, setSavedThresholds] = useState(false);

  // Load registered kiosks from fleet API
  useEffect(() => {
    const loadKiosksList = async () => {
      try {
        const res = await api.get('/admin/kiosks');
        if (res.data?.kiosks && Array.isArray(res.data.kiosks) && res.data.kiosks.length > 0) {
          const list = res.data.kiosks.map((k: any) => ({
            kioskId: k.kioskId,
            name: k.name ? `${k.kioskId} - ${k.name}` : k.kioskId,
            locationName: k.locationName || '',
          }));
          setKiosks(list);
        }
      } catch (err) {
        console.warn('Could not load dynamic kiosk registry, using known defaults:', err);
      }
    };
    loadKiosksList();
  }, []);

  // Load screensaver configuration for the selected kiosk or global default
  const loadConfig = useCallback(async (kioskId: string) => {
    setIsLoadingConfig(true);
    try {
      const endpoint = kioskId === 'global' ? '/admin/screensaver' : `/admin/screensaver?kioskId=${encodeURIComponent(kioskId)}`;
      const res = await api.get(endpoint);
      if (res.data) {
        setScreensaver({
          videos: Array.isArray(res.data.videos) ? res.data.videos : [],
          playSound: Boolean(res.data.playSound),
          idleTimeoutSeconds: Number(res.data.idleTimeoutSeconds) || 60,
          useGlobalFallback: Boolean(res.data.useGlobalFallback),
          isCustom: Boolean(res.data.isCustom),
        });
      }
    } catch (err) {
      console.error(`Failed to load screensaver settings for ${kioskId}:`, err);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(selectedKiosk);
    // Sync URL parameter so the portal link is shareable/bookmarkable
    const params = new URLSearchParams(window.location.search);
    if (params.get('kioskId') !== selectedKiosk) {
      params.set('kioskId', selectedKiosk);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [selectedKiosk, loadConfig]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Pi Performance Guardrail: Cap video uploads at 25MB to prevent decoder crash
    if (file.size > 25 * 1024 * 1024) {
      alert('Media file exceeds the 25MB limit. Please compress or resize for smooth kiosk playback on Raspberry Pi hardware.');
      return;
    }

    setIsUploadingMedia(true);
    try {
      // Signed-URL upload: namespaced by selectedKiosk
      const { data: urlData } = await api.post('/admin/upload-url', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        purpose: 'screensaver',
        kioskId: selectedKiosk,
      });
      const putRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': urlData.contentType },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);
      setScreensaver((prev) => ({
        ...prev,
        videos: [...prev.videos, urlData.fileUrl],
        useGlobalFallback: false,
      }));
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleAddVideoUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newVideoUrl.trim();
    if (!trimmed) return;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        alert('Please enter a valid HTTP or HTTPS media URL');
        return;
      }
    } catch {
      alert('Invalid URL format. Please paste a valid web media URL (e.g. https://.../video.mp4)');
      return;
    }

    let normalized = trimmed;
    const gcsMatch = trimmed.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/);
    if (gcsMatch) {
      const bucket = gcsMatch[1];
      const objectPath = decodeURIComponent(gcsMatch[2]);
      normalized = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
    } else {
      const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch) {
        normalized = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }
    }

    setScreensaver((prev) => ({
      ...prev,
      videos: [...prev.videos, normalized],
      useGlobalFallback: false,
    }));
    setNewVideoUrl('');
  };

  const handleRemoveVideo = (index: number) => {
    setScreensaver((prev) => ({
      ...prev,
      videos: prev.videos.filter((_, i) => i !== index),
    }));
  };

  const handleSaveScreensaver = async () => {
    setSavingScreensaver(true);
    setSavedScreensaver(false);
    try {
      await api.post('/admin/screensaver', {
        kioskId: selectedKiosk,
        videos: screensaver.videos,
        playSound: screensaver.playSound,
        idleTimeoutSeconds: screensaver.idleTimeoutSeconds,
        useGlobalFallback: screensaver.useGlobalFallback,
      });
      setSavedScreensaver(true);
      setTimeout(() => setSavedScreensaver(false), 3000);
    } catch (err) {
      alert('Failed to save screensaver settings');
    } finally {
      setSavingScreensaver(false);
    }
  };

  const handleSaveThresholds = async () => {
    setSavingThresholds(true);
    setSavedThresholds(false);
    setTimeout(() => {
      setSavingThresholds(false);
      setSavedThresholds(true);
      setTimeout(() => setSavedThresholds(false), 3000);
    }, 500);
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              System & Kiosk Configuration
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldCheck size={12} />
              Edge Node Policy
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Configure kiosk screensavers per machine, idle timeouts, audio muting, and hardware telemetry thresholds.
          </p>
        </div>
      </div>

      {/* ── Config Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Screensaver & Motion Graphics */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Motion Graphics & Screen Saver</h2>
                <p className="text-xs text-[var(--text-3)]">Independent video playlists & audio per kiosk tablet</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <Tv size={16} />
              </div>
            </div>

            {/* ── Kiosk Selector / Multi-Portal Tabs ── */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                  Select Kiosk Portal
                </span>
                <span className="text-[10px] font-mono text-purple-500">
                  {selectedKiosk === 'global' ? 'All Kiosks Fallback' : `Target: ${selectedKiosk}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedKiosk('global')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    selectedKiosk === 'global'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                  }`}
                >
                  <Globe size={13} />
                  <span>Global Default</span>
                </button>
                {kiosks.map((k) => (
                  <button
                    key={k.kioskId}
                    type="button"
                    onClick={() => setSelectedKiosk(k.kioskId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      selectedKiosk === k.kioskId
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    <Tv size={13} />
                    <span>{k.kioskId}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Kiosk Context Banner ── */}
            {selectedKiosk !== 'global' && (
              <div className="mb-4 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-purple-500 shrink-0" />
                  <span className="text-[var(--text-2)]">
                    {screensaver.useGlobalFallback || screensaver.videos.length === 0 ? (
                      <>
                        <strong className="text-[var(--text-1)]">{selectedKiosk}</strong> is currently using the <span className="text-purple-500 font-semibold">Global Default</span> playlist. Upload custom media below to override.
                      </>
                    ) : (
                      <>
                        <strong className="text-[var(--text-1)]">{selectedKiosk}</strong> has a <span className="text-emerald-500 font-semibold">Custom Playlist</span> ({screensaver.videos.length} video{screensaver.videos.length !== 1 ? 's' : ''}).
                      </>
                    )}
                  </span>
                </div>
                {screensaver.videos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScreensaver(prev => ({ ...prev, useGlobalFallback: !prev.useGlobalFallback }))}
                    className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline shrink-0 cursor-pointer"
                  >
                    {screensaver.useGlobalFallback ? 'Use Custom' : 'Reset to Global'}
                  </button>
                )}
              </div>
            )}

            <div className="space-y-4">
              {/* Audio & Idle Timeout */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                    Audio Playback
                  </label>
                  <button
                    type="button"
                    onClick={() => setScreensaver(prev => ({ ...prev, playSound: !prev.playSound }))}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      screensaver.playSound
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-3)]'
                    }`}
                  >
                    <span>{screensaver.playSound ? 'Sound Enabled 🔊' : 'Muted 🔇'}</span>
                    {screensaver.playSound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                    Idle Timeout (Seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={screensaver.idleTimeoutSeconds}
                    onChange={(e) => setScreensaver({ ...screensaver, idleTimeoutSeconds: parseInt(e.target.value) || 60 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Playlist URLs */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2">
                  {selectedKiosk === 'global' ? 'Global Default Playlist' : `${selectedKiosk} Playlist URLs`}
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {isLoadingConfig ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--text-3)] flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin text-purple-500" />
                      <span>Loading playlist…</span>
                    </div>
                  ) : screensaver.videos.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--text-3)]">
                      <Sparkles className="w-5 h-5 mx-auto mb-1 text-purple-400 opacity-60 animate-pulse" />
                      <span>
                        {selectedKiosk === 'global'
                          ? 'No global videos added. Kiosks will display ambient motion graphics fallback automatically.'
                          : `No custom videos for ${selectedKiosk}. It will automatically inherit from the Global Default playlist.`}
                      </span>
                    </div>
                  ) : (
                    screensaver.videos.map((vid, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-mono text-[var(--text-2)] truncate max-w-[280px]">
                          {i + 1}. {vid}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveVideo(i)}
                          className="p-1 text-[var(--text-3)] hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Video & Upload */}
              <form onSubmit={handleAddVideoUrl} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Paste video URL for ${selectedKiosk}...`}
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  + Add URL
                </button>
                <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer">
                  {isUploadingMedia ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  <span>Upload</span>
                  <input type="file" accept="video/*" onChange={handleMediaUpload} className="hidden" />
                </label>
              </form>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
            {savedScreensaver ? (
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 size={14} /> {selectedKiosk === 'global' ? 'Global default synced!' : `${selectedKiosk} screensaver synced!`}
              </span>
            ) : <span />}

            <button
              type="button"
              disabled={savingScreensaver}
              onClick={handleSaveScreensaver}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
            >
              {savingScreensaver ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save {selectedKiosk === 'global' ? 'Global Settings' : `${selectedKiosk} Settings`}
            </button>
          </div>
        </div>

        {/* Hardware Alerts & Telemetry Thresholds */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Hardware Alerts & Telemetry Thresholds</h2>
                <p className="text-xs text-[var(--text-3)]">Thresholds for incident auto-generation and status badges</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Cpu size={16} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                  Paper Low Trigger Level (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={thresholds.paperLowLimit}
                    onChange={(e) => setThresholds({ ...thresholds, paperLowLimit: parseInt(e.target.value) })}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="font-mono text-xs font-bold w-12 text-right text-[var(--text-1)]">
                    {thresholds.paperLowLimit}%
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                  Toner/Ink Low Trigger Level (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={thresholds.tonerLowLimit}
                    onChange={(e) => setThresholds({ ...thresholds, tonerLowLimit: parseInt(e.target.value) })}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="font-mono text-xs font-bold w-12 text-right text-[var(--text-1)]">
                    {thresholds.tonerLowLimit}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                    Max Print Retries
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={thresholds.maxRetries}
                    onChange={(e) => setThresholds({ ...thresholds, maxRetries: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] mb-1">
                    Heartbeat (Seconds)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={thresholds.heartbeatInterval}
                    onChange={(e) => setThresholds({ ...thresholds, heartbeatInterval: parseInt(e.target.value) || 15 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
            {savedThresholds ? (
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 size={14} /> Thresholds updated!
              </span>
            ) : <span />}

            <button
              type="button"
              disabled={savingThresholds}
              onClick={handleSaveThresholds}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
            >
              {savingThresholds ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Threshold Policies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
