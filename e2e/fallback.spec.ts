import { test, expect } from '@playwright/test';

test.describe('渲染降级', () => {
  test('禁用 WebGL 与 Canvas 时降级为文字模式', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      try {
        localStorage.setItem('wenqi_welcome_shown', '1');
      } catch {
        // 忽略首次导航前不可用的存储
      }
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        ...args: unknown[]
      ) {
        if (contextId === 'webgl' || contextId === 'webgl2' || contextId === '2d') return null;
        return (original as Function).call(this, contextId, ...args);
      } as typeof original;
    });

    await page.goto('/');
    await expect(page.getByTestId('node-count')).toHaveText(/14,181/, { timeout: 150_000 });
    await expect(page.getByText('渲染 文字')).toBeVisible();
    await expect(
      page.getByText('当前使用文字模式，建议使用支持 WebGL 的浏览器获得最佳体验')
    ).toBeVisible();
    await expect(page.getByText('文气星系（文字模式）')).toBeVisible();
    await expect(page.getByText(/共 14181 位诗人/)).toBeVisible();

    // 文字模式下不提供搜索框与时间轴
    await expect(page.getByPlaceholder('搜索诗人、作品...')).toHaveCount(0);
    await expect(page.getByText('时间演化')).toHaveCount(0);
  });
});
