import api from '../api';

export interface StaffProfile {
  id?: string;
  role?: string;
  name: string | null;
  email?: string;
  avatarUrl: string | null;
  dob: string | null;
  joiningLetterUrl?: string | null;
  collegeIdUrl?: string | null;
  citizenshipIdUrl?: string | null;
}

export type DocType = 'joiningLetter' | 'collegeId' | 'citizenshipId';
export const DOC_TYPES: { key: DocType; urlField: keyof StaffProfile; label: string }[] = [
  { key: 'joiningLetter', urlField: 'joiningLetterUrl', label: 'Joining Letter' },
  { key: 'collegeId', urlField: 'collegeIdUrl', label: 'College ID Card' },
  { key: 'citizenshipId', urlField: 'citizenshipIdUrl', label: 'Citizenship Card' },
];

/** None of these are required -- a profile missing every one of them still works exactly as before.
 * This only drives the optional completion-percentage nudge, never a blocking gate. */
export function profileCompletionPct(p: StaffProfile | null): number {
  if (!p) return 0;
  const fields = [p.name, p.dob, p.avatarUrl, p.joiningLetterUrl, p.collegeIdUrl, p.citizenshipIdUrl];
  const filled = fields.filter((f) => !!f).length;
  return Math.round((filled / fields.length) * 100);
}

const uploadDocumentTo = (basePath: string) => (docType: DocType, file: File) => {
  const form = new FormData();
  form.append('document', file);
  return api.post(`${basePath}/profile/document/${docType}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};

/** Member-backed portals (Technical/HR/Marketing): full profile including password change. */
export const memberProfileServiceFor = (basePath: string) => ({
  update: (fields: { name?: string; dob?: string }, avatar?: File | null) => {
    const form = new FormData();
    if (fields.name !== undefined) form.append('name', fields.name);
    if (fields.dob !== undefined) form.append('dob', fields.dob);
    if (avatar) form.append('avatar', avatar);
    return api.patch<{ member: StaffProfile }>(`${basePath}/profile`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.member);
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post(`${basePath}/change-password`, { currentPassword, newPassword }).then((r) => r.data),
  uploadDocument: uploadDocumentTo(basePath),
});

/** Admin/Finance: shared role-level profile, no password change (see profile.controller.js). */
export const staffProfileService = {
  get: () =>
    api
      .get<{ profile: StaffProfile }>('/staff/profile')
      .then((r) => r.data.profile)
      .catch((err) => {
        if (err?.response?.status === 404) return null;
        throw err;
      }),
  update: (fields: { name?: string; dob?: string }, avatar?: File | null) => {
    const form = new FormData();
    if (fields.name !== undefined) form.append('name', fields.name);
    if (fields.dob !== undefined) form.append('dob', fields.dob);
    if (avatar) form.append('avatar', avatar);
    return api.patch<{ profile: StaffProfile }>('/staff/profile', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.profile);
  },
  uploadDocument: uploadDocumentTo('/staff'),
};
