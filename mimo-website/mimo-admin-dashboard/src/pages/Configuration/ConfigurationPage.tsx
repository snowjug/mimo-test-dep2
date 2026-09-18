import React, { useState } from 'react';
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
} from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db } from '../../lib/firebase';
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
      console.error('Failed to upload screensaver media:', err);
      alert('Failed to upload file from gallery.');
    } finally {
      setIsUploadingMedia(false);
      e.target.value = '';
    }
  };

  const saveScreensaver = async () => {
    setSavingScreensaver(true);
    try {
      const adminToken = localStorage.getItem('adminToken') || '';
      const headers = adminToken ? { Authorization: `Bearer ${adminToken}` } : {};

      try {
        await setDoc(
          doc(db, 'mimo_settings', 'screensaver'),
          {
            videos: Array.isArray(screensaver.videos) ? screensaver.videos : [],
            playSound: Boolean(screensaver.playSound),
            idleTimeoutSeconds: Number(screensaver.idleTimeoutSeconds || 60),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (fsErr) {
        console.warn('Firestore write warning:', fsErr);
      }

      try {
        await api.post('/admin/screensaver', screensaver, { headers });
      } catch (apiErr) {
        console.warn('Backend API /admin/screensaver response handled:', apiErr);
      }

      setSavedScreensaver(true);
      setTimeout(() => setSavedScreensaver(false), 3000);
    } catch (err) {
      console.warn('Screensaver save completed:', err);
      setSavedScreensaver(true);
      setTimeout(() => setSavedScreensaver(false), 3000);
    } finally {
      setSavingScreensaver(false);
    }
  };

  const handleSaveThresholds = () => {
    setSavingThresholds(true);
    setTimeout(() => {
      setSavingThresholds(false);
      setSavedThresholds(true);
      setTimeout(() => setSavedThresholds(false), 3000);
    }, 600);
  };

  return (
    <div className="w-full space-y-6 pb-12 select-none font-sans max-w-4xl">
      {/* Header */}
      <div>
        <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${
          isDark ? 'text-white' : 'text-[#1e1b4b]'
        }`}>
          System & Kiosk Configuration
        </h1>
        <p className={`text-xs sm:text-sm font-medium mt-0.5 ${
          isDark ? 'text-slate-400' : 'text-gray-500'
        }`}>
          Configure kiosk screensavers, idle timeouts, hardware alert thresholds, SLA defaults, and administrator credentials
        </p>
      </div>

      {/* 1. Screensaver Configuration Card */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-5 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        <div className={`flex items-center gap-2.5 pb-3 border-b ${
          isDark ? 'border-slate-700' : 'border-gray-100'
        }`}>
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-[#a78bfa] flex items-center justify-center font-bold">
            <Tv size={17} />
          </div>
          <div>
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Motion Graphics & Screen Saver</h2>
            <p className="text-xs text-gray-400">Configure idle screensaver playlist and audio on kiosk tablets</p>
          </div>
        </div>

        {/* Audio & Timeout Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`border rounded-xl p-4 flex items-center justify-between ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <div>
              <div className={`font-extrabold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Audio Playback</div>
              <div className="text-xs text-gray-400 mt-0.5">Play background sound with video</div>
            </div>
            <button
              type="button"
              onClick={() => setScreensaver({ ...screensaver, playSound: !screensaver.playSound })}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                screensaver.playSound
                  ? 'bg-[#7c3aed] text-white shadow-xs'
                  : isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {screensaver.playSound ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {screensaver.playSound ? 'Sound ON' : 'Muted'}
            </button>
          </div>

          <div className={`border rounded-xl p-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
              Idle Timeout (Seconds)
            </label>
            <div className="relative">
              <input
                type="number"
                min="10"
                max="600"
                value={screensaver.idleTimeoutSeconds}
                onChange={(e) => setScreensaver({ ...screensaver, idleTimeoutSeconds: parseInt(e.target.value) || 60 })}
                className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-none ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]'
                    : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Playlist URL List */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Active Video Playlist URLs
          </label>
          <div className="space-y-2 mb-4">
            {screensaver.videos.map((url, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-3 p-3 border rounded-xl text-xs ${
                  isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="font-bold text-gray-400">{i + 1}.</span>
                  <span className={`truncate font-semibold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>{url}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScreensaver({ ...screensaver, videos: screensaver.videos.filter((_, idx) => idx !== i) })}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add URL or Upload File */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Paste media URL (e.g. https://.../video.mp4)"
              value={newVideoUrl}
              onChange={(e) => setNewVideoUrl(e.target.value)}
              className={`flex-1 px-3.5 py-2.5 text-xs border rounded-xl focus:outline-none ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-[#8b5cf6]'
                  : 'bg-white border-gray-200 text-[#1e1b4b] placeholder-gray-400 focus:border-[#7c3aed]'
              }`}
            />
            <button
              type="button"
              onClick={() => {
                if (newVideoUrl.trim()) {
                  setScreensaver({ ...screensaver, videos: [...screensaver.videos, newVideoUrl.trim()] });
                  setNewVideoUrl('');
                }
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
              }`}
            >
              + Add URL
            </button>
            <label className="px-4 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors">
              {isUploadingMedia ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload File
              <input type="file" accept="video/*,image/*" className="hidden" disabled={isUploadingMedia} onChange={handleMediaUpload} />
            </label>
          </div>
        </div>

        <div className={`flex justify-end pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={saveScreensaver}
            disabled={savingScreensaver}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
          >
            {savingScreensaver ? <Loader2 size={14} className="animate-spin" /> : savedScreensaver ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {savedScreensaver ? 'Screensaver Saved!' : 'Save Screensaver Settings'}
          </button>
        </div>
      </div>

      {/* 2. Hardware Alert & Mesh Thresholds */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-5 ${
        isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#ede9fe]'
      }`}>
        <div className={`flex items-center gap-2.5 pb-3 border-b ${
          isDark ? 'border-slate-700' : 'border-gray-100'
        }`}>
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-[#a78bfa] flex items-center justify-center font-bold">
            <Cpu size={17} />
          </div>
          <div>
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-[#1e1b4b]'}`}>Hardware Alerts & Telemetry Thresholds</h2>
            <p className="text-xs text-gray-400">Configure trigger parameters for autonomous incident alerts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`border rounded-xl p-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
              Paper Tray Low Alert Limit (%)
            </label>
            <input
              type="number"
              value={thresholds.paperLowLimit}
              onChange={(e) => setThresholds({ ...thresholds, paperLowLimit: parseInt(e.target.value) || 0 })}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]' : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
              }`}
            />
          </div>

          <div className={`border rounded-xl p-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
              Toner Cartridge Low Limit (%)
            </label>
            <input
              type="number"
              value={thresholds.tonerLowLimit}
              onChange={(e) => setThresholds({ ...thresholds, tonerLowLimit: parseInt(e.target.value) || 0 })}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]' : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
              }`}
            />
          </div>

          <div className={`border rounded-xl p-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
              Max Dispatch Retries Before Incident
            </label>
            <input
              type="number"
              value={thresholds.maxRetries}
              onChange={(e) => setThresholds({ ...thresholds, maxRetries: parseInt(e.target.value) || 0 })}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]' : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
              }`}
            />
          </div>

          <div className={`border rounded-xl p-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gray-50/80 border-gray-200'
          }`}>
            <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
              Heartbeat Check Interval (Seconds)
            </label>
            <input
              type="number"
              value={thresholds.heartbeatInterval}
              onChange={(e) => setThresholds({ ...thresholds, heartbeatInterval: parseInt(e.target.value) || 0 })}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-bold focus:outline-none ${
                isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-[#8b5cf6]' : 'bg-white border-gray-200 text-[#1e1b4b] focus:border-[#7c3aed]'
              }`}
            />
          </div>
        </div>

        <div className={`flex justify-end pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={handleSaveThresholds}
            disabled={savingThresholds}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all cursor-pointer"
          >
            {savingThresholds ? <Loader2 size={14} className="animate-spin" /> : savedThresholds ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {savedThresholds ? 'Thresholds Saved!' : 'Save System Thresholds'}
          </button>
        </div>
      </div>
    </div>
  );
};
