import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CHECK_PAGE_URL || 'http://127.0.0.1:8080/?view=coastal';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('sylva-dock').count(), 1, 'Navigation must be an independent Sylva Dock component');
  await page.waitForFunction(() => document.querySelector('sylva-dock').introDone);
  const read = () => page.locator('sylva-dock').evaluate(el => ({
    items: el.items.map(st => ({ baseWidth: st.baseWidth, baseHeight: st.baseHeight, value: st.value,
      velocity: st.velocity, target: st.target, width: st.el.getBoundingClientRect().width,
      height: st.el.getBoundingClientRect().height, x: st.el.getBoundingClientRect().x,
      y: st.el.getBoundingClientRect().y, color: getComputedStyle(st.el).backgroundColor,
      near: st.el.dataset.near, font: getComputedStyle(st.el).fontSize })),
    shell: el.dock.getBoundingClientRect().toJSON(), frame: el.frame,
    angles: el.specItems.map(st => st.angle), brightness: el.specItems.map(st => st.brightness),
    particles: el.particles.length,
  }));
  await page.mouse.move(0, 500);
  await delay(1400);
  const rest = await read();
  const center = rest.items[3].x + rest.items[3].width / 2;
  // Proximity starts before the pointer enters a tile.
  await page.mouse.move(center, rest.shell.top - 8);
  await delay(1800);
  const near = await read();
  assert(near.items[3].width > rest.items[3].width + 10);
  assert(near.items[2].width > rest.items[2].width + 1);
  assert(near.items[4].width > rest.items[4].width + 1);
  assert(near.items[3].width > near.items[2].width);
  assert(Math.abs(near.shell.height - rest.shell.height) < .1);
  assert.equal(near.items[3].font, rest.items[3].font);
  assert.equal(near.items[3].color, 'rgba(31, 37, 28, 0.94)');
  assert.equal(await page.locator('.dock-item.is-active').count(), 1);
  await delay(700);
  const settled = await read();
  assert(near.items.every((item, index) => Math.abs(item.width - settled.items[index].width) < .1), 'A stationary pointer must not oscillate');
  assert.equal(settled.frame, 0, 'Idle animation frames must stop');
  for (let i = 1; i < settled.items.length; i++) {
    assert(settled.items[i].x >= settled.items[i - 1].x + settled.items[i - 1].width, 'Tiles must not overlap');
  }
  assert(settled.brightness[0] > .5);
  const beforeAngle = settled.angles[0];
  await page.mouse.move(settled.shell.right - 10, settled.shell.bottom + 16, { steps: 12 });
  await delay(1500);
  assert(Math.abs((await read()).angles[0] - beforeAngle) > .1);
  assert.equal(await page.locator('.dock').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await page.locator('.dock').evaluate(el => getComputedStyle(el, '::after').pointerEvents), 'none');
  // Hover temporarily uses the light appearance without selecting another route.
  await page.locator('nav a[href="#skills"]').hover();
  await delay(400);
  assert.equal((await read()).items[3].color, 'rgb(242, 243, 239)');
  assert.equal(await page.locator('.dock-item.is-active').getAttribute('href'), '#about');
  await page.mouse.move(0, 500);
  await delay(1500);
  assert.equal((await read()).items[3].color, 'rgba(255, 255, 255, 0.04)');
  await page.locator('nav a[href="#projects"]').click();
  await page.waitForFunction(() => document.querySelector('.dock-item.is-active')?.hash === '#projects');
  assert.equal(await page.locator('main > section:visible').getAttribute('id'), 'projects');
  await delay(60);
  assert.equal((await read()).particles, 52);
  assert.equal(await page.locator('.sylva-dock-pollen').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await delay(1800);
  assert.equal((await read()).particles, 0);
  await page.mouse.move(0, 500);
  await delay(1500);
  assert((await read()).items.every(st => st.value === 0 && st.near === 'false'));
  assert.equal(await page.locator('.dock-item.is-active').count(), 1);
  assert.equal((await read()).items[2].color, 'rgb(242, 243, 239)');
  assert.equal((await read()).items[0].color, 'rgba(255, 255, 255, 0.04)');

  // Keyboard focus owns the targets until a genuinely new pointer move.
  await page.locator('nav a[href="#projects"]').focus();
  await page.keyboard.press('Tab');
  await delay(100);
  const keyboard = await read();
  assert.equal(keyboard.items[3].target, 1);
  assert.equal(keyboard.items[2].target, .24);
  assert.equal(keyboard.items[4].target, .24);
  await delay(700);
  assert.equal((await read()).items[3].target, 1);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('main > section:visible').getAttribute('id'), 'skills');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('.dock-item.is-active')?.hash === '#projects');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('nav a[href="#teaching"]').click();
  await delay(150);
  const reduced = await read();
  assert(reduced.items.every(st => st.width === st.baseWidth && st.height === st.baseHeight && st.value === 0));
  assert.equal(reduced.particles, 0);
  assert.equal(await page.locator('.dock').evaluate(el => el.getAnimations().length), 0);
  assert.equal(await page.locator('.dock').evaluate(el => getComputedStyle(el).transform), 'none');

  // Reconnecting during entrance must not accept the old lifecycle's completion.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('sylva-dock').evaluate(el => { const parent = el.parentNode; el.remove(); parent.append(el); });
  await page.waitForFunction(() => document.querySelector('sylva-dock').introAnimations.size === 8);
  await page.locator('sylva-dock').evaluate(el => { const parent = el.parentNode; el.remove(); parent.append(el); });
  await delay(80);
  assert(await page.locator('sylva-dock').evaluate(el => !el.introDone && el.introAnimations.size === 8));
  // A live preference change must also cancel every tile's reveal animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await delay(80);
  assert(await page.locator('sylva-dock').evaluate(el => el.introDone && el.introAnimations.size === 0 &&
    [el.dock, ...el.items.map(st => st.el)].every(node => node.getAnimations().length === 0)));

  const touch = await browser.newPage({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  await touch.goto(base, { waitUntil: 'networkidle' });
  await touch.waitForFunction(() => document.querySelector('sylva-dock').introDone);
  assert.equal(await touch.locator('.dock-item').count(), 7);
  assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const targets = await touch.locator('.dock-item').evaluateAll(links => links.map(link => ({ width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height })));
  assert(targets.every(r => r.width >= 44 && r.height >= 44));
  assert(await touch.locator('.dock-item').evaluateAll(links => links.every(link => getComputedStyle(link).fontSize === '16px')));
  await touch.locator('nav a[href="#publications"]').tap();
  assert.equal(await touch.locator('main > section:visible').getAttribute('id'), 'publications');
  assert(await touch.locator('.dock-viewport').evaluate(el => el.scrollLeft > 0));
  assert(await touch.locator('sylva-dock').evaluate(el => el.items.every(st => st.target === 0 && st.el.dataset.near === 'false')));
  await touch.locator('sylva-dock').evaluate(el => { window.removedDock = el; el.remove(); });
  assert.equal(await touch.locator('.sylva-dock-pollen').count(), 0);
  assert(await touch.evaluate(() => window.removedDock.destroyed && window.removedDock.frame === 0));
  assert(await touch.evaluate(() => window.removedDock.abort.signal.aborted && window.removedDock.introAnimations.size === 0));
  await touch.mouse.move(120, 40);
  await touch.setViewportSize({ width: 360, height: 700 });
  await delay(80);
  assert(await touch.evaluate(() => window.removedDock.frame === 0), 'Disconnected listeners and observers must remain inactive');
  assert.deepEqual(errors, []);
  console.log('PASS: proximity/neighbors, stable pointer, no overlap, rim tracking, routing/history/pollen, keyboard ownership, touch/320px, reduced motion including entrance, idle/teardown/reconnect.');
} finally {
  await browser.close();
}
