import { listTargets, connectTarget } from './cdp-session.mjs';

export function createStatusbarManager({ endpoint, ownerId, bundle, manifest, snapshots,
  settings = null, discover = listTargets, connect = connectTarget, now = Date.now, onChange = () => {}, signal = null }) {
  const pages = new Map();
  let nextDiscovery = 0;
  let discoveryFailures = 0;
  let phase = 'starting';
  let stopped = false;
  let ticks = 0;
  let cleanupPending = 0;
  let currentSettings = { schemaVersion: 1, layout: 'adaptive' };
  const events = [];
  const record = (type, targetId = null) => {
    events.push({ at: new Date(now()).toISOString(), type, targetId });
    if (events.length > 30) events.shift();
    onChange(inspect());
  };
  function inspect() {
    // 只取已连接且已挂载的最近活动窗口；多窗口无焦点证据时不猜测当前对话。
    const mounted = [...pages.values()].filter(page => page.owned && page.report?.ui?.mounted && page.report.desktop);
    const active = mounted.filter(page => page.report.desktop.focused).sort((a, b) => b.report.desktop.focusedAt - a.report.desktop.focusedAt)[0]
      ?? mounted.filter(page => page.report.desktop.focusedAt > 0).sort((a, b) => b.report.desktop.focusedAt - a.report.desktop.focusedAt)[0]
      ?? (mounted.length === 1 ? mounted[0] : null);
    return {
      phase, endpoint, ownerId, ticks, fatal: false, cleanupPending, layout: currentSettings.layout,
      language: active?.report.ui.language ?? [...pages.values()].find(page => page.report?.ui?.mounted)?.report.ui.language ?? null,
      desktop: phase === 'running' ? active?.report.desktop ?? null : null,
      pages: [...pages].map(([id, page]) => ({ id, state: page.state, mounted: page.report?.ui?.mounted === true,
        language: page.report?.ui?.language ?? null, layout: page.report?.ui?.layout ?? null, presentation: page.report?.ui?.presentation ?? null,
        hasUsage: page.report?.hasUsage === true, hasCost: page.report?.hasCost === true,
        costComplete: page.report?.costComplete === true, priceVersion: page.report?.priceVersion ?? null,
        identity: page.report?.identity ?? null, failures: page.failures })),
      events: [...events],
    };
  }
  const setState = (page, state) => { if (page.state !== state) { page.state = state; record(state, page.target.id); } };
  const cleanupExpression = `(() => {
    const runtime = window.__codexTokenStatusbarRuntime;
    if (runtime?.version === ${JSON.stringify(manifest.version)} && runtime.inspect().bridge?.ownerId === ${JSON.stringify(ownerId)}) {
      runtime.dispose(); return true;
    }
    return false;
  })()`;
  async function closePage(page, remove) {
    let unreachable = false;
    if (remove && page.everOwned && !page.session) {
      try { page.session = await connect(endpoint, page.target); } catch { unreachable = true; }
    }
    if (page.session) {
      if (remove && page.everOwned) { try { await page.session.evaluate(cleanupExpression); } catch { unreachable = true; } }
      page.session.close(); page.session = null;
    }
    page.owned = false;
    if (remove) page.report = null;
    return unreachable;
  }
  async function step(page) {
    if (!page.session) page.session = await connect(endpoint, page.target);
    const probe = await page.session.evaluate(`(() => {
      const runtime = window.__codexTokenStatusbarRuntime;
      return {
        isCodex: window.codexWindowType === 'electron' && window.electronBridge?.windowType === 'electron',
        appVersion: window.electronBridge?.getSentryInitOptions?.()?.appVersion,
        runtime: runtime?.version === ${JSON.stringify(manifest.version)} ? runtime.inspect() : null,
        existingVersion: runtime?.version ?? null,
        uiOnly: !runtime && !!window.__codexTokenStatusbar
      };
    })()`);
    if (!probe.isCodex) {
      await closePage(page, true); page.report = null; setState(page, 'not-codex-page'); return;
    }
    if (probe.runtime && probe.runtime.buildId !== manifest.buildId) {
      const bridge = probe.runtime.bridge;
      if (bridge?.ownerId && !bridge.connected) {
        await page.session.evaluate(`(() => {
          const runtime = window.__codexTokenStatusbarRuntime;
          const state = runtime?.inspect();
          if (state?.version === ${JSON.stringify(manifest.version)} && state.bridge?.ownerId && !state.bridge.connected) runtime.dispose();
        })()`);
        probe.runtime = null; probe.existingVersion = null;
      } else { setState(page, 'different-build-present'); return; }
    }
    if (probe.uiOnly || (probe.existingVersion && !probe.runtime)) { setState(page, 'other-component-present'); return; }
    if (!probe.runtime) {
      const created = await page.session.evaluate(`(() => {
        ${bundle}
        return window.__codexTokenStatusbarRuntime?.claimBridge(${JSON.stringify(ownerId)}, 10000) ?? false;
      })()`);
      if (!created) throw new Error('组件未能建立桥接租约。');
      page.owned = true; page.everOwned = true; page.injections++;
      record(page.injections === 1 ? 'injected' : 'restored-after-reload', page.target.id);
    } else {
      const claimed = await page.session.evaluate(`window.__codexTokenStatusbarRuntime?.claimBridge(${JSON.stringify(ownerId)}, 10000) ?? false`);
      if (!claimed) { setState(page, 'owned-by-another-manager'); return; }
      page.owned = true; page.everOwned = true;
    }
    let report = await page.session.evaluate('window.__codexTokenStatusbarRuntime?.inspect() ?? null');
    if (!report) throw new Error('页面已刷新，等待重新连接。');
    const request = report.ui?.settingsChange;
    let acknowledged = null;
    try {
      if (request && typeof request.id === 'string' && request.id.length <= 100 && ['adaptive', 'separate', 'icon'].includes(request.layout)) {
        currentSettings = settings ? settings.save(request.layout) : { schemaVersion: 1, layout: request.layout };
        acknowledged = request.id;
      } else if (settings) currentSettings = settings.read();
      await page.session.evaluate(`window.__codexTokenStatusbarRuntime?.setSettings(${JSON.stringify(currentSettings)}, ${JSON.stringify(acknowledged)}, ${JSON.stringify(ownerId)})`);
    } catch {
      if (request) await page.session.evaluate(`window.__codexTokenStatusbarRuntime?.settingsError(${JSON.stringify(request.id)}, ${JSON.stringify(ownerId)})`);
    }
    if (report.identity?.status === 'resolved') {
      let snapshot = null;
      try { snapshot = snapshots?.read(report.identity); } catch { /* 日志暂不可读时继续维持已确认的页面连接。 */ }
      if (snapshot) await page.session.evaluate(`window.__codexTokenStatusbarRuntime?.setLogSnapshot(${JSON.stringify(report.identity)}, ${JSON.stringify(snapshot)}, ${JSON.stringify(ownerId)})`);
    }
    const renewed = await page.session.evaluate(`window.__codexTokenStatusbarRuntime?.refreshBridge(${JSON.stringify(ownerId)}) ?? false`);
    if (!renewed) throw new Error('桥接租约已改变。');
    report = await page.session.evaluate('window.__codexTokenStatusbarRuntime?.inspect() ?? null');
    if (!report) throw new Error('组件已离开当前页面。');
    const previousIdentity = JSON.stringify(page.report?.identity);
    page.report = report; page.failures = 0;
    setState(page, !report.ui?.mounted ? 'waiting-for-composer' : report.phase === 'adapter-unavailable' ? 'adapter-unavailable' : report.hasUsage ? 'ready' : 'waiting-for-usage');
    if (JSON.stringify(report.identity) !== previousIdentity) record('identity-changed', page.target.id);
  }
  async function tick() {
    if (stopped || signal?.aborted) return;
    ticks++;
    if (now() >= nextDiscovery) {
      try {
        const targets = (await discover(endpoint)).slice(0, 16);
        const active = new Set(targets.map(target => target.id));
        for (const [id, page] of pages) {
          if (!active.has(id)) { await closePage(page, true); pages.delete(id); record('page-closed', id); }
        }
        for (const target of targets) {
          if (pages.has(target.id)) pages.get(target.id).target = target;
          else pages.set(target.id, { target, session: null, state: 'discovered', failures: 0, retryAt: 0, owned: false, injections: 0, report: null });
        }
        discoveryFailures = 0; nextDiscovery = now() + 2000; phase = targets.length ? 'running' : 'waiting-for-page';
      } catch {
        discoveryFailures++;
        nextDiscovery = now() + Math.min(10000, 500 * 2 ** Math.min(discoveryFailures, 5));
        if (phase !== 'waiting-for-endpoint') { phase = 'waiting-for-endpoint'; record('endpoint-disconnected'); }
      }
    }
    for (const page of pages.values()) {
      if (stopped || signal?.aborted) break;
      if (now() < page.retryAt) continue;
      try { await step(page); }
      catch {
        await closePage(page, false); page.report = null;
        page.failures++; page.retryAt = now() + Math.min(10000, 500 * 2 ** Math.min(page.failures - 1, 5));
        setState(page, 'reconnecting');
      }
    }
  }
  return {
    tick, inspect,
    async stop() {
      stopped = true; phase = 'stopping';
      const results = await Promise.all([...pages.values()].map(page => closePage(page, true)));
      cleanupPending = results.filter(Boolean).length;
      snapshots?.close(); phase = 'stopped'; record('stopped');
    },
  };
}
