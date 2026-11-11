import { test, expect } from '@playwright/test';
import { gotoGalaxy, openPoetDetail } from './helpers';

test.describe('星系核心业务闭环', () => {
  test('初始化、搜索定位、诗人详情、关系与行迹、收藏星单', async ({ page }) => {
    test.setTimeout(300_000);
    page.on('pageerror', (error) => console.log('[页面异常]', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('[控制台异常]', message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) console.log('[资源异常]', response.status(), response.url());
    });

    await test.step('初始化星系并渲染 WebGL 场景', async () => {
      await gotoGalaxy(page);
      await expect(page.getByText('渲染 WebGL 3D')).toBeVisible();
      await expect(page.getByTestId('node-count')).toContainText('14,181');
      await expect(page.getByText('时间演化')).toBeVisible();
      await expect(page.getByTestId('daily-poem-card')).toBeVisible({ timeout: 30_000 });
    });

    await test.step('搜索“李白”并确认首条结果为诗人李白', async () => {
      await openPoetDetail(page, '李白');
      await expect(page.getByTestId('poet-name')).toHaveText('李白');
      const firstResult = page.getByTestId('search-result-item').first();
      await expect(firstResult).toBeHidden();
    });

    await test.step('详情面板展示三气评分并可展开评分构成', async () => {
      const detail = page.getByTestId('poet-detail-panel');
      await expect(detail.getByText('三气评分')).toBeVisible();
      await expect(detail.getByText('才气', { exact: true })).toBeVisible();
      await expect(detail.getByText('人气', { exact: true })).toBeVisible();
      await expect(detail.getByText('运气', { exact: true })).toBeVisible();

      await detail.getByRole('button', { name: '查看评分构成' }).click();
      await expect(detail.getByRole('button', { name: '收起评分构成' })).toBeVisible();
      await expect(detail.getByText('词汇独特性')).toBeVisible();
      await expect(detail.getByText('算法版本', { exact: false })).toBeVisible();
    });

    await test.step('切换关系图谱标签页', async () => {
      const detail = page.getByTestId('poet-detail-panel');
      await detail.getByRole('button', { name: '关系图谱' }).click();
      const graph = detail.getByTestId('relation-graph');
      const empty = detail.getByTestId('relation-graph-empty');
      await expect(graph.or(empty)).toBeVisible({ timeout: 30_000 });
    });

    await test.step('切换行迹标签页并渲染行迹地图', async () => {
      const detail = page.getByTestId('poet-detail-panel');
      await detail.getByRole('button', { name: '行迹' }).click();
      await expect(detail.getByTestId('journey-map')).toBeVisible({ timeout: 30_000 });
      await expect(detail.getByText('出生', { exact: true })).toBeVisible();

      // 行迹轨迹折线与停靠点渲染（李白为精选行迹诗人，必有阶段数据）
      const map = detail.getByTestId('journey-map');
      await expect(map.locator('polyline').first()).toBeVisible({ timeout: 30_000 });
      expect(await map.locator('circle').count()).toBeGreaterThan(0);
    });

    await test.step('收藏诗人并在星单中可见', async () => {
      const detail = page.getByTestId('poet-detail-panel');
      await detail.getByRole('button', { name: '收藏到我的星单' }).click();
      await expect(detail.getByRole('button', { name: '取消收藏' })).toBeVisible();

      await page.getByRole('button', { name: '我的星单' }).click();
      const starList = page.getByTestId('star-list-panel');
      await expect(starList).toBeVisible();
      await expect(starList.getByRole('button', { name: /李白/ })).toBeVisible();

      await page.getByRole('button', { name: '我的星单' }).click();
      await expect(starList).toBeHidden();
      await detail.getByRole('button', { name: '取消收藏' }).click();
    });

    await test.step('关系谱证据溯源并点击跳转聚焦', async () => {
      const detail = page.getByTestId('poet-detail-panel');
      await detail.getByRole('button', { name: '关系图谱' }).click();
      const graph = detail.getByTestId('relation-graph');
      await expect(graph).toBeVisible({ timeout: 30_000 });

      // hover 关联诗人节点：展示关系类别与证据（赠答原题 / 化用片段）
      const node = graph.locator('g.cursor-pointer').first();
      await node.hover();
      await expect(graph.getByText(/【.+】/).first()).toBeVisible({ timeout: 15_000 });

      // 点击跳转：详情面板切换为关联诗人（不再是李白）
      await node.click();
      await expect(page.getByTestId('poet-name')).not.toHaveText('李白', { timeout: 30_000 });
    });

    await test.step('按 ESC 取消聚焦并关闭详情', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('poet-detail-panel')).toBeHidden({ timeout: 30_000 });
    });
  });
});
