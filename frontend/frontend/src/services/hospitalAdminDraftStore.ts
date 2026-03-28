export interface PendingHospitalAdminDraft {
  admin_name: string;
  admin_email: string;
  admin_phone?: string;
  registration_id?: string;
  registration_number?: string;
  registration_email?: string;
  created_at: string;
}

const STORAGE_KEY = 'pending_hospital_admin_drafts';

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

function readAll(): PendingHospitalAdminDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: PendingHospitalAdminDraft[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveHospitalAdminDraft(draft: PendingHospitalAdminDraft): void {
  const items = readAll();
  const next = [draft, ...items.filter((item) => !(
    (draft.registration_id && item.registration_id === draft.registration_id) ||
    (draft.registration_number && normalize(item.registration_number) === normalize(draft.registration_number)) ||
    (draft.registration_email && normalize(item.registration_email) === normalize(draft.registration_email))
  ))];
  writeAll(next.slice(0, 100));
}

export function attachDraftRegistrationId(matcher: {
  registration_number?: string;
  registration_email?: string;
}, registrationId: string): void {
  const items = readAll();
  const updated = items.map((item) => {
    if (
      (matcher.registration_number && normalize(item.registration_number) === normalize(matcher.registration_number)) ||
      (matcher.registration_email && normalize(item.registration_email) === normalize(matcher.registration_email))
    ) {
      return { ...item, registration_id: registrationId };
    }
    return item;
  });
  writeAll(updated);
}

export function findHospitalAdminDraft(input: {
  registration_id?: string;
  registration_number?: string;
  registration_email?: string;
}): PendingHospitalAdminDraft | null {
  const items = readAll();
  return (
    items.find((item) =>
      (input.registration_id && item.registration_id === input.registration_id) ||
      (input.registration_number && normalize(item.registration_number) === normalize(input.registration_number)) ||
      (input.registration_email && normalize(item.registration_email) === normalize(input.registration_email))
    ) || null
  );
}

export function removeHospitalAdminDraft(registrationId?: string): void {
  if (!registrationId) return;
  const items = readAll();
  writeAll(items.filter((item) => item.registration_id !== registrationId));
}
