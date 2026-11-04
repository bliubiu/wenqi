import { describe, it, expect } from 'bun:test';
import { PersistViewUseCase } from '../PersistViewUseCase';
import { CaptureScreenshotUseCase } from '../CaptureScreenshotUseCase';
import { GenerateShareLinkUseCase } from '../GenerateShareLinkUseCase';

function hasStorage(): boolean {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
}

describe('PersistViewUseCase', () => {
  it('应返回保存时间', () => {
    const useCase = new PersistViewUseCase();
    const result = useCase.execute({
      cameraPosition: [0, 0, 10],
      cameraTarget: [0, 0, 0],
      focusedNodeId: null,
      dimensionWeights: { talent: 1, popularity: 1, luck: 1 },
      clusterDimension: 'DYNASTY',
    });

    expect(result.savedAt).toBeTruthy();
    expect(result.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('存后取应一致', () => {
    if (!hasStorage()) return; // 跳过（无 localStorage）

    localStorage.removeItem('wenqi_view_state');

    const useCase = new PersistViewUseCase();
    useCase.execute({
      cameraPosition: [1, 2, 3],
      cameraTarget: [4, 5, 6],
      focusedNodeId: 'poet_1',
      dimensionWeights: { talent: 1, popularity: 1, luck: 1 },
      clusterDimension: 'DYNASTY',
    });

    const loaded = useCase.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.cameraPosition).toEqual([1, 2, 3]);
    expect(loaded!.focusedNodeId).toBe('poet_1');
  });

  it('clear 后 load 应返回 null', () => {
    if (!hasStorage()) return;

    localStorage.removeItem('wenqi_view_state');

    const useCase = new PersistViewUseCase();
    useCase.execute({
      cameraPosition: [0, 0, 0], cameraTarget: [0, 0, 0],
      focusedNodeId: null, dimensionWeights: { talent: 1, popularity: 1, luck: 1 },
      clusterDimension: 'DYNASTY',
    });
    useCase.clear();
    expect(useCase.load()).toBeNull();
  });
});

describe('CaptureScreenshotUseCase', () => {
  it('canvas 为空时应抛出异常', async () => {
    const useCase = new CaptureScreenshotUseCase();
    await expect(useCase.execute(null)).rejects.toThrow('渲染异常');
  });
});

describe('GenerateShareLinkUseCase', () => {
  it('应生成带参数的 URL', () => {
    const useCase = new GenerateShareLinkUseCase();
    const result = useCase.execute({
      cameraPosition: [1, 2, 3],
      cameraTarget: [4, 5, 6],
      focusedNodeId: 'poet_1',
    });

    expect(result.url).toContain('cx=1.00');
    expect(result.url).toContain('cy=2.00');
    expect(result.url).toContain('focus=poet_1');
  });

  it('无焦点时不应包含 focus 参数', () => {
    const useCase = new GenerateShareLinkUseCase();
    const result = useCase.execute({
      cameraPosition: [0, 0, 0],
      cameraTarget: [0, 0, 0],
      focusedNodeId: null,
    });

    expect(result.url).not.toContain('focus=');
  });

  it('应携带时间区间与搜索态参数', () => {
    const useCase = new GenerateShareLinkUseCase();
    const result = useCase.execute({
      cameraPosition: [1, 2, 3],
      cameraTarget: [4, 5, 6],
      focusedNodeId: null,
      timeRange: { fromYear: 700, toYear: 1900 },
      searchQuery: '孤寂',
    });

    const url = new URL(result.url);
    expect(url.searchParams.get('yr')).toBe('700,1900');
    expect(url.searchParams.get('q')).toBe('孤寂');
  });

  it('应从 URL 解析相机、时间区间与搜索态', () => {
    window.history.replaceState(
      {},
      '',
      '/?cx=1&cy=2&cz=3&tx=4&ty=5&tz=6&focus=poet_1&yr=700,1900&q=' + encodeURIComponent('孤寂')
    );

    const parsed = new GenerateShareLinkUseCase().parseFromUrl();
    expect(parsed).not.toBeNull();
    expect(parsed!.cameraPosition).toEqual([1, 2, 3]);
    expect(parsed!.cameraTarget).toEqual([4, 5, 6]);
    expect(parsed!.focusedNodeId).toBe('poet_1');
    expect(parsed!.timeRange).toEqual({ fromYear: 700, toYear: 1900 });
    expect(parsed!.searchQuery).toBe('孤寂');

    window.history.replaceState({}, '', '/');
  });

  it('应生成携带漫游 ID 的直达链接', () => {
    const useCase = new GenerateShareLinkUseCase();
    expect(useCase.generateTourLink('mid-autumn-moon')).toContain('tour=mid-autumn-moon');
  });

  it('应从 URL 解析漫游 ID', () => {
    window.history.replaceState({}, '', '/?tour=mid-autumn-moon');
    expect(new GenerateShareLinkUseCase().parseTourIdFromUrl()).toBe('mid-autumn-moon');
    window.history.replaceState({}, '', '/');
  });

  it('无 tour 参数时应返回 null', () => {
    window.history.replaceState({}, '', '/?cx=1');
    expect(new GenerateShareLinkUseCase().parseTourIdFromUrl()).toBeNull();
    window.history.replaceState({}, '', '/');
  });
});
