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

  // 面板互斥：打开任一面板时关闭其余面板，避免多面板叠加遮挡交互
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen, dimensionPanelOpen: false, sharePanelOpen: false, accessibilityPanelOpen: false })),
  toggleDimension: () => set((s) => ({ dimensionPanelOpen: !s.dimensionPanelOpen, searchOpen: false, sharePanelOpen: false, accessibilityPanelOpen: false })),
  toggleShare: () => set((s) => ({ sharePanelOpen: !s.sharePanelOpen, searchOpen: false, dimensionPanelOpen: false, accessibilityPanelOpen: false })),
  toggleAccessibility: () => set((s) => ({ accessibilityPanelOpen: !s.accessibilityPanelOpen, searchOpen: false, dimensionPanelOpen: false, sharePanelOpen: false })),
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
