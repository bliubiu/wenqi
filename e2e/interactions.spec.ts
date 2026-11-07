import { test, expect } from '@playwright/test';
import { gotoGalaxy, openPoetDetail } from './helpers';

test.describe('交互与视图业务', () => {
  test('每日一诗、双诗人对比、分享还原、时间轴、维度、地理、无障碍', async ({ page }) => {
    test.setTimeout(300_000);
    page.on('pageerror', (error) => console.log('[页面异常]', error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) console.log('[资源异常]', response.status(), response.url());
    });

    await gotoGalaxy(page);

    await test.step('每日一诗推荐卡可跳转诗人详情', async () => {
      const card = page.getByTestId('daily-poem-card');
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByText('每日一诗')).toBeVisible();
      await card.getByRole('button', { name: '在星图中查看' }).click();
      await expect(page.getByTestId('poet-detail-panel')).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('poet-detail-panel')).toBeHidden({ timeout: 30_000 });
    });

    await test.step('双诗人对比：三气雷达与关系网叠加', async () => {
      await openPoetDetail(page, '李白');
      const detail = page.getByTestId('poet-detail-panel');
      await detail.getByRole('button', { name: '与关联诗人对比' }).click();

      const compare = page.getByTestId('compare-panel');
      await expect(compare).toBeVisible();
      await expect(compare.getByText('双诗人对比')).toBeVisible();

      // 首个按钮为关闭按钮，其后为候选关联诗人
      await compare.getByRole('button').nth(1).click();
      await expect(compare.getByRole('img', { name: '三气雷达对比' })).toBeVisible({ timeout: 30_000 });
      await expect(compare.getByText('关系网叠加')).toBeVisible();
      await expect(compare.getByText(/共同 \d+/)).toBeVisible();

      await compare.getByRole('button', { name: '关闭对比' }).click();
      await expect(compare).toBeHidden();
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toBeHidden({ timeout: 30_000 });
    });

    await test.step('分享：生成带参数的链接并导出诗词卡片', async () => {
      await openPoetDetail(page, '李白');
      const detail = page.getByTestId('poet-detail-panel');

      await page.locator('[data-nav-trigger="share"]').click();
      const panel = page.getByTestId('share-panel');
      await expect(panel).toBeVisible();

      await panel.getByRole('button', { name: '复制' }).click();
      const shareUrl = await panel.getByTestId('share-url').inputValue();
      expect(shareUrl).toContain('focus=');
      expect(shareUrl).toContain('q=');

      const posterButton = panel.getByRole('button', { name: '诗词卡片' });
      await expect(posterButton).toBeEnabled({ timeout: 60_000 });
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        posterButton.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/wenqi-card-\d{4}-\d{2}-\d{2}\.png/);

      await page.locator('[data-nav-trigger="share"]').click();
      await expect(panel).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('poet-detail-panel')).toBeHidden({ timeout: 30_000 });

      await test.step('分享链接还原搜索态与聚焦', async () => {
        await page.goto(shareUrl);
        await expect(page.getByTestId('node-count')).toHaveText(/14,181/, { timeout: 150_000 });
        await expect(page.getByPlaceholder('搜索诗人、作品...')).toHaveValue('李白');
        await expect(page.getByTestId('poet-detail-panel')).toBeVisible({ timeout: 60_000 });
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('poet-detail-panel')).toBeHidden({ timeout: 30_000 });
      });
    });

    await test.step('时间轴回放：播放、暂停、复位', async () => {
      await page.getByRole('button', { name: '播放', exact: true }).click();
      await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '暂停', exact: true }).click();
      await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
      await expect(page.getByText(/诗人 .+ · 作品 .+/)).toBeVisible();

      await page.getByRole('button', { name: '复位' }).click();
      await expect(page.getByRole('button', { name: '复位' })).toBeDisabled();
    });

    await test.step('维度调节：预设切换生效', async () => {
      await page.locator('[data-nav-trigger="dimension"]').click();
      const talentPreset = page.getByRole('button', { name: '才气优先' });
      await expect(talentPreset).toBeVisible();
      await talentPreset.click();
      await expect(talentPreset).toHaveClass(/text-yellow-300/);
      await page.getByRole('button', { name: '重置' }).click();
      await expect(talentPreset).not.toHaveClass(/text-yellow-300/);
      await page.locator('[data-nav-trigger="dimension"]').click();
      await expect(talentPreset).toBeHidden();
    });

    await test.step('地理模式：切换地图布局并展示籍贯覆盖率', async () => {
      await page.getByRole('button', { name: '地图', exact: true }).click();
      await expect(page.getByText('未标注籍贯的诗人不参与地图投影')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/籍贯 .*%/)).toBeVisible();
      await page.getByRole('button', { name: '星系', exact: true }).click();
      await expect(page.getByText('未标注籍贯的诗人不参与地图投影')).toBeHidden({ timeout: 30_000 });
    });

    await test.step('无障碍设置：字体大小与高对比度', async () => {
      await page.locator('[data-nav-trigger="a11y"]').click();
      const panel = page.getByTestId('a11y-panel');
      await expect(panel).toBeVisible();

      await panel.getByRole('button', { name: '大', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
        .toBe('18px');

      await panel.getByText('高对比度').click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('high-contrast')))
        .toBe(true);

      await panel.getByText('高对比度').click();
      await panel.getByRole('button', { name: '中', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
        .toBe('16px');
    });
  });
});
