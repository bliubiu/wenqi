import { create } from 'zustand';

export interface NodeItem {
  id: string;
  refType: 'POET' | 'WORK';
  refId: string;
  position: { x: number; y: number; z: number };
  dynasty: string;
  size: number;
  brightness: number;
  label: string;
}

export interface PoetItem {
  id: string;
  name: string;
  dynasty: string;
  biography: string;
  workCount: number;
}

export interface ScoreItem {
  poetId: string;
  poetName: string;
  dynasty: string;
  talent: number;
  popularity: number;
  luck: number;
}

export interface SelectedPoetDetail {
  poet: PoetItem;
  score: ScoreItem | null;
  node: NodeItem;
}

export type RendererType = 'webgl' | 'canvas2d' | 'text';
export type ConvergenceState = 'idle' | 'converging' | 'focused';
export type LoadingStep = 'data' | 'wasm' | 'render' | 'scene' | 'done';

interface GalaxyStore {
  isLoading: boolean;
  loadingStep: LoadingStep;
  nodeCount: number;
  nodes: NodeItem[];
  poetMap: Record<string, PoetItem>;
  selectedNode: NodeItem | null;
  selectedPoet: SelectedPoetDetail | null;
  convergenceState: ConvergenceState;
  isDivergenceActive: boolean;
  rendererType: RendererType;

  setLoading: (v: boolean) => void;
  setLoadingStep: (step: LoadingStep) => void;
  setNodeCount: (n: number) => void;
  setNodes: (nodes: NodeItem[], poetMap?: Record<string, PoetItem>) => void;
  selectNode: (node: NodeItem | null) => void;
  selectPoet: (detail: SelectedPoetDetail | null) => void;
  setConvergenceState: (s: ConvergenceState) => void;
  setDivergenceActive: (v: boolean) => void;
  setRendererType: (t: RendererType) => void;
}

export const useGalaxyStore = create<GalaxyStore>((set) => ({
  isLoading: true,
  loadingStep: 'data',
  nodeCount: 0,
  nodes: [],
  poetMap: {},
  selectedNode: null,
  selectedPoet: null,
  convergenceState: 'idle',
  isDivergenceActive: false,
  rendererType: 'webgl',

  setLoading: (v) => set({ isLoading: v }),
  setLoadingStep: (step) => set({ loadingStep: step }),
  setNodeCount: (n) => set({ nodeCount: n }),
  setNodes: (nodes, poetMap) => set({ nodes, poetMap: poetMap ?? {}, nodeCount: nodes.length }),
  selectNode: (node) => set({ selectedNode: node }),
  selectPoet: (detail) => set({ selectedPoet: detail }),
  setConvergenceState: (s) => set({ convergenceState: s }),
  setDivergenceActive: (v) => set({ isDivergenceActive: v }),
  setRendererType: (t) => set({ rendererType: t }),
}));
