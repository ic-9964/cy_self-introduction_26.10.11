// 浏览器交互回归检查：先启动本地服务，再运行 node tools/check-navigation.mjs。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CHECK_PAGE_URL || 'http://127.0.0.1:8080/?view=coastal';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  async function expectPanel(id) {
    await page.waitForFunction(expected => {
      const visible = [...document.querySelectorAll('main > section')]
        .filter(section => getComputedStyle(section).display !== 'none');
      return visible.length === 1 && visible[0].id === expected;
    }, id, { timeout: 3000 });
    assert.equal(await page.locator('main > section:visible').count(), 1);
    assert.equal(await page.locator('nav a[aria-current]').count(), 1);
    assert.equal(await page.locator('nav a[aria-current]').getAttribute('href'), `#${id}`);
  }

  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('main > section:visible').count(), 1,
    'The homepage must show only the introduction panel');
  await expectPanel('about');
  assert.equal(await page.locator('footer:visible').count(), 0);
  assert.equal(await page.locator('.brand').count(), 0);

  for (const id of ['experience', 'projects', 'skills', 'portfolio', 'teaching', 'publications', 'about']) {
    await page.locator(`nav a[href="#${id}"]`).click();
    await expectPanel(id);
    assert.equal(new URL(page.url()).hash, `#${id}`);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
  }

  await page.locator('nav a[href="#projects"]').click();
  await page.locator('nav a[href="#skills"]').click();
  await page.goBack();
  await expectPanel('projects');
  await page.goForward();
  await expectPanel('skills');
  await page.reload({ waitUntil: 'networkidle' });
  await expectPanel('skills');

  await page.goto(`${base.split('#')[0]}#portfolio`, { waitUntil: 'networkidle' });
  await expectPanel('portfolio');
  assert.equal(await page.locator('.work-card').count(), 4);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  assert.equal(await page.locator('.work-card').count(), 1);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.locator('#works-sort').click();
  assert.equal(await page.locator('.work-year').first().textContent(), '2025');

  await page.setViewportSize({ width: 390, height: 640 });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(150);
  await expectPanel('portfolio');
  await page.locator('#to-top').click();
  await page.waitForFunction(() => window.scrollY === 0);
  await expectPanel('portfolio');
  assert.equal(new URL(page.url()).hash, '#portfolio');

  const skillsLink = page.locator('nav a[href="#skills"]');
  await skillsLink.focus();
  await skillsLink.press('Enter');
  await expectPanel('skills');
  assert.equal(await page.evaluate(() => document.activeElement.closest('section')?.id), 'skills');
  await page.locator('nav a[href="#about"]').click();
  await expectPanel('about');

  for (const width of [320, 390, 858, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expectPanel('about');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
      `No horizontal overflow at ${width}px`);
  }

  await page.goto(`${base.split('#')[0]}#not-a-section`, { waitUntil: 'networkidle' });
  await expectPanel('about');
  assert.equal(new URL(page.url()).search, new URL(base).search);
  await page.setViewportSize({ width: 712, height: 612 });
  await page.goto(`${base.split('#')[0]}#about`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.scrollY), 0,
    'A direct panel link must keep the content below the floating navigation');
  assert.deepEqual(errors, []);
  console.log('PASS: seven exclusive panels, navigation, history, reload, direct links, filtering, sorting, scroll, keyboard, mobile, invalid hashes.');
} finally {
  await browser.close();
}
