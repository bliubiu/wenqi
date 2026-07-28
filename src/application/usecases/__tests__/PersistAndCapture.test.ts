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
});
