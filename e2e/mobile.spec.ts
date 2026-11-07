import { test, expect } from '@playwright/test';
import { gotoGalaxy, openPoetDetail } from './helpers';

test.describe('移动端业务', () => {
  test('底部导航可见且搜索详情主链路可用', async ({ page }) => {
    test.setTimeout(300_000);
    await gotoGalaxy(page);

    const nav = page.getByTestId('mobile-nav');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: '漫游' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '维度' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '分享' })).toBeVisible();
    await expect(nav.getByRole('button', { name: '设置' })).toBeVisible();

    await test.step('底部导航进入主题漫游', async () => {
      await nav.getByRole('button', { name: '漫游' }).click();
      await expect(page.getByTestId('tour-picker')).toBeVisible();
      await page.getByRole('button', { name: '关闭漫游列表' }).click();
      await expect(page.getByTestId('tour-picker')).toBeHidden();
    });

    await test.step('底部导航打开维度、分享、设置面板', async () => {
      await nav.getByRole('button', { name: '维度' }).click();
      await expect(page.getByRole('heading', { name: '维度调节' })).toBeVisible();
      await nav.getByRole('button', { name: '分享' }).click();
      await expect(page.getByTestId('share-panel')).toBeVisible();
      await nav.getByRole('button', { name: '设置' }).click();
      await expect(page.getByTestId('a11y-panel')).toBeVisible();
    });

    await test.step('搜索并打开移动端诗人详情抽屉', async () => {
      await openPoetDetail(page, '李白');
      await expect(page.getByTestId('poet-name')).toHaveText('李白');
      await expect(page.getByText('三气评分')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('poet-detail-panel')).toBeHidden({ timeout: 30_000 });
    });
  });
});
