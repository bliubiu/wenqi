import { create } from 'zustand';
import type { TimeTravelState } from '@/application/usecases/TimeTravelUseCase';

interface TimelineStore extends TimeTravelState {
  applyState: (state: TimeTravelState) => void;
  reset: () => void;
}

const EMPTY: TimeTravelState = {
  status: 'idle',
  active: false,
  fromYear: 0,
  toYear: 0,
  currentYear: 0,
  speed: 1,
};

export const useTimelineStore = create<TimelineStore>((set) => ({
  ...EMPTY,
  applyState: (state) => set(state),
  reset: () => set({ ...EMPTY }),
}));
