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
  hometown?: string | null;
  hometownLatitude?: number | null;
  hometownLongitude?: number | null;
}

export interface ScoreItem {
  poetId: string;
  poetName: string;
  dynasty: string;
  talent: number;
  popularity: number;
  luck: number;
  factors?: {
    talent?: Record<string, number>;
    popularity?: Record<string, number>;
    luck?: Record<string, number>;
    algorithmVersion?: string;
  };
}

/** 文脉关系条目（sourceId/targetId 均为节点 ID：node_poet_xxx） */
export interface RelationItem {
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  evidence?: { kind: string; titles?: string[]; quote?: string };
}

export interface SelectedPoetDetail {
  poet: PoetItem;
  score: ScoreItem | null;
  node: NodeItem;
}

export type RendererType = 'webgl' | 'canvas2d' | 'text';
export type LayoutMode = 'spiral' | 'geo';
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
  /** 布局模式：螺旋星系 / 籍贯地理投影 */
  layoutMode: LayoutMode;
  /** 当前聚焦诗人的文脉关系；null=未加载，[]=无关系 */
  focusedRelations: RelationItem[] | null;
  /** 双诗人对比面板是否展开 */
  isCompareOpen: boolean;
  /** 对比诗人 ID（null=未选择） */
  comparePoetId: string | null;

  setLoading: (v: boolean) => void;
  setLoadingStep: (step: LoadingStep) => void;
  setNodeCount: (n: number) => void;
  setNodes: (nodes: NodeItem[], poetMap?: Record<string, PoetItem>) => void;
  selectNode: (node: NodeItem | null) => void;
  selectPoet: (detail: SelectedPoetDetail | null) => void;
  setConvergenceState: (s: ConvergenceState) => void;
  setDivergenceActive: (v: boolean) => void;
  setRendererType: (t: RendererType) => void;
  setLayoutMode: (m: LayoutMode) => void;
  setFocusedRelations: (relations: RelationItem[] | null) => void;
  setCompareOpen: (v: boolean) => void;
  setComparePoetId: (id: string | null) => void;
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
  layoutMode: 'spiral',
  focusedRelations: null,
  isCompareOpen: false,
  comparePoetId: null,

  setLoading: (v) => set({ isLoading: v }),
  setLoadingStep: (step) => set({ loadingStep: step }),
  setNodeCount: (n) => set({ nodeCount: n }),
  setNodes: (nodes, poetMap) => set({ nodes, poetMap: poetMap ?? {}, nodeCount: nodes.length }),
  selectNode: (node) => set({ selectedNode: node }),
  selectPoet: (detail) => set({ selectedPoet: detail }),
  setConvergenceState: (s) => set({ convergenceState: s }),
  setDivergenceActive: (v) => set({ isDivergenceActive: v }),
  setRendererType: (t) => set({ rendererType: t }),
  setLayoutMode: (m) => set({ layoutMode: m }),
  setFocusedRelations: (relations) => set({ focusedRelations: relations }),
  setCompareOpen: (v) => set({ isCompareOpen: v }),
  setComparePoetId: (id) => set({ comparePoetId: id }),
}));
