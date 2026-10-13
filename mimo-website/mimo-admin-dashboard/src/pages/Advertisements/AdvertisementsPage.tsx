import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, X, ImageIcon, Link, AlignLeft,
  Megaphone, ChevronUp, ChevronDown, Loader2, Upload, ExternalLink,
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

type FormValues = { imageUrl: string; link: string; caption: string };

// ─── Image Uploader ───────────────────────────────────────────────────────────

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

const ImageUploader: React.FC<ImageUploaderProps> = ({ value, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewSrc, setPreviewSrc] = useState(value || '');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // keep preview in sync when parent changes value
  useEffect(() => {
    setPreviewSrc(value);
    if (!value) setDimensions(null);
  }, [value]);

  const uploadFile = async (file: File) => {
    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, GIF, WebP, or SVG images are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewSrc(localUrl);

    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await api.post<{ imageUrl: string }>('/admin/ads/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(r.data.imageUrl);
      setPreviewSrc(r.data.imageUrl);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Upload failed. Try again.');
      setPreviewSrc(value); // revert preview
      if (!value) setDimensions(null);
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ''; // allow re-picking the same file
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.remove('ring-2', 'ring-indigo-400');
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add('ring-2', 'ring-indigo-400');
  };

  const onDragLeave = () => {
    dropRef.current?.classList.remove('ring-2', 'ring-indigo-400');
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
        <ImageIcon size={13} /> Image <span className="text-slate-400 font-normal">(optional)</span>
      </label>

      {/* Drop zone / preview */}
      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative flex items-center justify-center border-2 border-dashed rounded-xl transition-all cursor-pointer
          ${previewSrc ? 'h-40 border-slate-200 dark:border-slate-700' : 'h-28 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'}
          bg-slate-50 dark:bg-slate-800/60 overflow-hidden`}
      >
        {previewSrc ? (
          <>
            <img
              src={previewSrc}
              alt="Ad preview"
              className="w-full h-full object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              onError={() => { setPreviewSrc(''); setDimensions(null); }}
            />
            {/* Change overlay */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center group">
              <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-opacity">
                <Upload size={13} /> Change image
              </span>
            </div>
          </>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
            <span className="text-xs font-medium">Uploading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500 select-none">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Upload size={18} className="text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Click or drag an image here</p>
              <p className="text-[11px] text-slate-400 mt-0.5">JPEG, PNG, GIF, WebP · max 10 MB</p>
            </div>
          </div>
        )}

        {/* Remove button */}
        {previewSrc && !uploading && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); setPreviewSrc(''); setDimensions(null); }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors z-10"
            title="Remove image"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dimensions badge & format guide */}
      {dimensions && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
          <span className="font-medium">
            {dimensions.width} × {dimensions.height} px
            {' · '}
            {dimensions.width > dimensions.height * 1.2
              ? 'Landscape'
              : dimensions.height > dimensions.width * 1.2
              ? 'Portrait / Poster'
              : 'Square'}
          </span>
          <span className="text-indigo-600 dark:text-indigo-400">
            {dimensions.width > dimensions.height ? 'Shows as full banner' : 'Shows as card poster'}
          </span>
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        💡 Format tips: Images without a caption display full-width. Images with a caption display as a poster alongside the text.
      </p>

      {error && (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={onFileChange}
        className="hidden"
        aria-label="Upload ad image"
      />
    </div>
  );
};

// ─── Multi Image Uploader (New Ad only — picks several photos, one ad per photo) ──────────────

interface MultiImageUploaderProps {
  value: string[];
  /** Atomic add/remove instead of a computed-array onChange: several uploads can finish in the same
   * tick, and each one reading `value` to compute `[...value, url]` would race -- whichever finishes
   * last silently overwrites what the other just added. The parent applies these as functional state
   * updates (`setImageUrls(prev => ...)`), which React guarantees run in true order against the latest
   * state regardless of timing, so no completion is ever lost. */
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}

/** One independently-tracked upload so a slow/failed file doesn't block the others. */
type PendingUpload = { localId: string; previewSrc: string; status: 'uploading' | 'done' | 'error'; error?: string };

const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({ value, onAdd, onRemove }) => {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const uploadOne = async (file: File) => {
    const localId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const previewSrc = URL.createObjectURL(file);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setPending((p) => [...p, { localId, previewSrc, status: 'error', error: 'Unsupported type' }]);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPending((p) => [...p, { localId, previewSrc, status: 'error', error: 'Over 10 MB' }]);
      return;
    }

    setPending((p) => [...p, { localId, previewSrc, status: 'uploading' }]);
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await api.post<{ imageUrl: string }>('/admin/ads/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPending((p) => p.map((u) => (u.localId === localId ? { ...u, status: 'done' } : u)));
      onAdd(r.data.imageUrl);
    } catch (err: any) {
      setPending((p) => p.map((u) => (u.localId === localId ? { ...u, status: 'error', error: err?.response?.data?.error || 'Upload failed' } : u)));
    }
  };

  const uploadFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((f) => uploadOne(f));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.remove('ring-2', 'ring-indigo-400');
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); dropRef.current?.classList.add('ring-2', 'ring-indigo-400'); };
  const onDragLeave = () => dropRef.current?.classList.remove('ring-2', 'ring-indigo-400');

  const removeUploaded = (url: string) => onRemove(url);
  const dismissFailed = (localId: string) => setPending((p) => p.filter((u) => u.localId !== localId));

  const anyUploading = pending.some((u) => u.status === 'uploading');
  const failed = pending.filter((u) => u.status === 'error');

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
        <ImageIcon size={13} /> Images <span className="text-slate-400 font-normal">(optional — pick one or several)</span>
      </label>

      <div
        ref={dropRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className="flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50 dark:bg-slate-800/60 cursor-pointer transition-all"
      >
        <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500 select-none">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <Upload size={18} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Click or drag images here</p>
            <p className="text-[11px] text-slate-400 mt-0.5">JPEG, PNG, GIF, WebP · max 10 MB each · multiple allowed</p>
          </div>
        </div>
      </div>

      {(value.length > 0 || pending.length > 0) && (
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {value.map((url) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeUploaded(url); }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {pending.filter((u) => u.status === 'uploading').map((u) => (
            <div key={u.localId} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <img src={u.previewSrc} alt="" className="w-full h-full object-cover opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 size={16} className="animate-spin text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="mt-2 space-y-1">
          {failed.map((u) => (
            <div key={u.localId} className="flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-2.5 py-1.5">
              <span>{u.error}</span>
              <button type="button" onClick={() => dismissFailed(u.localId)} className="text-rose-400 hover:text-rose-600 cursor-pointer"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {value.length > 1 && (
        <p className="mt-1.5 text-[11px] text-indigo-600 dark:text-indigo-400">
          {value.length} images selected — one ad will be created per image, all sharing the link and caption below.
        </p>
      )}
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        💡 Format tips: Images without a caption display full-width. Images with a caption display as a poster alongside the text.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(',')}
        onChange={onFileChange}
        className="hidden"
        aria-label="Upload ad images"
        disabled={anyUploading}
      />
    </div>
  );
};

// ─── Modal ───────────────────────────────────────────────────────────────────

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
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

const AdForm: React.FC<{
  initial: FormValues;
  onSubmit: (v: FormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  /** New Ad only: lets the admin pick several photos at once. When more than one image ends up
   * selected, `onSubmitMultiple` is called instead of `onSubmit` (one ad gets created per image,
   * all sharing the same link/caption). Picking exactly one (or zero) images still goes through the
   * normal single-ad `onSubmit` path unchanged. */
  allowMultiple?: boolean;
  onSubmitMultiple?: (imageUrls: string[], v: Omit<FormValues, 'imageUrl'>) => Promise<void>;
}> = ({ initial, onSubmit, onCancel, submitLabel, allowMultiple, onSubmitMultiple }) => {
  const [values, setValues] = useState<FormValues>(initial);
  const [imageUrls, setImageUrls] = useState<string[]>(initial.imageUrl ? [initial.imageUrl] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmedLink = values.link?.trim() || '';
      const cleanLink = trimmedLink
        ? (/^https?:\/\//i.test(trimmedLink) ? trimmedLink : `https://${trimmedLink}`)
        : '';
      if (allowMultiple && imageUrls.length > 1 && onSubmitMultiple) {
        await onSubmitMultiple(imageUrls, { link: cleanLink, caption: values.caption });
      } else {
        await onSubmit({ ...values, link: cleanLink, imageUrl: imageUrls[0] || '' });
      }
    }
    catch (err: any) { setError(err?.response?.data?.error || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all';

  return (
    <form onSubmit={handle} className="space-y-4">
      {/* Image upload */}
      {allowMultiple ? (
        <MultiImageUploader
          value={imageUrls}
          onAdd={(url) => setImageUrls((prev) => [...prev, url])}
          onRemove={(url) => setImageUrls((prev) => prev.filter((u) => u !== url))}
        />
      ) : (
        <ImageUploader
          value={imageUrls[0] || ''}
          onChange={(url) => setImageUrls(url ? [url] : [])}
        />
      )}

      {/* Link */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Link size={13} /> Link URL <span className="text-slate-400 font-normal">(optional — opens when user taps)</span>
        </label>
        <input type="text" value={values.link} onChange={set('link')} placeholder="https://example.com" className={inputCls} />
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <AlignLeft size={13} /> Caption <span className="text-slate-400 font-normal">(optional — leave empty for full-width banner)</span>
        </label>
        <textarea rows={3} value={values.caption} onChange={set('caption')} placeholder="Event title or short description…" className={`${inputCls} resize-none`} />
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin" />}
          {allowMultiple && imageUrls.length > 1 ? `Create ${imageUrls.length} Ads` : submitLabel}
        </button>
      </div>
    </form>
  );
};

// ─── Preview Card ─────────────────────────────────────────────────────────────

const AdPreviewCard: React.FC<{ ad: Ad }> = ({ ad }) => {
  const hasImage = Boolean(ad.imageUrl);
  const hasCaption = Boolean(ad.caption);

  return (
    <div className="overflow-hidden rounded-[20px] bg-slate-100 dark:bg-slate-800 select-none max-w-sm border border-slate-200 dark:border-slate-700">
      {/* CASE 1: Banner mode (image only, no caption) */}
      {hasImage && !hasCaption ? (
        <div className="p-2.5">
          <div className="w-full overflow-hidden rounded-[14px] bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            <img src={ad.imageUrl!} alt="" className="w-full max-h-48 object-cover rounded-[14px]" />
          </div>
        </div>
      ) : (
        /* CASE 2: Card mode (image + caption, or caption only) */
        <div className="flex items-center gap-3 p-3">
          {hasImage && (
            <div className="shrink-0 overflow-hidden rounded-[12px] bg-slate-200 dark:bg-slate-700 w-24 h-32 flex items-center justify-center">
              <img src={ad.imageUrl!} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {hasCaption && (
            <div className="flex min-w-0 flex-1 flex-col py-0.5 gap-1">
              <p className="text-[15px] font-semibold leading-tight text-slate-900 dark:text-slate-100 line-clamp-3">
                {ad.caption}
              </p>
              {ad.link && (
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1 truncate">
                  <ExternalLink size={10} /> {ad.link}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {!hasImage && !hasCaption && (
        <p className="p-4 text-sm text-slate-400 italic text-center">Empty ad</p>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const AdvertisementsPage: React.FC = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editAd, setEditAd] = useState<Ad | null>(null);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchAds = async () => {
    setError('');
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

  const handleCreate = async (values: FormValues) => {
    await api.post('/admin/ads', values);
    setShowCreate(false);
    fetchAds();
  };

  /** Several photos picked at once: one ad per photo, all sharing the same link/caption. Created
   * sequentially (not Promise.all) so each new ad's `order` -- computed server-side from the current
   * max -- reflects the ones created just before it in this same batch, keeping them in a stable,
   * predictable sequence instead of a race on whichever request's "current max order" read wins. */
  const handleCreateMultiple = async (imageUrls: string[], values: Omit<FormValues, 'imageUrl'>) => {
    for (const imageUrl of imageUrls) {
      await api.post('/admin/ads', { ...values, imageUrl });
    }
    setShowCreate(false);
    fetchAds();
  };

  const handleEdit = async (values: FormValues) => {
    if (!editAd) return;
    await api.patch(`/admin/ads/${editAd.id}`, values);
    setEditAd(null);
    fetchAds();
  };

  const handleDelete = async (ad: Ad) => {
    if (!confirm(`Delete "${ad.caption || 'this ad'}"? This cannot be undone.`)) return;
    setDeletingId(ad.id);
    try { await api.delete(`/admin/ads/${ad.id}`); fetchAds(); }
    catch (err: any) { alert(err?.response?.data?.error || 'Failed to delete'); }
    finally { setDeletingId(null); }
  };

  const handleToggle = async (ad: Ad) => {
    setTogglingId(ad.id);
    try { await api.patch(`/admin/ads/${ad.id}`, { isActive: !ad.isActive }); fetchAds(); }
    catch { /* silent */ }
    finally { setTogglingId(null); }
  };

  const handleMove = async (ad: Ad, direction: 'up' | 'down') => {
    const sorted = [...ads];
    const idx = sorted.findIndex((a) => a.id === ad.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    const items = sorted.map((a, i) => ({ id: a.id, order: i }));
    setAds(sorted.map((a, i) => ({ ...a, order: i })));
    try { await api.post('/admin/ads/reorder', { items }); }
    catch { fetchAds(); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={20} className="text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Advertisements</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upload images & manage announcements shown on the customer upload screen. Multiple ads rotate every 3 s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-sm shadow-indigo-500/25 shrink-0"
        >
          <Plus size={16} /> New Ad
        </button>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      )}
      {error && !loading && (
        <div className="py-8 text-center">
          <p className="text-rose-600 dark:text-rose-400 text-sm mb-3">{error}</p>
          <button type="button" onClick={fetchAds} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">Retry</button>
        </div>
      )}
      {!loading && !error && ads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Megaphone size={26} className="text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No ads yet</p>
          <p className="text-sm text-slate-400 max-w-xs">Create your first ad. It'll appear on the customer upload screen.</p>
          <button type="button" onClick={() => setShowCreate(true)} className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer">
            <Plus size={16} /> Create First Ad
          </button>
        </div>
      )}

      {!loading && !error && ads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs font-semibold mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {ads.filter((a) => a.isActive).length} active
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg">
              {ads.filter((a) => !a.isActive).length} paused
            </span>
          </div>

          {ads.map((ad, idx) => (
            <div key={ad.id} className={`flex items-stretch gap-3 rounded-2xl border p-3 sm:p-4 transition-all ${ad.isActive ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800' : 'bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-800/60 opacity-60'}`}>
              {/* Reorder */}
              <div className="flex flex-col items-center justify-center gap-0.5 pr-1">
                <button type="button" disabled={idx === 0} onClick={() => handleMove(ad, 'up')} className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" title="Move up">
                  <ChevronUp size={15} />
                </button>
                <GripVertical size={14} className="text-slate-300 dark:text-slate-600" />
                <button type="button" disabled={idx === ads.length - 1} onClick={() => handleMove(ad, 'down')} className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer" title="Move down">
                  <ChevronDown size={15} />
                </button>
              </div>

              {/* Thumbnail */}
              <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                {ad.imageUrl ? (
                  <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-slate-300 dark:text-slate-600" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {ad.caption || <span className="italic text-slate-400">No caption</span>}
                </p>
                {ad.link && (
                  <a href={ad.link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate flex items-center gap-1">
                    <ExternalLink size={10} /> {ad.link}
                  </a>
                )}
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  #{ad.order + 1}{ad.updatedAt && ` · ${new Date(ad.updatedAt).toLocaleDateString()}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => setPreviewAd(ad)} title="Preview" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <Eye size={16} />
                </button>
                <button type="button" onClick={() => handleToggle(ad)} disabled={togglingId === ad.id} title={ad.isActive ? 'Pause' : 'Activate'} className={`p-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${ad.isActive ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {togglingId === ad.id ? <Loader2 size={16} className="animate-spin" /> : ad.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button type="button" onClick={() => setEditAd(ad)} title="Edit" className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => handleDelete(ad)} disabled={deletingId === ad.id} title="Delete" className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors cursor-pointer disabled:opacity-50">
                  {deletingId === ad.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <Modal title="New Advertisement" onClose={() => setShowCreate(false)}>
          <AdForm
            initial={{ imageUrl: '', link: '', caption: '' }}
            onSubmit={handleCreate}
            onSubmitMultiple={handleCreateMultiple}
            allowMultiple
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Ad"
          />
        </Modal>
      )}
      {editAd && (
        <Modal title="Edit Advertisement" onClose={() => setEditAd(null)}>
          <AdForm initial={{ imageUrl: editAd.imageUrl || '', link: editAd.link || '', caption: editAd.caption || '' }} onSubmit={handleEdit} onCancel={() => setEditAd(null)} submitLabel="Save Changes" />
        </Modal>
      )}
      {previewAd && (
        <Modal title="Preview" onClose={() => setPreviewAd(null)}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Exact replica of how it appears on the customer upload screen.</p>
            <AdPreviewCard ad={previewAd} />
            {!previewAd.isActive && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2">
                ⚠ This ad is paused and won't be shown to customers.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
