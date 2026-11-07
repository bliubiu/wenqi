import { expect, type Page } from '@playwright/test';

/** 应用根容器（星系画布区域） */
export const APP_SELECTOR = '[role="application"]';

/** 首屏引导弹层会遮挡交互，导航前预置已读标记 */
async function prepareStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('wenqi_welcome_shown', '1');
    } catch {
      // 首次导航前 localStorage 尚不可用，忽略
    }
  });
}

/** 打开首页并等待 WASM、数据与场景就绪 */
export async function gotoGalaxy(page: Page): Promise<void> {
  await prepareStorage(page);
  await page.goto('/');
  await expect(page.locator(APP_SELECTOR)).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('node-count')).toHaveText(/14,181/, { timeout: 150_000 });
  await page.waitForFunction(() => !document.body.innerText.includes('凝气 — 唤醒文脉引擎'), null, {
    timeout: 150_000,
  });
}

/** 在搜索框输入关键词并等待结果列表 */
export async function search(page: Page, keyword: string): Promise<void> {
  await page.getByPlaceholder('搜索诗人、作品...').fill(keyword);
  await expect(page.getByTestId('search-result-item').first()).toBeVisible({ timeout: 60_000 });
}

/** 搜索并点击首个结果，等待诗人详情面板打开 */
export async function openPoetDetail(page: Page, keyword: string): Promise<void> {
  await search(page, keyword);
  await page.getByTestId('search-result-item').first().click();
  await expect(page.getByTestId('poet-detail-panel')).toBeVisible({ timeout: 30_000 });
}
