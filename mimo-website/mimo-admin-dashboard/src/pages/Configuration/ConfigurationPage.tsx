import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

export const ConfigurationPage: React.FC = () => {
  const { isDark } = useTheme();
  const [screensaver, setScreensaver] = useState({
    videos: [
      "/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4",
      "/second_video.mp4",
      "/3_video.mp4",
      "/4_video.mp4"
    ],
    playSound: true,
    idleTimeoutSeconds: 60,
  });
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

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get('/admin/screensaver');
        if (res.data) {
          setScreensaver(res.data);
        }
      } catch (err) {
        console.error('Failed to load screensaver settings:', err);
      }
    };
    loadConfig();
  }, []);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    try {
      const storageRef = ref(storage, `screensaver/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', null, (err) => reject(err), async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setScreensaver((prev) => ({ ...prev, videos: [...prev.videos, downloadUrl] }));
          resolve(downloadUrl);
        });
      });
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleAddVideoUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;
    setScreensaver((prev) => ({ ...prev, videos: [...prev.videos, newVideoUrl.trim()] }));
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
      await api.post('/admin/screensaver', screensaver);
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
            Configure kiosk screensavers, idle timeouts, hardware alert thresholds, and autonomous policies.
          </p>
        </div>
      </div>

      {/* ── Config Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Screensaver & Motion Graphics */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Motion Graphics & Screen Saver</h2>
                <p className="text-xs text-[var(--text-3)]">Configure idle screensaver playlist and audio on kiosk tablets</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Tv size={16} />
              </div>
            </div>

            <div className="space-y-4">
              {/* Audio & Idle Timeout */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
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
                    <span>{screensaver.playSound ? 'Sound Enabled' : 'Muted'}</span>
                    {screensaver.playSound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
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
                <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-2">
                  Active Video Playlist URLs
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {screensaver.videos.map((vid, i) => (
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
                  ))}
                </div>
              </div>

              {/* Add Video & Upload */}
              <form onSubmit={handleAddVideoUrl} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste media URL (e.g. https://.../video.mp4)"
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
                <CheckCircle2 size={14} /> Screensaver synced!
              </span>
            ) : <span />}

            <button
              type="button"
              disabled={savingScreensaver}
              onClick={handleSaveScreensaver}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-500/20 disabled:opacity-50"
            >
              {savingScreensaver ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Screensaver Settings
            </button>
          </div>
        </div>

        {/* Hardware Alerts & Telemetry Thresholds */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base text-[var(--text-1)]">Hardware Alerts & Telemetry Thresholds</h2>
                <p className="text-xs text-[var(--text-3)]">Configure trigger parameters for autonomous incident alerts</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <Cpu size={16} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                    Paper Tray Low Alert Limit (%)
                  </label>
                  <input
                    type="number"
                    value={thresholds.paperLowLimit}
                    onChange={(e) => setThresholds({ ...thresholds, paperLowLimit: parseInt(e.target.value) || 15 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                    Toner Cartridge Low Limit (%)
                  </label>
                  <input
                    type="number"
                    value={thresholds.tonerLowLimit}
                    onChange={(e) => setThresholds({ ...thresholds, tonerLowLimit: parseInt(e.target.value) || 20 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                    Max Dispatch Retries Before Incident
                  </label>
                  <input
                    type="number"
                    value={thresholds.maxRetries}
                    onChange={(e) => setThresholds({ ...thresholds, maxRetries: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1">
                    Heartbeat Check Interval (Seconds)
                  </label>
                  <input
                    type="number"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-purple-600/20 disabled:opacity-50"
            >
              {savingThresholds ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save System Thresholds
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
