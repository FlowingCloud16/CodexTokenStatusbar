const p = globalThis.process;
const req = p.mainModule?.require?.bind(p.mainModule)
  ?? p.getBuiltinModule('module').createRequire(p.execPath);
const electron = req('electron');
const key = '__codexStatusbarNativePageProbe';
const state = { phase: 'pending', pages: [] };
globalThis[key] = state;
// 使用主进程已有接口读取页面能力，结果只包含布尔值，不读取聊天内容。
setImmediate(async () => {
  try {
    const windows = electron.BrowserWindow.getAllWindows();
    for (const window of windows) {
      const contents = window.webContents;
      const page = { windowId: window.id, contentsId: contents?.id,
        canExecute: typeof contents?.executeJavaScript === 'function' };
      if (page.canExecute) {
        try {
          page.result = await contents.executeJavaScript(`({
            isCodex: window.codexWindowType === 'electron' && window.electronBridge?.windowType === 'electron',
            hasComposer: !!document.querySelector('[data-composer-footer-responsive], .ComposerFooter-WlpjXt'),
            hasStatusbar: !!window.__codexTokenStatusbarRuntime,
            value: 6 * 7
          })`);
        } catch (error) { page.error = String(error); }
      }
      state.pages.push(page);
    }
    state.phase = 'done';
  } catch (error) { state.phase = 'error'; state.error = String(error); }
});
return { queued: true };
