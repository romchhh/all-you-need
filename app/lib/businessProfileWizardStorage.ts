import type { BusinessPlanId, ServiceArea } from '@/lib/businessProfileConstants';

export type BusinessWizardStep =
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'step5'
  | 'preview'
  | 'tariff'
  | 'payment';

export type StoredBusinessWizardForm = {
  businessName: string;
  category: string;
  subcategory: string;
  description: string;
  city: string;
  address: string;
  serviceArea: ServiceArea;
  serviceRadiusKm: string;
  telegram: string;
  phone: string;
  instagram: string;
  website: string;
  workingHours: string;
  selectedListingIds: number[];
  selectedPlan: BusinessPlanId | null;
  savedLogoPath: string | null;
  savedCoverPath: string | null;
  logoPreview: string | null;
  coverPreview: string | null;
};

export type StoredBusinessWizardState = {
  step: BusinessWizardStep;
  form: StoredBusinessWizardForm;
  savedAt: number;
};

function storageKey(telegramId: string): string {
  return `businessProfileWizard:${telegramId}`;
}

export function loadBusinessWizardState(telegramId: string): StoredBusinessWizardState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(telegramId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBusinessWizardState;
    if (!parsed?.form || !parsed.step) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBusinessWizardState(telegramId: string, state: StoredBusinessWizardState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(telegramId), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearBusinessWizardState(telegramId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(telegramId));
  } catch {
    // ignore
  }
}
