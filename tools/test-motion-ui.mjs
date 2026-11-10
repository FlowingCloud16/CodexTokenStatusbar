import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchHarnessBrowser } from './browser-harness.mjs';
import { createMetricsAccumulator } from '../src/metrics.mjs';

const checks=[], errors=[];
const source=fs.readFileSync(new URL('../src/statusbar.js',import.meta.url),'utf8');
const acc=createMetricsAccumulator({threadId:'motion-a'});
acc.consume({type:'session_meta',payload:{id:'motion-a',model_provider:'openai'}});
acc.consume({type:'turn_context',payload:{turn_id:'turn-a',model:'gpt-6.1-sol'}});
const usage={input_tokens:100000,cached_input_tokens:80000,cache_write_input_tokens:0,output_tokens:2000,total_tokens:102000};
acc.consume({type:'token_usage_record',payload:{turn_id:'turn-a',response_id:'response-a',usage,thread_token_usage:usage,turn_token_usage:usage}});
const snapshot={...acc.snapshot(),turnRate:{value:42.4,estimated:true,status:'completed'}};
const browser=await launchHarnessBrowser();
try{
  const page=await browser.newPage({viewport:{width:1040,height:980},reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent([
    '<!doctype html><html lang="zh-CN"><head><style>',
    'html{color-scheme:dark;--menu-background-color:#3f3f3d;--color-text-primary:#f9f9f7;--color-text-secondary:#b2b2b0;--color-text-tertiary:#aaa9a6;--menu-font-size:13px}',
    'body{margin:0;background:#2d2d2b;color:#f9f9f7;font:14px/1.5 "Segoe UI",sans-serif}',
    'main{max-width:840px;margin:24px auto;padding:0 20px}.notice{margin-bottom:600px;color:#aaa9a6;font-size:12px}',
    '.composer{border:1px solid #ffffff15;border-radius:23px;background:#3b3b39;padding:14px 12px 10px}.placeholder{margin:0 0 28px;color:#aaa9a6}',
    '[data-composer-footer-responsive]{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;min-width:0;align-items:center}',
    '.model{grid-column:1;grid-row:2;white-space:nowrap;font-size:13px}.send{grid-column:3;grid-row:2;width:28px;height:28px;border:0;border-radius:50%}',
    '</style></head><body><main><p class="notice">正式组件动效验证 · 示例数据</p><div class="composer"><p class="placeholder">向 Codex 提问或描述任务…</p><div data-composer-footer-responsive><span class="model">GPT-6.1 Sol⌄</span><button class="send">↑</button></div></div></main></body></html>',
  ].join(''));
  await page.addScriptTag({content:source});
  await page.evaluate(value=>window.__codexTokenStatusbar.setSnapshot(value),snapshot);
  const host=page.locator('#codex-token-statusbar'), panel=host.locator('section');
  const state=()=>page.evaluate(()=>window.__codexTokenStatusbar.inspect().motion);
  const settled=()=>page.waitForFunction(()=>window.__codexTokenStatusbar.inspect().motion.active===0);
  const click=selector=>host.locator(selector).evaluate(el=>el.click());
  const panelRect=()=>panel.evaluate(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};});
  const runs=()=>panel.evaluate(el=>el.getAnimations().map(a=>({duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing})));

  await click('[data-action="toggle"]');
  assert.deepEqual(await runs(),[{duration:200,easing:'cubic-bezier(0.2, 0.8, 0.2, 1)'}]);
  assert.equal(await panel.evaluate(el=>el.matches(':popover-open')),true);
  await settled();
  await click('[data-action="toggle"]');
  assert.equal(await panel.evaluate(el=>el.hidden),false);
  assert.equal(await panel.evaluate(el=>el.inert),true);
  assert.equal((await runs())[0].duration,150);
  await settled();assert.equal(await panel.isVisible(),false);
  assert.equal(await panel.evaluate(el=>el.matches(':popover-open')),false);
  checks.push('菜单展开 200ms、收起 150ms，保持顶层直到收起结束，关闭期间不可聚焦');

  await click('[data-action="toggle"]');await settled();
  const before=await panelRect();
  await click('[data-tab="cost"]');
  assert.equal(await host.locator('#cts-usage-page').evaluate(el=>el.inert),true);
  assert.equal(await host.locator('.tab-viewport').evaluate(el=>el.getAnimations()[0].effect.getTiming().duration),190);
  await page.waitForTimeout(80);
  assert.ok(Math.abs((await panelRect()).bottom-before.bottom)<1);
  await settled();
  assert.equal(await host.locator('#cts-usage-page').isVisible(),false);
  assert.equal(await host.locator('#cts-cost-page').isVisible(),true);
  const indicator=await host.locator('.tab-indicator').boundingBox(),tab=await host.locator('[data-tab="cost"]').boundingBox();
  assert.ok(Math.abs(indicator.x-tab.x)<1&&Math.abs(indicator.width-tab.width)<1);
  checks.push('页签 190ms 切换含内容与高度动画，旧页不可聚焦，指示器与选中页签对齐，底边保持固定');

  const rates=host.locator('.rates-clip');
  const bottom=(await panelRect()).bottom;
  await click('details summary');
  assert.equal(await rates.evaluate(el=>el.getAnimations()[0].effect.getTiming().duration),210);
  await page.waitForTimeout(80);
  assert.ok(Math.abs((await panelRect()).bottom-bottom)<1);
  await settled();
  assert.equal(await host.locator('details').evaluate(el=>el.open),true);
  assert.ok((await rates.boundingBox()).height>100);
  await click('details summary');assert.equal(await host.locator('details').evaluate(el=>el.open),true);
  assert.equal(await rates.evaluate(el=>el.inert),true);
  await settled();assert.equal(await host.locator('details').evaluate(el=>el.open),false);
  checks.push('单价说明 210ms 展开／收起，箭头旋转，原生 details 在动画结束后折叠且菜单底边不跳动');

  await click('details summary');
  const updateDuringMotion=await page.evaluate(value=>{
    const ui=window.__codexTokenStatusbar,root=document.getElementById('codex-token-statusbar').shadowRoot;
    const node=root.querySelector('summary');node.focus();
    const animation=root.querySelector('.rates-clip').getAnimations()[0];
    ui.setSnapshot(value);ui.setSnapshot(value);ui.setSnapshot(value);
    return{sameAnimation:animation===root.querySelector('.rates-clip').getAnimations()[0],sameNode:node===root.querySelector('summary'),focused:root.activeElement===node};
  },snapshot);
  assert.deepEqual(updateDuringMotion,{sameAnimation:true,sameNode:true,focused:true});
  await settled();
  const changed=structuredClone(snapshot);changed.cost.total.models.push({...changed.cost.total.models[0],model:'gpt-6-astra'});
  await click('details summary');await settled();
  await click('details summary');
  await page.evaluate(value=>window.__codexTokenStatusbar.setSnapshot(value),changed);
  await settled();
  assert.equal(await rates.evaluate(el=>Math.abs(el.offsetHeight-el.firstElementChild.offsetHeight)<1),true);
  checks.push('相同统计刷新不重播动画、不更换单价摘要节点或丢失焦点；价格内容变高时重新对齐目标高度');

  await page.evaluate(()=>{
    const root=document.getElementById('codex-token-statusbar').shadowRoot;
    for(let i=0;i<10;i++)root.querySelector('[data-action="toggle"]').click();
  });
  await settled();assert.equal((await state()).open,true);
  await page.evaluate(()=>{
    const root=document.getElementById('codex-token-statusbar').shadowRoot;
    for(let i=0;i<11;i++)root.querySelector('[data-tab="'+(i%2?'cost':'usage')+'"]').click();
  });
  await settled();assert.equal((await state()).tab,'usage');
  assert.equal(await host.locator('#cts-cost-page').isVisible(),false);
  await click('[data-tab="cost"]');await settled();
  await page.evaluate(()=>{const summary=document.getElementById('codex-token-statusbar').shadowRoot.querySelector('summary');for(let i=0;i<10;i++)summary.click();});
  await settled();assert.equal((await state()).ratesOpen,true);
  checks.push('菜单、页签和折叠说明快速连点，以最后状态为准，无残留动画或双页显示');

  await host.locator('summary').focus();await page.keyboard.press('Escape');
  assert.equal(await host.locator('[data-action="toggle"]').evaluate(el=>el.getRootNode().activeElement===el),true);
  await settled();assert.equal(await panel.isVisible(),false);
  await click('[data-action="toggle"]');await page.emulateMedia({reducedMotion:'reduce'});
  await settled();assert.equal((await state()).reduced,true);
  await click('[data-tab="usage"]');assert.equal((await state()).active,0);
  await click('[data-action="toggle"]');assert.equal(await panel.isVisible(),false);
  await click('[data-action="toggle"]');assert.equal(await panel.isVisible(),true);
  checks.push('Escape 关闭并恢复触发器焦点；运行中开启减少动态效果立即结束动画，后续交互无动画');

  let layouts=0;
  for(const width of [320,430,736,1040])for(const lang of ['zh-CN','en-US'])for(const pageName of ['usage','cost']){
    await page.setViewportSize({width,height:980});
    await page.evaluate(lang=>{document.documentElement.lang=lang;},lang);
    await click('[data-tab="'+pageName+'"]');
    await page.waitForTimeout(20);
    const rect=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};});
    assert.ok(rect.x>=0&&rect.y>=0&&rect.right<=rect.w+1&&rect.bottom<=rect.h+1,JSON.stringify({width,lang,pageName,rect}));layouts++;
  }
  await page.setViewportSize({width:1040,height:980});
  await page.evaluate(()=>{document.querySelector('.notice').style.marginBottom='0px';});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await click('[data-action="toggle"]');await settled();
  await click('[data-action="toggle"]');await settled();
  const belowBefore=await panelRect();
  await click('[data-tab="usage"]');await settled();
  const belowAfter=await panelRect();
  assert.ok(Math.abs(belowBefore.top-belowAfter.top)<1);
  checks.push(layouts+' 个宽度、语言和页签组合保持窗口内定位，菜单在输入框下方时固定顶边');

  await click('[data-tab="cost"]');
  const switched=await page.evaluate(()=>{
    const ui=window.__codexTokenStatusbar;
    ui.setSnapshot({threadId:'motion-b',total:{total_tokens:123}});
    const root=document.getElementById('codex-token-statusbar').shadowRoot;
    return{motion:ui.inspect().motion,hidden:root.querySelector('section').hidden,total:root.querySelector('[data-value="total"]').textContent,cost:root.querySelector('[data-value="cost"]').textContent};
  });
  assert.equal(switched.hidden,true);assert.equal(switched.motion.active,0);assert.equal(switched.motion.ratesOpen,false);
  assert.equal(switched.total,'123');assert.equal(switched.cost,'--');
  await click('[data-action="toggle"]');
  await page.evaluate(()=>window.__codexTokenStatusbar.setSnapshot({threadId:'motion-b',bridgeDisconnected:true}));
  assert.equal((await state()).active,0);assert.equal(await panel.isVisible(),false);
  checks.push('对话身份改变或桥接断线时立即关闭并清理动画，清除旧费用和展开状态');

  await page.evaluate(value=>window.__codexTokenStatusbar.setSnapshot(value),snapshot);
  await click('[data-action="toggle"]');await click('[data-tab="usage"]');
  await page.evaluate(()=>window.__codexTokenStatusbar.dispose());
  await page.waitForTimeout(300);assert.equal(await host.count(),0);
  await page.addScriptTag({content:source});
  await page.waitForTimeout(50);assert.equal(await host.count(),1);assert.equal((await state()).active,0);
  await page.evaluate(()=>window.__codexTokenStatusbar.dispose());
  assert.deepEqual(errors,[]);
  checks.push('动画进行中卸载后无回调重挂载、无脚本异常，重新加载保持一个实例');
  const result={passed:checks.length,layouts,checks,errors,scope:'production-statusbar-with-native-gentle-motion'};
  fs.writeFileSync(new URL('../reports/motion-ui-checks.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
