import { create } from 'zustand';

interface UIStore {
  searchOpen: boolean;
  dimensionPanelOpen: boolean;
  sharePanelOpen: boolean;
  accessibilityPanelOpen: boolean;

  toggleSearch: () => void;
  toggleDimension: () => void;
  toggleShare: () => void;
  toggleAccessibility: () => void;
  closeAll: () => void;
  setSearchOpen: (v: boolean) => void;
  setDimensionOpen: (v: boolean) => void;
  setShareOpen: (v: boolean) => void;
  setAccessibilityOpen: (v: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchOpen: false,
  dimensionPanelOpen: false,
  sharePanelOpen: false,
  accessibilityPanelOpen: false,

  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  toggleDimension: () => set((s) => ({ dimensionPanelOpen: !s.dimensionPanelOpen })),
  toggleShare: () => set((s) => ({ sharePanelOpen: !s.sharePanelOpen })),
  toggleAccessibility: () => set((s) => ({ accessibilityPanelOpen: !s.accessibilityPanelOpen })),
  closeAll: () => set({
    searchOpen: false,
    dimensionPanelOpen: false,
    sharePanelOpen: false,
    accessibilityPanelOpen: false,
  }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setDimensionOpen: (v) => set({ dimensionPanelOpen: v }),
  setShareOpen: (v) => set({ sharePanelOpen: v }),
  setAccessibilityOpen: (v) => set({ accessibilityPanelOpen: v }),
}));
