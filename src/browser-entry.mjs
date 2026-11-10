import './statusbar.js';
import { connectPageAdapter } from './page-adapter.mjs';
import { createRuntimeModel } from './runtime-model.mjs';
import { createBridgeLease } from './bridge-lease.mjs';
import { VERSION, BUILD_ID } from './version.mjs';

(() => {
  const key = '__codexTokenStatusbarRuntime';
  if (window[key]) return;
  const ui = window.__codexTokenStatusbar;
  const model = createRuntimeModel();
  const bridge = createBridgeLease();
  let adapter = null;
  let interval = null;
  let removeMessages = null;
  let disposed = false;
  let phase = 'connecting';
  let connectingAdapter = false;
  let nextAdapterAttempt = 0;
  let focusedAt = document.hasFocus() ? Date.now() : 0;
  const onFocus = () => { focusedAt = Date.now(); };
  window.addEventListener('focus', onFocus);
  window.addEventListener('pointerdown', onFocus, true);
  window.addEventListener('keydown', onFocus, true);
  const visibleSnapshot = () => {
    const snapshot = model.snapshot();
    if (bridge.inspect().connected) return snapshot;
    return {
      ...snapshot, bridgeDisconnected: true, total: null, cost: null, cacheHitRate: null, speed: null, turnRate: null, ratePending: false, currentTurn: null, lastTurn: null, endToEndSpeed: null,
      scopeLabel: 'Reconnecting to local bridge',
      scopeKey: 'scope.reconnecting', noteKey: 'note.bridgeDisconnected',
      scopeNote: 'The local bridge is disconnected. Usage is paused until the verified connection recovers.',
    };
  };
  const poll = () => {
    if (disposed) return;
    ensureAdapter();
    if (adapter) phase = adapter.inspect().modulesReady ? 'observing' : 'adapter-unavailable';
    model.setIdentity(adapter?.readActiveIdentity());
    const snapshot = visibleSnapshot();
    if (phase === 'adapter-unavailable' && !snapshot.bridgeDisconnected) Object.assign(snapshot, {
      scopeKey: 'scope.unavailable', noteKey: 'note.adapterUnavailable', scopeLabel: 'Runtime adapter unavailable',
      scopeNote: 'The loaded modules or mounted application scope could not be verified for this client.',
    });
    ui.setSnapshot(snapshot);
    return snapshot;
  };
  window[key] = {
    version: VERSION, buildId: BUILD_ID,
    inspect() {
      const snapshot = poll() ?? visibleSnapshot();
      return { version: VERSION, buildId: BUILD_ID, phase, bridge: bridge.inspect(), ui: ui.inspect(), identity: snapshot.identity ?? null, hasUsage: !!snapshot.total,
        hasCost: !!snapshot.cost?.total?.amount, costComplete: snapshot.cost?.total?.complete === true, priceVersion: snapshot.cost?.priceVersion ?? null,
        desktop: { ...ui.desktopSnapshot(), focused: document.hasFocus(), focusedAt },
        diagnostics: snapshot.runtimeDiagnostics ?? null };
    },
    claimBridge(ownerId, leaseMs) { if (disposed) return false; const claimed = bridge.claim(ownerId, leaseMs); if (claimed) poll(); return claimed; },
    refreshBridge(ownerId) { if (disposed) return false; const renewed = bridge.renew(ownerId); if (renewed) poll(); return renewed; },
    setSettings(value, acknowledgedRequest, ownerId) {
      if (disposed || !bridge.accepts(ownerId)) return false;
      return ui.setSettings(value, acknowledgedRequest);
    },
    settingsError(requestId, ownerId) { if (!disposed && bridge.accepts(ownerId)) ui.settingsError(requestId); },
    setLogSnapshot(identity, snapshot, ownerId) {
      // 切换输入框后立即重新核对身份，拒绝上一次轮询尚在返回的旧对话日志。
      model.setIdentity(adapter?.readActiveIdentity());
      const current = model.snapshot().identity;
      if (disposed || !bridge.accepts(ownerId) || current?.status !== 'resolved' || current.threadId !== identity?.threadId || current.hostId !== identity?.hostId) return false;
      const accepted = model.setLogSnapshot(identity, snapshot);
      if (accepted) ui.setSnapshot(visibleSnapshot());
      return accepted;
    },
    dispose() {
      disposed = true; phase = 'disposed';
      clearInterval(interval); window.removeEventListener('focus', onFocus); window.removeEventListener('pointerdown', onFocus, true); window.removeEventListener('keydown', onFocus, true); removeMessages?.(); adapter?.dispose(); model.dispose(); ui.dispose(); delete window[key];
    },
  };
  function ensureAdapter() {
    if (adapter || connectingAdapter || Date.now() < nextAdapterAttempt) return;
    connectingAdapter = true; nextAdapterAttempt = Date.now() + 5000;
    connectPageAdapter().then(value => {
      if (disposed) { value.dispose(); return; }
      try { removeMessages = value.subscribeMessages(message => { model.consume(message); }); }
      catch (error) { value.dispose(); throw error; }
      adapter = value; phase = 'observing'; poll();
    }).catch(() => { if (!disposed) { phase = 'adapter-unavailable'; poll(); } })
      .finally(() => { connectingAdapter = false; });
  }
  interval = setInterval(poll, 500);
  poll();
})();
