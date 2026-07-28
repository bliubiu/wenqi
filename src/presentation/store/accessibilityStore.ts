import { create } from 'zustand';

export interface AccessibilityPreferences {
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

const STORAGE_KEY = 'wenqi-accessibility';
const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  highContrast: false,
  reducedMotion: false,
  fontSize: 'medium',
};

function loadFromStorage(): Partial<AccessibilityPreferences> {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {};
}

function saveToStorage(prefs: AccessibilityPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch { /* ignore */ }
}

function detectSystemPreferences(): Partial<AccessibilityPreferences> {
  const prefs: Partial<AccessibilityPreferences> = {};
  try {
    if (typeof window !== 'undefined') {
      prefs.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      prefs.highContrast = window.matchMedia('(prefers-contrast: more)').matches;
    }
  } catch { /* ignore */ }
  return prefs;
}

interface AccessibilityStore {
  preferences: AccessibilityPreferences;
  updatePreferences: (updates: Partial<AccessibilityPreferences>) => void;
  toggleHighContrast: () => void;
  toggleReducedMotion: () => void;
  setFontSize: (size: AccessibilityPreferences['fontSize']) => void;
  resetPreferences: () => void;
  initFromSystem: () => void;
}

export const useAccessibilityStore = create<AccessibilityStore>((set, get) => ({
  preferences: { ...DEFAULT_PREFERENCES, ...loadFromStorage(), ...detectSystemPreferences() },

  updatePreferences: (updates) => {
    const newPrefs = { ...get().preferences, ...updates };
    set({ preferences: newPrefs });
    saveToStorage(newPrefs);
  },

  toggleHighContrast: () => {
    const newPrefs = { ...get().preferences, highContrast: !get().preferences.highContrast };
    set({ preferences: newPrefs });
    saveToStorage(newPrefs);
  },

  toggleReducedMotion: () => {
    const newPrefs = { ...get().preferences, reducedMotion: !get().preferences.reducedMotion };
    set({ preferences: newPrefs });
    saveToStorage(newPrefs);
  },

  setFontSize: (size) => {
    const newPrefs = { ...get().preferences, fontSize: size };
    set({ preferences: newPrefs });
    saveToStorage(newPrefs);
  },

  resetPreferences: () => {
    set({ preferences: DEFAULT_PREFERENCES });
    saveToStorage(DEFAULT_PREFERENCES);
  },

  initFromSystem: () => {
    const sys = detectSystemPreferences();
    const current = get().preferences;
    const newPrefs = { ...current, ...sys };
    set({ preferences: newPrefs });
    saveToStorage(newPrefs);
  },
}));

export { DEFAULT_PREFERENCES };
