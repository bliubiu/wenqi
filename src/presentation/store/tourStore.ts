import { create } from 'zustand';
import type { TourScript, TourStep, TourSummary } from '@/domain/value-objects/Tour';
import type { TourStatus } from '@/application/usecases/TourUseCase';

interface TourStore {
  /** 漫游列表是否展开（由 InfoPanel / MobileNav 入口触发） */
  pickerOpen: boolean;
  index: TourSummary[];
  indexLoading: boolean;
  status: TourStatus;
  tour: TourScript | null;
  stepIndex: number;
  step: TourStep | null;
  error: string | null;

  setPickerOpen: (open: boolean) => void;
  setIndex: (index: TourSummary[]) => void;
  setIndexLoading: (loading: boolean) => void;
  applyState: (state: {
    status: TourStatus;
    tour: TourScript | null;
    stepIndex: number;
    step: TourStep | null;
    error: string | null;
  }) => void;
  reset: () => void;
}

const EMPTY = {
  status: 'idle' as TourStatus,
  tour: null,
  stepIndex: -1,
  step: null,
  error: null,
};

export const useTourStore = create<TourStore>((set) => ({
  pickerOpen: false,
  index: [],
  indexLoading: false,
  ...EMPTY,

  setPickerOpen: (open) => set({ pickerOpen: open }),
  setIndex: (index) => set({ index }),
  setIndexLoading: (loading) => set({ indexLoading: loading }),
  applyState: (state) => set(state),
  reset: () => set({ ...EMPTY }),
}));
