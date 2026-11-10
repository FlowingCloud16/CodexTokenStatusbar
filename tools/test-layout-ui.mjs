import fs from 'node:fs';
import assert from 'node:assert/strict';
import { launchHarnessBrowser } from './browser-harness.mjs';

const browser = await launchHarnessBrowser();
const checks = [], errors = [];
const source = fs.readFileSync(new URL('../src/statusbar.js', import.meta.url), 'utf8');
const state = {
  threadId: 'layout-thread', total: { input_tokens: 57000000, cached_input_tokens: 55803000, output_tokens: 800000, total_tokens: 57800000 },
  cacheHitRate: 97.9, turnRate: { value: 34.4, estimated: true, status: 'sampled', sampleAgeMs: 1000 },
  cost: { total: { amount: { minPicoUsd: '13400000000000', maxPicoUsd: '13400000000000' } } },
};
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<!doctype html><html lang="en-US"><head><style>
    body{margin:0;font:13px/18px "Segoe UI",sans-serif;background:#30302e;color:#eee}[hidden]{display:none!important}
    .composer{box-sizing:border-box;margin:300px 8px 0;padding:12px;background:#444441;border-radius:22px;container-type:inline-size}
    [data-composer-footer-responsive]{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:5px;align-items:center;min-width:0}
    .input{grid-column:1/-1;grid-row:1;height:50px}.left{grid-column:1;grid-row:2;display:flex;gap:5px;min-width:0}.right{grid-column:3;grid-row:2;display:flex;gap:4px;min-width:0}
    button{background:transparent;color:inherit;border:0;font:inherit;height:28px;white-space:nowrap;padding:0 5px}
    .native-icon{width:28px;padding:0;flex:none}.model{min-width:0}.model span{display:block;max-width:230px;overflow:hidden;text-overflow:ellipsis}
    @container (max-width:530px){.permission span{display:none}.permission{width:28px;padding:0}.model span{max-width:100px}}
  </style></head><body><div class="composer"><div data-composer-footer-responsive id="first-footer"><div class="input">Work with Codex</div><div class="left"><button class="native-icon">+</button><button class="permission">◇ <span>Full access</span></button></div><div class="right"><button class="model" aria-label="Select model"><span>GPT-6.1 Sol · Extra high⌄</span></button><button class="native-icon">◉</button><button class="native-icon">↑</button></div></div></div></body></html>`);
  await page.evaluate(() => { window.__modelClicks = 0; document.querySelector('.model').onclick = () => window.__modelClicks++; });
  await page.addScriptTag({ content: source });
  const host = page.locator('#codex-token-statusbar');
  const toggle = host.locator('[data-action="toggle"]');
  const inspect = () => page.evaluate(() => window.__codexTokenStatusbar.inspect());
  const apply = layout => page.evaluate(layout => window.__codexTokenStatusbar.setSettings({ layout }), layout);
  await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), state);
  assert.equal((await inspect()).layout, 'adaptive');
  assert.equal((await inspect()).presentation, 'full');
  await toggle.click(); await host.locator('[data-tab="settings"]').click();
  await host.locator('[data-layout-option="separate"]').click();
  let report = await inspect();
  assert.equal(report.layout, 'separate'); assert.equal(report.settingsChange.layout, 'separate');
  assert.equal(await apply('adaptive'), false);
  assert.equal((await inspect()).layout, 'separate');
  await page.evaluate(request => window.__codexTokenStatusbar.setSettings({ layout: request.layout }, request.id), report.settingsChange);
  assert.equal((await inspect()).settingsChange, null);
  assert.equal(await host.locator('[data-settings="status"]').textContent(), 'Saved');
  checks.push('设置页切换立即生效，较旧的后台值不会覆盖未保存的新选择，收到保存确认后结束等待');

  await host.locator('[data-layout-option="icon"]').click();
  report = await inspect();
  await page.evaluate(id => window.__codexTokenStatusbar.settingsError(id), report.settingsChange.id);
  assert.match(await host.locator('[data-settings="status"]').textContent(), /Could not save/);
  await page.evaluate(request => window.__codexTokenStatusbar.setSettings({ layout: request.layout }, request.id), report.settingsChange);
  assert.equal(await toggle.locator('.statistics-icon').isVisible(), true);
  assert.equal(await host.locator('[data-metric="speed"]').isVisible(), false);
  assert.match(await toggle.getAttribute('aria-label'), /34\.4.*57,800,000.*97\.9.*13\.4000/);
  await host.locator('[data-tab="usage"]').click();
  assert.match(await host.locator('[data-detail="total"]').textContent(), /57,800,000/);
  checks.push('单图标模式保持完整无障碍说明与全部详情，保存失败有提示且可重试');

  await host.locator('[data-tab="usage"]').press('End');
  assert.equal((await inspect()).motion.tab, 'settings');
  await host.locator('[data-tab="settings"]').press('Home');
  assert.equal((await inspect()).motion.tab, 'usage');
  await host.locator('[data-tab="usage"]').press('ArrowLeft');
  assert.equal((await inspect()).motion.tab, 'settings');
  await page.evaluate(() => { document.documentElement.lang = 'zh-TW'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'zh');
  assert.equal(await host.locator('[data-tab="settings"]').textContent(), '设置');
  assert.equal(await host.locator('[data-layout-option="icon"]').textContent(), '单图标入口');
  await page.evaluate(() => { document.documentElement.lang = 'ja-JP'; });
  await page.waitForFunction(() => window.__codexTokenStatusbar.inspect().language === 'en');
  assert.equal(await host.locator('[data-tab="settings"]').textContent(), 'Settings');
  checks.push('三个页签支持方向键、Home、End，设置跟随中文，其他语言显示英文');

  await host.locator('[data-layout-option="icon"]').press('Home');
  assert.equal((await inspect()).layout, 'adaptive');
  assert.equal(await host.locator('[data-layout-option="adaptive"]').getAttribute('aria-checked'), 'true');
  await host.locator('[data-layout-option="adaptive"]').press('ArrowDown');
  assert.equal((await inspect()).layout, 'separate');
  await host.locator('[data-layout-option="separate"]').press('End');
  assert.equal((await inspect()).layout, 'icon');
  report = await inspect();
  await page.evaluate(request => window.__codexTokenStatusbar.setSettings({ layout: request.layout }, request.id), report.settingsChange);
  checks.push('布局选项支持真实鼠标点击、方向键、Home 和 End，选中态与设置保存确认同步');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await host.locator('[data-tab="usage"]').click();
  await host.locator('[data-tab="settings"]').click();
  await page.evaluate(() => {
    window.__composerEvents = [];
    const composer = document.querySelector('.composer');
    for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) composer.addEventListener(type, event => window.__composerEvents.push(event.type));
  });
  await host.locator('[data-layout-option="separate"]').click();
  await host.locator('[data-layout-option="separate"]').press('ArrowDown');
  assert.equal((await inspect()).layout, 'icon');
  assert.deepEqual(await page.evaluate(() => window.__composerEvents), []);
  assert.equal(await host.locator('[data-layout-option="icon"]').evaluate(el => el === el.getRootNode().activeElement), true);
  await host.locator('[data-layout-option="icon"]').press('Escape');
  await page.waitForFunction(() => !window.__codexTokenStatusbar.inspect().motion.open);
  assert.equal(await toggle.evaluate(el => el === el.getRootNode().activeElement), true);
  report = await inspect();
  await page.evaluate(request => window.__codexTokenStatusbar.setSettings({ layout: request.layout }, request.id), report.settingsChange);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  checks.push('正常动画下真实点击可切换，输入框不会抢走菜单内鼠标或方向键操作，Escape 关闭并恢复焦点');
  await page.setViewportSize({ width: 430, height: 800 }); await apply('adaptive');
  await page.waitForTimeout(40);
  assert.equal((await inspect()).presentation, 'icon');
  await page.setViewportSize({ width: 1040, height: 800 });
  await page.waitForTimeout(40);
  assert.equal((await inspect()).presentation, 'full');
  assert.ok((await inspect()).availableWidth > 400);
  checks.push('原生右侧工具区铺满剩余宽度时仍按实际控件测量，窗口缩小再放大可恢复四项，不会卡在图标或额外行');

  const visibleMetrics = () => page.evaluate(() => [...document.getElementById('codex-token-statusbar').shadowRoot.querySelectorAll('[data-metric]')].filter(el => el.getBoundingClientRect().width > 0).map(el => el.dataset.metric));
  const stages = new Set();
  for (let width = 520; width <= 1040; width += 10) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(20);
    const names = await visibleMetrics();
    if (names.length >= 2) assert.ok(names.includes('speed') && names.includes('cache'), JSON.stringify({ width, names }));
    if (names.length === 3) assert.deepEqual(names, ['speed', 'cache', 'cost']);
    stages.add(names.length);
  }
  assert.ok([0, 2, 3, 4].every(count => stages.has(count)), JSON.stringify([...stages]));
  checks.push('连续缩放覆盖图标、两项、三项和四项；优先显示速度与缓存，第三项费用，第四项用量');

  let layouts = 0;
  for (const width of [320, 430, 560, 650, 736, 1040]) for (const lang of ['en-US', 'zh-CN']) for (const layout of ['adaptive', 'separate', 'icon']) for (const range of [false, true]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(lang => { document.documentElement.lang = lang; }, lang);
    await apply(layout);
    const value = structuredClone(state);
    if (range) value.cost.total.amount = { minPicoUsd: '123456780000000000', maxPicoUsd: '999999990000000000' };
    await page.evaluate(value => window.__codexTokenStatusbar.setSnapshot(value), value);
    await page.waitForTimeout(35);
    const geometry = await page.evaluate(() => {
      const host = document.getElementById('codex-token-statusbar'), root = host.shadowRoot;
      const r = host.getBoundingClientRect(), model = document.querySelector('#first-footer .model').getBoundingClientRect();
      const overlap = r.top < model.bottom && r.bottom > model.top && r.left < model.right && r.right > model.left;
      return { overflow: document.documentElement.scrollWidth > innerWidth, overlap, modelWidth: model.width,
        clippedMetric: [...root.querySelectorAll('[data-metric]')].some(el => { const q = el.getBoundingClientRect(); return q.width > 0 && (q.left < r.left - 1 || q.right > r.right + 1); }),
        visibleMetrics: [...root.querySelectorAll('[data-metric]')].filter(el => el.getBoundingClientRect().width > 0).length,
        iconWidth: root.querySelector('[data-action="toggle"]').getBoundingClientRect().width };
    });
    assert.equal(geometry.overflow, false, JSON.stringify({ width, lang, layout, range, geometry }));
    assert.equal(geometry.overlap, false, JSON.stringify({ width, lang, layout, range, geometry }));
    assert.equal(geometry.clippedMetric, false, JSON.stringify({ width, lang, layout, range, geometry }));
    assert.ok(geometry.modelWidth >= 28);
    if (layout === 'separate') assert.equal(geometry.visibleMetrics, 4);
    if (layout === 'icon') assert.equal(geometry.iconWidth, 28);
    layouts++;
  }
  await page.locator('#first-footer .model').click();
  assert.equal(await page.evaluate(() => window.__modelClicks), 1);
  checks.push(`${layouts} 个宽度、语言、布局与金额组合无页面横向溢出或模型重叠；独立行保留四项，图标入口固定 28px，原生模型按钮可点击`);

  await apply('separate');
  await page.evaluate(() => {
    const first = document.querySelector('#first-footer');
    const second = first.cloneNode(true); second.id = 'second-footer'; second.querySelector('#codex-token-statusbar').remove();
    first.parentElement.append(second); first.hidden = true;
  });
  await page.waitForFunction(() => document.getElementById('codex-token-statusbar').parentElement.id === 'second-footer');
  assert.equal((await inspect()).layout, 'separate');
  assert.equal(await host.count(), 1);
  await toggle.click(); await host.locator('[data-tab="settings"]').click();
  assert.equal(await host.locator('[data-layout-option="separate"]').getAttribute('aria-checked'), 'true');
  checks.push('保留隐藏输入框并切换对话后，布局设置跟随唯一状态栏，设置入口仍可操作');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__codexTokenStatusbar.dispose());
  assert.equal(await host.count(), 0);
  await page.setContent('<html lang="en"><body><div data-composer-footer-responsive style="display:flex;flex-wrap:nowrap;width:600px"><button>Model</button></div></body></html>');
  await page.addScriptTag({ content: source });
  await apply('separate');
  assert.equal(await page.locator('[data-composer-footer-responsive]').evaluate(el => el.style.flexWrap), 'wrap');
  await apply('icon');
  assert.equal(await page.locator('[data-composer-footer-responsive]').evaluate(el => el.style.flexWrap), 'nowrap');
  await apply('separate'); await page.evaluate(() => window.__codexTokenStatusbar.dispose());
  assert.equal(await page.locator('[data-composer-footer-responsive]').evaluate(el => el.style.flexWrap), 'nowrap');
  checks.push('兼容 flex 工具栏的独立行，切换布局和卸载均恢复宿主原始换行设置');
  assert.deepEqual(errors, []);
  checks.push('卸载后移除状态栏，所有设置与布局交互没有浏览器脚本错误');
  const result = { passed: checks.length, layouts, checks, errors, scope: 'production-layout-settings-with-native-model-controls' };
  fs.writeFileSync(new URL('../reports/layout-ui-checks.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
