import { describe, it, expect, beforeEach } from 'bun:test';
import { useGalaxyStore } from '../galaxyStore';

describe('galaxyStore', () => {
  beforeEach(() => {
    useGalaxyStore.setState({
      isLoading: true,
      nodeCount: 0,
      nodes: [],
      poetMap: {},
      selectedNode: null,
      selectedPoet: null,
      convergenceState: 'idle',
      isDivergenceActive: false,
      rendererType: 'webgl',
    });
  });

  it('初始状态应为加载中', () => {
    const state = useGalaxyStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.nodes).toEqual([]);
    expect(state.convergenceState).toBe('idle');
  });

  it('setNodes 应更新节点列表和计数', () => {
    const nodes = [{ id: 'n1', refType: 'POET' as const, refId: 'p1', position: { x: 0, y: 0, z: 0 }, dynasty: 'TANG', size: 3, brightness: 0.8, label: '李白' }];
    useGalaxyStore.getState().setNodes(nodes);
    const state = useGalaxyStore.getState();
    expect(state.nodes.length).toBe(1);
    expect(state.nodeCount).toBe(1);
    expect(state.isLoading).toBe(true); // 不改变 loading
  });

  it('setLoading 应更新加载状态', () => {
    useGalaxyStore.getState().setLoading(false);
    expect(useGalaxyStore.getState().isLoading).toBe(false);
  });

  it('selectNode 应设置选中节点', () => {
    const node = { id: 'n1', refType: 'POET' as const, refId: 'p1', position: { x: 0, y: 0, z: 0 }, dynasty: 'TANG', size: 3, brightness: 0.8, label: '李白' };
    useGalaxyStore.getState().selectNode(node);
    expect(useGalaxyStore.getState().selectedNode?.id).toBe('n1');
  });

  it('selectPoet 应设置选中诗人详情', () => {
    const detail = {
      poet: { id: 'p1', name: '李白', dynasty: 'TANG', biography: '', workCount: 1 },
      score: null,
      node: { id: 'n1', refType: 'POET' as const, refId: 'p1', position: { x: 0, y: 0, z: 0 }, dynasty: 'TANG', size: 3, brightness: 0.8, label: '李白' },
    };
    useGalaxyStore.getState().selectPoet(detail);
    expect(useGalaxyStore.getState().selectedPoet?.poet.name).toBe('李白');
  });

  it('setConvergenceState 应更新聚气状态', () => {
    useGalaxyStore.getState().setConvergenceState('converging');
    expect(useGalaxyStore.getState().convergenceState).toBe('converging');
    useGalaxyStore.getState().setConvergenceState('focused');
    expect(useGalaxyStore.getState().convergenceState).toBe('focused');
  });

  it('setRendererType 应更新渲染器类型', () => {
    useGalaxyStore.getState().setRendererType('canvas2d');
    expect(useGalaxyStore.getState().rendererType).toBe('canvas2d');
  });

  it('setDivergenceActive 应更新散气状态', () => {
    useGalaxyStore.getState().setDivergenceActive(true);
    expect(useGalaxyStore.getState().isDivergenceActive).toBe(true);
  });
});
