import { test, expect } from '@playwright/test';

test('profile session persistence', async ({ browser }) => {
  const context = await browser.newContext({
    userDataDir: 'C:\\Users\\Appollo\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 4'
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3333');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'profile-session-screenshot.png' });
  const title = await page.title();
  console.log('Page title:', title);
  const url = page.url();
  console.log('URL:', url);
  await context.close();
});