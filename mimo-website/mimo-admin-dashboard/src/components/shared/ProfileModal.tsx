import React, { useRef, useState } from 'react';
import { X, Camera, Loader2, Check, KeyRound, FileText, Upload } from 'lucide-react';
import { StaffProfile, DocType, DOC_TYPES, profileCompletionPct } from '../../services/profile.service';

interface ProfileModalProps {
  profile: StaffProfile;
  onClose: () => void;
  onSave: (fields: { name?: string; dob?: string }, avatar?: File | null) => Promise<void>;
  /** Omit for Admin/Finance's shared role-level accounts -- no individual password to rotate there. */
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Optional identity documents -- never required. Omit to hide the Documents section entirely
   * (not used for role-level Admin/Finance profiles where "my own documents" doesn't apply the same way). */
  onUploadDocument?: (docType: DocType, file: File) => Promise<any>;
}

/** Reused across every portal: avatar, display name, date of birth, and (where the account is a real
 * individual login) a password change. One component instead of five near-identical modals. */
export const ProfileModal: React.FC<ProfileModalProps> = ({ profile, onClose, onSave, onChangePassword, onUploadDocument }) => {
  const [name, setName] = useState(profile.name || '');
  const [dob, setDob] = useState(profile.dob || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [docState, setDocState] = useState<StaffProfile>(profile);
  const [uploadingDoc, setUploadingDoc] = useState<DocType | null>(null);
  const completion = profileCompletionPct(docState);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const pickAvatar = (f: File | null) => {
    setAvatarFile(f);
    if (f) setAvatarPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ name, dob }, avatarFile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const uploadDoc = async (docType: DocType, file: File | null) => {
    if (!file || !onUploadDocument) return;
    setUploadingDoc(docType);
    try {
      const result = await onUploadDocument(docType, file);
      setDocState((prev) => ({ ...prev, ...result }));
    } catch {
      /* non-blocking: documents are optional, a failed upload just leaves that slot empty */
    } finally {
      setUploadingDoc(null);
    }
  };

  const changePassword = async () => {
    if (!onChangePassword) return;
    setPwBusy(true);
    setPwMsg('');
    try {
      await onChangePassword(currentPw, newPw);
      setPwMsg('Password updated.');
      setCurrentPw('');
      setNewPw('');
      setTimeout(() => { setShowPwForm(false); setPwMsg(''); }, 1500);
    } catch (err: any) {
      setPwMsg(err?.response?.data?.error || 'Failed to change password');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-1)]">My Profile</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-3)]">
            <span>Profile completeness</span>
            <span>{completion}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Profile" className="size-20 rounded-full object-cover border border-[var(--border)]" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-indigo-500/10 text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {(name || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-md cursor-pointer"
              title="Change photo"
            >
              <Camera size={13} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-[var(--text-3)] uppercase">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-[var(--text-3)] uppercase">Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
          {profile.email && (
            <div>
              <label className="text-[11px] font-bold text-[var(--text-3)] uppercase">Email</label>
              <p className="mt-1 text-sm text-[var(--text-2)]">{profile.email}</p>
            </div>
          )}
        </div>

        {onUploadDocument && (
          <div className="border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-[11px] font-bold text-[var(--text-3)] uppercase">Documents (optional)</p>
            <div className="space-y-2">
              {DOC_TYPES.map((d) => {
                const uploaded = Boolean(docState[d.urlField]);
                return (
                  <label
                    key={d.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2 hover:bg-[var(--surface-2)]"
                  >
                    {uploadingDoc === d.key ? (
                      <Loader2 size={15} className="shrink-0 animate-spin text-[var(--text-3)]" />
                    ) : uploaded ? (
                      <Check size={15} className="shrink-0 text-emerald-500" />
                    ) : (
                      <FileText size={15} className="shrink-0 text-[var(--text-3)]" />
                    )}
                    <span className="flex-1 text-sm text-[var(--text-2)]">{d.label}</span>
                    {uploaded ? (
                      <a href={docState[d.urlField] as string} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[var(--primary)]" onClick={(e) => e.stopPropagation()}>View</a>
                    ) : (
                      <Upload size={13} className="shrink-0 text-[var(--text-3)]" />
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => uploadDoc(d.key, e.target.files?.[0] || null)}
                    />
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-3)]">Not required — add these whenever you have them.</p>
          </div>
        )}

        {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] py-2.5 text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
          {saved ? 'Saved' : 'Save Changes'}
        </button>

        {onChangePassword && (
          <div className="border-t border-[var(--border)] pt-4">
            {!showPwForm ? (
              <button
                type="button"
                onClick={() => setShowPwForm(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold text-[var(--text-2)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                <KeyRound size={14} /> Change Password
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                />
                <input
                  type="password"
                  placeholder="New password (min 6 characters)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--primary)]"
                />
                {pwMsg && <p className="text-xs font-semibold text-[var(--text-2)]">{pwMsg}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={pwBusy || !currentPw || newPw.length < 6}
                    className="flex-1 rounded-xl bg-[var(--primary)] py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                  >
                    {pwBusy ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPwForm(false); setPwMsg(''); }}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-2)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
