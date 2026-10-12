import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, X, ImageIcon, Link, AlignLeft, Megaphone, ChevronUp, ChevronDown, Loader2,
} from 'lucide-react';
import api from '../../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ad {
  id: string;
  imageUrl: string | null;
  link: string | null;
  caption: string | null;
  isActive: boolean;
  order: number;
  createdAt: number | null;
  updatedAt: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const empty = (): Omit<Ad, 'id' | 'order' | 'createdAt' | 'updatedAt' | 'isActive'> => ({
  imageUrl: '',
  link: '',
  caption: '',
});

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ─── Ad Form ─────────────────────────────────────────────────────────────────

interface AdFormProps {
  initial: { imageUrl: string; link: string; caption: string };
  onSubmit: (values: { imageUrl: string; link: string; caption: string }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

const AdForm: React.FC<AdFormProps> = ({ initial, onSubmit, onCancel, submitLabel }) => {
  const [values, setValues] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(values);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all';

  return (
    <form onSubmit={handle} className="space-y-4">
      {/* Image URL */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <ImageIcon size={13} /> Image URL <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          type="url"
          value={values.imageUrl}
          onChange={set('imageUrl')}
          placeholder="https://example.com/banner.jpg"
          className={inputCls}
        />
        {values.imageUrl && (
          <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-28 bg-slate-100 dark:bg-slate-800">
            <img src={values.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        )}
      </div>

      {/* Link */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Link size={13} /> Link URL <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          type="url"
          value={values.link}
          onChange={set('link')}
          placeholder="https://example.com"
          className={inputCls}
        />
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <AlignLeft size={13} /> Caption <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={values.caption}
          onChange={set('caption')}
          placeholder="Event title or short description…"
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

// ─── Preview Card ─────────────────────────────────────────────────────────────

const AdPreviewCard: React.FC<{ ad: Ad }> = ({ ad }) => (
  <div className="flex gap-3 overflow-hidden rounded-[16px] bg-slate-100 dark:bg-slate-800 p-3 max-w-xs">
    {ad.imageUrl && (
      <div className="shrink-0 overflow-hidden rounded-[10px]">
        <img src={ad.imageUrl} alt="" width={72} height={108} className="h-28 w-18 object-cover rounded-[10px]" />
      </div>
    )}
    {ad.caption && (
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <p className="text-[15px] font-semibold leading-tight text-slate-900 dark:text-slate-100">{ad.caption}</p>
        {ad.link && (
          <p className="mt-1 text-[12px] text-indigo-600 dark:text-indigo-400 truncate">{ad.link}</p>
        )}
      </div>
    )}
    {!ad.imageUrl && !ad.caption && (
      <p className="text-sm text-slate-400 italic">Empty ad</p>
    )}
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

export const AdvertisementsPage: React.FC = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [editAd, setEditAd] = useState<Ad | null>(null);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchAds = async () => {
    try {
      const r = await api.get<{ ads: Ad[] }>('/admin/ads');
      setAds(r.data.ads.sort((a, b) => a.order - b.order));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load ads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAds(); }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleCreate = async (values: { imageUrl: string; link: string; caption: string }) => {
    await api.post('/admin/ads', values);
    setShowCreate(false);
    fetchAds();
  };

  const handleEdit = async (values: { imageUrl: string; link: string; caption: string }) => {
    if (!editAd) return;
    await api.patch(`/admin/ads/${editAd.id}`, values);
    setEditAd(null);
    fetchAds();
  };

  const handleDelete = async (ad: Ad) => {
    if (!confirm(`Delete "${ad.caption || 'this ad'}"? This cannot be undone.`)) return;
    setDeletingId(ad.id);
    try {
      await api.delete(`/admin/ads/${ad.id}`);
      fetchAds();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (ad: Ad) => {
    setTogglingId(ad.id);
    try {
      await api.patch(`/admin/ads/${ad.id}`, { isActive: !ad.isActive });
      fetchAds();
    } catch {
      // silently ignore
    } finally {
      setTogglingId(null);
    }
  };

  const handleMove = async (ad: Ad, direction: 'up' | 'down') => {
    const sorted = [...ads].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((a) => a.id === ad.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const items = reordered.map((a, i) => ({ id: a.id, order: i }));
    setAds(reordered.map((a, i) => ({ ...a, order: i })));
    try {
      await api.post('/admin/ads/reorder', { items });
    } catch {
      fetchAds(); // revert on error
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={20} className="text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Advertisements</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage announcements shown on the customer upload screen. Active ads rotate automatically every 3 s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm shadow-indigo-500/25"
        >
          <Plus size={16} /> New Ad
        </button>
      </div>

      {/* Body */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400 dark:text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {error && !loading && (
        <div className="py-8 text-center text-rose-600 dark:text-rose-400 text-sm">{error}</div>
      )}

      {!loading && !error && ads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Megaphone size={26} className="text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No ads yet</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Create your first advertisement or announcement. It will appear on the customer upload screen.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <Plus size={16} /> Create First Ad
          </button>
        </div>
      )}

      {!loading && !error && ads.length > 0 && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {ads.filter((a) => a.isActive).length} active
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg">
              {ads.filter((a) => !a.isActive).length} paused
            </span>
          </div>

          {ads.map((ad, idx) => (
            <div
              key={ad.id}
              className={`flex items-stretch gap-4 rounded-2xl border p-4 transition-all ${
                ad.isActive
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 opacity-60'
              }`}
            >
              {/* Reorder handles */}
              <div className="flex flex-col items-center justify-center gap-0.5 pr-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(ad, 'up')}
                  className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Move up"
                >
                  <ChevronUp size={15} />
                </button>
                <GripVertical size={14} className="text-slate-300 dark:text-slate-600" />
                <button
                  type="button"
                  disabled={idx === ads.length - 1}
                  onClick={() => handleMove(ad, 'down')}
                  className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Move down"
                >
                  <ChevronDown size={15} />
                </button>
              </div>

              {/* Image thumbnail */}
              <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                {ad.imageUrl ? (
                  <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-slate-300 dark:text-slate-600" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {ad.caption || <span className="italic text-slate-400">No caption</span>}
                </p>
                {ad.link && (
                  <a
                    href={ad.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                  >
                    {ad.link}
                  </a>
                )}
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Order #{ad.order + 1}
                  {ad.updatedAt && ` · Updated ${new Date(ad.updatedAt).toLocaleDateString()}`}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Preview */}
                <button
                  type="button"
                  onClick={() => setPreviewAd(ad)}
                  title="Preview"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Eye size={16} />
                </button>

                {/* Toggle active */}
                <button
                  type="button"
                  onClick={() => handleToggle(ad)}
                  disabled={togglingId === ad.id}
                  title={ad.isActive ? 'Pause' : 'Activate'}
                  className={`p-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
                    ad.isActive
                      ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {togglingId === ad.id ? <Loader2 size={16} className="animate-spin" /> : ad.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => setEditAd(ad)}
                  title="Edit"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Pencil size={15} />
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(ad)}
                  disabled={deletingId === ad.id}
                  title="Delete"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deletingId === ad.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="New Advertisement" onClose={() => setShowCreate(false)}>
          <AdForm
            initial={empty()}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Ad"
          />
        </Modal>
      )}

      {editAd && (
        <Modal title="Edit Advertisement" onClose={() => setEditAd(null)}>
          <AdForm
            initial={{ imageUrl: editAd.imageUrl || '', link: editAd.link || '', caption: editAd.caption || '' }}
            onSubmit={handleEdit}
            onCancel={() => setEditAd(null)}
            submitLabel="Save Changes"
          />
        </Modal>
      )}

      {previewAd && (
        <Modal title="Preview" onClose={() => setPreviewAd(null)}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              This is how the ad appears on the customer upload screen (the banner below is an exact replica of the customer component).
            </p>
            <AdPreviewCard ad={previewAd} />
            {!previewAd.isActive && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2">
                ⚠ This ad is currently paused and won't be shown to customers.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
