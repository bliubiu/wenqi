import { test, expect } from '@playwright/test';
import { gotoGalaxy } from './helpers';

test.describe('主题漫游', () => {
  test('选择剧本后可播放、翻步并退出', async ({ page }) => {
    test.setTimeout(300_000);
    await gotoGalaxy(page);

    await page.locator('[data-nav-trigger="tour"]').click();
    const picker = page.getByTestId('tour-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('heading', { name: '主题漫游' })).toBeVisible();

    const tourButtons = picker.locator('button').filter({ hasText: /步 · 约/ });
    await expect(tourButtons.first()).toBeVisible({ timeout: 30_000 });
    expect(await tourButtons.count()).toBeGreaterThan(0);
    await tourButtons.first().click();

    const player = page.getByTestId('tour-player');
    await expect(player).toBeVisible({ timeout: 30_000 });
    await expect(player.getByRole('button', { name: '下一步' })).toBeEnabled({ timeout: 30_000 });

    const caption = player.locator('[aria-live="polite"]');
    const firstCaption = await caption.innerText();

    await player.getByRole('button', { name: '下一步' }).click();
    await expect.poll(() => caption.innerText()).not.toBe(firstCaption);

    await player.getByRole('button', { name: '暂停' }).click();
    await expect(player.getByRole('button', { name: '继续' })).toBeVisible();

    await player.getByRole('button', { name: '退出' }).click();
    await expect(player).toBeHidden();
    await expect(page.getByTestId('poet-detail-panel')).toBeHidden();
  });
});
