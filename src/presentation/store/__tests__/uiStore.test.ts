import { describe, it, expect, beforeEach } from 'bun:test';
import { useUIStore } from '../uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      searchOpen: false,
      dimensionPanelOpen: false,
      sharePanelOpen: false,
      accessibilityPanelOpen: false,
    });
  });

  it('初始所有面板应关闭', () => {
    const state = useUIStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.dimensionPanelOpen).toBe(false);
    expect(state.sharePanelOpen).toBe(false);
    expect(state.accessibilityPanelOpen).toBe(false);
  });

  it('toggleSearch 应切换搜索面板', () => {
    useUIStore.getState().toggleSearch();
    expect(useUIStore.getState().searchOpen).toBe(true);
    useUIStore.getState().toggleSearch();
    expect(useUIStore.getState().searchOpen).toBe(false);
  });

  it('toggleDimension 应切换维度面板', () => {
    useUIStore.getState().toggleDimension();
    expect(useUIStore.getState().dimensionPanelOpen).toBe(true);
  });

  it('toggleShare 应切换分享面板', () => {
    useUIStore.getState().toggleShare();
    expect(useUIStore.getState().sharePanelOpen).toBe(true);
  });

  it('toggleAccessibility 应切换无障碍面板', () => {
    useUIStore.getState().toggleAccessibility();
    expect(useUIStore.getState().accessibilityPanelOpen).toBe(true);
  });

  it('打开任一面板时应关闭其他面板（互斥）', () => {
    useUIStore.setState({ sharePanelOpen: true });
    useUIStore.getState().toggleAccessibility();
    const state = useUIStore.getState();
    expect(state.accessibilityPanelOpen).toBe(true);
    expect(state.sharePanelOpen).toBe(false);
    expect(state.dimensionPanelOpen).toBe(false);
    expect(state.searchOpen).toBe(false);
  });

  it('toggleDimension 应关闭已打开的分享面板', () => {
    useUIStore.setState({ sharePanelOpen: true });
    useUIStore.getState().toggleDimension();
    const state = useUIStore.getState();
    expect(state.dimensionPanelOpen).toBe(true);
    expect(state.sharePanelOpen).toBe(false);
  });

  it('toggleShare 应关闭已打开的维度面板', () => {
    useUIStore.setState({ dimensionPanelOpen: true });
    useUIStore.getState().toggleShare();
    const state = useUIStore.getState();
    expect(state.sharePanelOpen).toBe(true);
    expect(state.dimensionPanelOpen).toBe(false);
  });

  it('closeAll 应关闭所有面板', () => {
    useUIStore.setState({ searchOpen: true, dimensionPanelOpen: true, sharePanelOpen: true, accessibilityPanelOpen: true });
    useUIStore.getState().closeAll();
    const state = useUIStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.dimensionPanelOpen).toBe(false);
    expect(state.sharePanelOpen).toBe(false);
    expect(state.accessibilityPanelOpen).toBe(false);
  });
});
