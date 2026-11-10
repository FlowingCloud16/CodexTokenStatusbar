(() => {
  const KEY = '__codexTokenStatusbar';
  if (window[KEY]) return;
  // 只跟随 Codex 页面的界面语言；系统和浏览器语言可能与客户端设置不同。
  const readLanguage = () => /^zh(?:[-_]|$)/i.test(document.documentElement.lang.trim()) ? 'zh' : 'en';
  let language = readLanguage();
  const messages = {
    en: {
      speed: 'Speed ', sampled: 'Sample avg ', completed: 'Turn avg ', tokens: 'Tokens ', cache: 'Cache ', bridge: 'Bridge ', reconnecting: 'Reconnecting…',
      waitingSample: 'Waiting…', waitingSampleTitle: 'Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample.',
      'note.waitingSample': 'Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample.',
      statistics: 'Token statistics', usageDetails: 'Token usage details',
      settingsTab: 'Settings', layoutLabel: 'Status bar layout',
      layoutAdaptive: 'Model-first adaptive', layoutSeparate: 'Separate statistics row', layoutIcon: 'Single icon',
      layoutAdaptiveNote: 'Keeps space for native controls. Prioritizes speed and cache; adds cost, then token usage as space allows.',
      layoutSeparateNote: 'Shows all four metrics on their own row. The composer becomes one row taller.',
      layoutIconNote: 'One compact statistics button. Open it to see usage, speed, cache and cost.',
      settingsScope: 'Applies to all chats. Saved automatically by the loader.', settingsSaving: 'Saving…', settingsSaved: 'Saved', settingsError: 'Could not save. Retrying when the loader connects.',
      'scope.current': 'Current conversation', 'scope.waiting': 'Waiting for current conversation',
      'scope.reconnecting': 'Reconnecting to local bridge', 'scope.unavailable': 'Runtime adapter unavailable',
      'scope.pinned': 'Pinned conversation (probe)', 'scope.unverified': 'Active conversation not verified',
      input: 'Input', cachedInput: 'Cached input (included)', output: 'Output', reasoning: 'Reasoning (included)', total: 'Total',
      currentTurn: 'Current turn', latestTurn: 'Latest completed turn', responses: 'Observed responses', elapsed: 'Elapsed time', duration: 'Turn duration',
      generationSpeed: 'Generation speed', sampledAverage: 'Sampled turn average', completedAverage: 'Estimated turn average',
      sampleAge: 'Usage sample age', lastThroughput: 'Last turn throughput', seconds: '{value} s', ago: '{value} s ago',
      sampledTitle: 'Sampled turn average: output tokens including reasoning / time up to the same usage sample, including waiting and tools. Updated {age}; waiting for the next official usage update.',
      completedTitle: 'Estimated turn average: output tokens including reasoning / final turn duration including waiting and tools.',
      disconnectedTitle: 'Local bridge disconnected. Usage is paused until the connection recovers.',
      rateSampled: 'sampled turn average', rateCompleted: 'estimated turn average', rateGeneration: 'generation speed', updated: ', updated {age}',
      accessible: 'Token statistics: {rate} {value}{updated}; {total} total tokens; cache {cache}. Show usage details.',
      'note.sampled': 'Sample avg is estimated: official turn output tokens (including reasoning) divided by turn time up to the same usage sample, including waiting and tools. The value holds until usage changes; sample age is shown below. Completion uses the final turn duration. Generation speed is unverified.',
      'note.completed': 'Turn avg is estimated: official turn output tokens (including reasoning) divided by the final turn duration, including waiting and tools. This completed average does not change with the clock. Generation speed is unverified.',
      'note.usageWaitingTiming': 'Usage follows the verified conversation identity. Generation speed is awaiting verified token timing. Runtime-only turn totals may cover observed responses only.',
      'note.waitingUsage': 'Conversation identified. Waiting for an official usage update or a matching local rollout.',
      'note.identityUnresolved': 'Conversation identity is not available ({status}).',
      'note.bridgeDisconnected': 'The local bridge is disconnected. Usage is paused until the verified connection recovers.',
      'note.adapterUnavailable': 'The loaded modules or mounted application scope could not be verified for this client.',
      'note.estimatedSpeed': 'Estimated speed. See the runtime adapter for coverage and method.',
      'note.default': 'Generation speed needs verified timing. End-to-end throughput includes waiting and tool execution. Cached input and reasoning are already included in totals.',
      'note.pinned': 'Pinned probe data. Matching to the active conversation has not been verified. Generation speed is unavailable.',
      'note.unverified': 'Waiting for a verified mapping between the active UI conversation and the rollout thread. No usage is attributed yet.',
    },
    zh: {
      speed: '速度 ', sampled: '采样均速 ', completed: '整轮均速 ', tokens: '用量 ', cache: '缓存 ', bridge: '连接 ', reconnecting: '正在重连…',
      waitingSample: '等待采样', waitingSampleTitle: '正在等待本轮完整用量及匹配的采样时间，压缩对话或首次响应可能使采样延后。',
      'note.waitingSample': '正在等待本轮完整用量及匹配的采样时间，压缩对话或首次响应可能使采样延后。',
      statistics: 'Token 统计', usageDetails: 'Token 用量详情',
      settingsTab: '设置', layoutLabel: '状态栏布局',
      layoutAdaptive: '模型优先自适应', layoutSeparate: '统计独立一行', layoutIcon: '单图标入口',
      layoutAdaptiveNote: '优先为原生控件留空间，先显示速度与缓存，再随剩余宽度加入费用、用量。',
      layoutSeparateNote: '四项指标放在独立一行，输入框会增加一行高度。',
      layoutIconNote: '只保留一个统计按钮，展开后查看用量、速度、缓存与费用。',
      settingsScope: '应用于所有对话，由加载器自动保存。', settingsSaving: '正在保存…', settingsSaved: '已保存', settingsError: '暂时无法保存，加载器连接后会重试。',
      'scope.current': '当前对话', 'scope.waiting': '等待识别当前对话',
      'scope.reconnecting': '正在重新连接本地助手', 'scope.unavailable': '运行时适配器不可用',
      'scope.pinned': '固定对话（探针）', 'scope.unverified': '尚未确认当前对话',
      input: '输入', cachedInput: '缓存输入（已包含）', output: '输出', reasoning: '推理输出（已包含）', total: '总计',
      currentTurn: '当前轮次', latestTurn: '最近已完成轮次', responses: '已观测响应数', elapsed: '已用时间', duration: '整轮耗时',
      generationSpeed: '生成速度', sampledAverage: '采样平均速度', completedAverage: '估算整轮均速',
      sampleAge: '距上次采样', lastThroughput: '上一轮吞吐', seconds: '{value} 秒', ago: '{value} 秒前',
      sampledTitle: '采样平均速度：本轮输出 token（含推理）除以轮次开始至同一次用量采样的时间，包含等待和工具执行。更新于 {age}，正在等待下一次官方用量记录。',
      completedTitle: '估算整轮均速：本轮输出 token（含推理）除以最终整轮耗时，包含等待和工具执行。',
      disconnectedTitle: '本地助手连接已断开，恢复连接后继续更新用量。',
      rateSampled: '采样平均速度', rateCompleted: '估算整轮均速', rateGeneration: '生成速度', updated: '，更新于 {age}',
      accessible: 'Token 统计：{rate} {value}{updated}；累计 {total} token；缓存命中率 {cache}。展开用量详情。',
      'note.sampled': '采样均速为估算值：本轮官方输出 token（含推理）除以轮次开始至同一次用量采样的时间，包含等待和工具执行。没有新用量时保留上次结果，并显示距上次采样的时间。完成后采用最终整轮耗时。生成阶段计时尚未确认。',
      'note.completed': '整轮均速为估算值：本轮官方输出 token（含推理）除以最终整轮耗时，包含等待和工具执行。完成后结果保持固定。生成阶段计时尚未确认。',
      'note.usageWaitingTiming': '用量跟随已确认的当前对话。生成速度仍等待可靠的 token 计时；仅依赖运行时通知的轮次用量可能只覆盖已观测响应。',
      'note.waitingUsage': '已识别当前对话，正在等待官方用量更新或匹配的本地会话日志。',
      'note.identityUnresolved': '暂时无法确认当前对话，确认后再显示用量。',
      'note.bridgeDisconnected': '本地助手连接已断开，连接恢复并通过核验后继续更新用量。',
      'note.adapterUnavailable': '无法核验此客户端已加载的模块或当前应用状态。',
      'note.estimatedSpeed': '当前速度为估算值，覆盖范围与计算方式见运行时适配器说明。',
      'note.default': '生成速度需要可靠的生成阶段计时。整轮吞吐包含等待和工具执行；缓存输入与推理输出已包含在用量总计中。',
      'note.pinned': '当前显示探针固定对话的数据，尚未确认其与当前页面对话的对应关系。生成速度不可用。',
      'note.unverified': '正在等待确认当前页面与会话日志的对应关系，暂不归属任何用量。',
    },
  };
  Object.assign(messages.en, {
    cost: 'Cost ', costTab: 'Cost', usageTab: 'Usage', costScope: 'Conversation · API estimate', costDetails: 'API cost details',
    costInput: 'Uncached input', costRead: 'Cache reads', costWrite: 'Cache writes', costOutput: 'Output incl. reasoning',
    costLatest: 'Latest completed turn', costCurrent: 'Current turn', costCoverage: 'Priced responses (observed)',
    costRates: 'Rates and assumptions', costVersion: 'Built-in rates · {date} · USD / 1M tokens',
    costSource: 'Official API pricing', costWaiting: 'Waiting for verified response usage and model information.',
    costDisclaimer: 'Estimated at the dated API rates, not a subscription charge or invoice. Excludes tool fees, tax, regional premiums and contract discounts.',
    costAccessible: 'API cost estimate: {amount}.', costPartial: 'Known subtotal plus unpriced usage.',
    cost30: 'Cache writes · 30 minutes', cost12: 'Cache writes · 12 hours', costMissingRates: 'No verified model rates available.',
    'cost.tier.standard': 'Standard', 'cost.tier.fast': 'Fast', 'cost.tier.flex': 'Flex', 'cost.tier.batch': 'Batch', 'cost.tier.ultrafast': 'Ultrafast',
    'cost.context.short': '≤272K input/request', 'cost.context.long': '>272K input/request', 'cost.context.flat': 'Published flat rate',
    'cost.reason.tier-standard-assumed': 'Standard pricing basis; actual tier unverified.',
    'cost.reason.write-ttl-unknown': 'Write lifetime unknown; the range covers 30-minute to 12-hour write rates.',
    'cost.reason.model-unpriced': 'Model price not listed',
    'cost.reason.model-unknown': 'Model context missing',
    'cost.reason.provider-unknown': 'Provider not verified',
    'cost.reason.custom-provider': 'Custom provider price not available',
    'cost.reason.usage-incomplete': 'Required usage fields missing',
    'cost.reason.usage-invalid': 'Inconsistent usage fields',
    'cost.reason.write-details-invalid': 'Write lifetime totals inconsistent',
    'cost.reason.tier-unpriced': 'Tier price not listed',
    'cost.reason.context-unpriced': 'Context-length price not listed',
    'cost.reason.component-unpriced': 'Usage component has no published rate',
    'cost.reason.response-id-missing': 'Stable response ID missing',
    'cost.reason.response-conflict': 'Response attribution conflicts',
    'cost.reason.history-incomplete': 'Observed usage does not reconcile to the official total',
    'cost.reason.total-unverified': 'Official cumulative usage not available',
    'cost.reason.counter-reset': 'Cumulative counters reset; historical coverage unverified',
    'cost.reason.inherited-history': 'Inherited history coverage unverified',
    'cost.reason.runtime-gap': 'New usage is awaiting matching response records',
  });
  Object.assign(messages.zh, {
    cost: '费用 ', costTab: '费用', usageTab: '用量', costScope: '当前对话 · API 估算', costDetails: 'API 费用详情',
    costInput: '普通输入', costRead: '缓存读取', costWrite: '缓存写入', costOutput: '输出（含推理）',
    costLatest: '最近已完成轮次', costCurrent: '当前轮次', costCoverage: '已观测响应计价数',
    costRates: '单价与计算口径', costVersion: '内置价 · {date} · 美元／百万 token',
    costSource: '官方 API 价格', costWaiting: '正在等待可核验的逐响应用量和模型信息。',
    costDisclaimer: '按标明日期的 API 价折算，不代表订阅扣款或真实账单。不含工具附加费用、税费、地区附加费及合同折扣。',
    costAccessible: 'API 估算费用：{amount}。', costPartial: '显示已计价小计，另有未计价用量。',
    cost30: '缓存写入 · 30 分钟', cost12: '缓存写入 · 12 小时', costMissingRates: '暂无可核验的模型单价。',
    'cost.tier.standard': 'Standard', 'cost.tier.fast': 'Fast', 'cost.tier.flex': 'Flex', 'cost.tier.batch': 'Batch', 'cost.tier.ultrafast': 'Ultrafast',
    'cost.context.short': '单次输入 ≤272K', 'cost.context.long': '单次输入 >272K', 'cost.context.flat': '公开固定单价',
    'cost.reason.tier-standard-assumed': '按 Standard 估算，实际价格档位尚未确认。',
    'cost.reason.write-ttl-unknown': '缓存写入期限未确认，显示 30 分钟至 12 小时费率范围。',
    'cost.reason.model-unpriced': '模型单价未收录',
    'cost.reason.model-unknown': '缺少模型上下文',
    'cost.reason.provider-unknown': '尚未确认提供商',
    'cost.reason.custom-provider': '自定义提供商单价未知',
    'cost.reason.usage-incomplete': '缺少必要用量字段',
    'cost.reason.usage-invalid': '用量字段不一致',
    'cost.reason.write-details-invalid': '缓存写入期限拆分不一致',
    'cost.reason.tier-unpriced': '该价格档位未收录',
    'cost.reason.context-unpriced': '该上下文长度价格未收录',
    'cost.reason.component-unpriced': '部分用量没有公开单价',
    'cost.reason.response-id-missing': '缺少稳定的响应标识',
    'cost.reason.response-conflict': '响应归属存在冲突',
    'cost.reason.history-incomplete': '已观测用量与官方累计未对齐，历史覆盖不足',
    'cost.reason.total-unverified': '尚未取得官方累计用量',
    'cost.reason.counter-reset': '累计计数已重置，历史覆盖尚未核验',
    'cost.reason.inherited-history': '继承历史的覆盖范围尚未核验',
    'cost.reason.runtime-gap': '新增用量正在等待对应的响应记录',
  });
  const text = (key, params = {}) => (messages[language][key] ?? messages.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  const host = document.createElement('span');
  host.id = 'codex-token-statusbar';
  host.style.cssText = 'display:inline-flex;position:relative;align-items:center;margin-inline-start:auto;min-width:0;max-width:100%;flex-shrink:1;grid-column:2;grid-row:2;justify-self:end;color:inherit';
  const shadow = host.attachShadow({ mode: 'open' });
  // 闪电与叠页勾选图标取自 Lucide 0.468.0，ISC 许可证随 EXE 附带。
  shadow.innerHTML = `<style>
    :host {font-family:inherit;font-size:var(--text-button-composer,var(--text-sm,13px));font-weight:inherit;line-height:var(--line-height-button-composer,18px);color:var(--color-text-tertiary,light-dark(#6e6e6e,#a8a8a8));-webkit-app-region:no-drag}
    * {box-sizing:border-box}
    button {font:inherit;color:inherit;cursor:var(--cursor-interaction,pointer);background:transparent;border:1px solid transparent;border-radius:9999px;padding:0 8px;height:var(--height-button-composer,28px);min-width:0;max-width:100%;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:8px;user-select:none;transition:background-color 100ms ease}
    button:hover,button[aria-expanded="true"] {background:var(--color-background-primary-ghost-hover,color-mix(in srgb,currentColor 8%,transparent))}
    button:focus-visible {outline:2px solid var(--color-ring,currentColor);outline-offset:0}
    .metric {display:inline-flex;align-items:center;gap:5px;min-width:0;flex-shrink:0}
    .label {font-size:inherit}.value {font-variant-numeric:tabular-nums}.sep {color:var(--color-border-strong,color-mix(in srgb,currentColor 25%,transparent));font-size:10px}
    svg {width:14px;height:14px;flex:none;stroke:currentColor;stroke-width:1.6;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .metric-icon {display:none}.chevron {width:12px;height:12px;margin-left:-2px;opacity:.65;transition:transform 100ms ease}button[aria-expanded="true"] .chevron {transform:rotate(180deg)}
    section {position:fixed;inset:auto;margin:0;width:min(320px,calc(100vw - 24px));max-width:calc(100vw - 24px);overflow:auto;overscroll-behavior:contain;padding:14px 16px;border:0;border-radius:var(--popover-radius,12px);background:var(--menu-background-color,light-dark(#fff,#2d2d2d));color:var(--color-text-primary,light-dark(#1f1f1f,#f5f5f5));box-shadow:var(--menu-box-shadow,0 0 0 .5px #8883,0 8px 24px #0002);font:inherit;font-size:var(--menu-font-size,13px);line-height:20px;scrollbar-width:thin}
    section[hidden] {display:none}h3 {font:inherit;font-size:12px;font-weight:var(--text-control-label--font-weight,510);color:var(--color-text-secondary,light-dark(#686868,#b2b2b2));margin:0 0 8px}dl {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 20px;margin:0}dt {color:var(--color-text-secondary,light-dark(#686868,#b2b2b2))}dd {margin:0;font-variant-numeric:tabular-nums;text-align:right}hr {border:0;border-top:1px solid var(--menu-separator-background-color,light-dark(#ededed,#414141));margin:12px 0}.note {color:var(--color-text-tertiary,light-dark(#737373,#a8a8a8));font-size:11px;line-height:16px;margin:12px 0 0}
    :host([data-compact]) .label {display:none}:host([data-compact]) .metric-icon {display:block}:host([data-compact]) button {gap:7px;padding-inline:6px}
    :host([data-hide-total]) .metric[data-metric="total"],:host([data-hide-total]) .total-sep {display:none}
    :host([data-hide-cost]) .metric[data-metric="cost"],:host([data-hide-cost]) .cost-sep {display:none}
    :host([data-hide-chevron]) .chevron {display:none}
    :host([data-compact]) .sep {display:none}
    .statistics-icon {display:none}
    :host([data-icon]) [data-action="toggle"] {width:var(--height-button-composer,28px);padding:0;flex:none}
    :host([data-icon]) [data-action="toggle"]>.metric,:host([data-icon]) [data-action="toggle"]>.sep,:host([data-icon]) .chevron {display:none}
    :host([data-icon]) .statistics-icon {display:block}
    :host([data-layout="separate"]) [data-action="toggle"] {height:auto;min-height:var(--height-button-composer,28px);flex-wrap:wrap;justify-content:flex-end;row-gap:4px}
    :host([data-layout="separate"]) .metric {white-space:nowrap}
    .settings-label {display:block;margin:4px 0 8px}
    .settings-options {display:grid;gap:3px}
    .settings-options button {width:100%;height:auto;min-height:32px;border-radius:7px;padding:6px 8px;justify-content:flex-start;text-align:start;white-space:normal}
    .settings-options button[aria-checked="true"] {background:var(--color-background-primary-ghost-hover,color-mix(in srgb,currentColor 8%,transparent))}
    .choice-dot {opacity:0}.settings-options [aria-checked="true"] .choice-dot {opacity:1}
    .settings-status {min-height:16px}
    .metric[data-metric="cost"] .value {min-width:0}
    [hidden] {display:none!important}
    .tabs {position:relative;display:flex;gap:4px;margin-bottom:12px;width:max-content}
    .tabs button {position:relative;border-radius:7px;padding:0 10px}
    .tabs button[aria-selected="true"] {background:transparent}
    .tab-indicator {position:absolute;left:0;top:0;height:100%;border-radius:7px;background:var(--color-background-primary-ghost-hover,color-mix(in srgb,currentColor 8%,transparent));pointer-events:none}
    .tab-viewport {position:relative;overflow:hidden}
    [role="tabpanel"],.rates {display:flow-root}
    .cost-amount {margin:2px 0 10px;font-size:22px;line-height:28px;font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .cost-subtitle {margin:4px 0;color:var(--color-text-secondary,light-dark(#686868,#b2b2b2));font-size:12px}
    .cost-reasons {margin:10px 0 0;padding-left:16px;font-size:11px;line-height:17px;color:var(--color-text-tertiary,light-dark(#737373,#a8a8a8))}
    .cost-reasons li {margin:3px 0}
    details {margin-top:12px}summary {display:flex;align-items:center;gap:5px;list-style:none;cursor:var(--cursor-interaction,pointer);color:var(--color-text-secondary,light-dark(#686868,#b2b2b2))}
    summary::-webkit-details-marker {display:none}
    .rates-chevron {width:12px;height:12px;transform-origin:center}
    .rates-clip {overflow:hidden}
    h4 {font:inherit;font-size:11px;line-height:16px;margin:12px 0 6px;overflow-wrap:anywhere}
    .rates dl {font-size:11px;gap:2px 10px}.rates dd {max-width:130px;overflow-wrap:anywhere}
    .cost-breakdown dd {max-width:170px;overflow-wrap:anywhere}.cost-source {color:inherit;text-underline-offset:2px}
    @media(prefers-reduced-motion:reduce) {button,.chevron {transition:none}}
  </style>
  <button type="button" data-action="toggle" aria-label="Token statistics" aria-expanded="false" aria-controls="cts-panel">
    <svg class="statistics-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3v18h18M8 16v-4m5 4V7m5 9V4"/></svg>
    <span class="metric" data-metric="speed"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" style="stroke-width:2.4"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg><span class="label" data-label="speed">Speed </span><span class="value" data-value="speed">--</span></span><span class="sep total-sep" aria-hidden="true">·</span>
    <span class="metric" data-metric="total"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="m8 2 5.5 3-5.5 3L2.5 5 8 2Zm-5.5 6L8 11l5.5-3M2.5 11l5.5 3 5.5-3"/></svg><span class="label" data-label="tokens">Tokens </span><span class="value" data-value="total">--</span></span><span class="sep cache-sep" aria-hidden="true">·</span>
    <span class="metric" data-metric="cache"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" style="stroke-width:2.4"><path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="label" data-label="cache">Cache </span><span class="value" data-value="cache">--</span></span>
    <span class="sep cost-sep" aria-hidden="true">·</span>
    <span class="metric" data-metric="cost"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" style="stroke-width:2.4"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span class="label" data-label="cost">Cost </span><span class="value" data-value="cost">--</span></span>
    <svg class="chevron" aria-hidden="true" viewBox="0 0 16 16"><path d="m5 9 3-3 3 3"/></svg>
  </button>
  <section id="cts-panel" role="region" aria-label="Token usage details" popover="manual" hidden>
    <div class="tabs" role="tablist" aria-label="Token statistics">
      <span class="tab-indicator" aria-hidden="true"></span>
      <button id="cts-usage-tab" type="button" role="tab" data-tab="usage" aria-selected="true" aria-controls="cts-usage-page">Usage</button>
      <button id="cts-cost-tab" type="button" role="tab" data-tab="cost" aria-selected="false" aria-controls="cts-cost-page">Cost</button>
      <button id="cts-settings-tab" type="button" role="tab" data-tab="settings" aria-selected="false" aria-controls="cts-settings-page">Settings</button>
    </div>
    <div class="tab-viewport"><div id="cts-usage-page" role="tabpanel" aria-labelledby="cts-usage-tab">
    <h3 data-heading="scope">Current conversation</h3><dl data-detail="total"></dl>
    <hr><h3 data-heading="turn">Latest turn</h3><dl data-detail="turn"></dl>
    <hr><dl data-detail="speed"></dl><p class="note" data-detail="note"></p>
    </div>
    <div id="cts-cost-page" role="tabpanel" aria-labelledby="cts-cost-tab" hidden>
      <h3 data-heading="cost-scope"></h3><p class="cost-amount" data-cost="amount"></p>
      <p class="cost-subtitle" data-cost="version"></p>
      <dl class="cost-breakdown" data-detail="cost-turn"></dl><hr>
      <dl class="cost-breakdown" data-detail="cost-components"></dl>
      <p class="note" data-cost="coverage"></p><ul class="cost-reasons" data-cost="reasons"></ul>
      <details><summary aria-expanded="false"><svg class="rates-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg><span data-cost="rates-title"></span></summary><div class="rates-clip" inert><div class="rates" data-cost="rates"></div></div></details>
      <p class="note" data-cost="disclaimer"></p><p class="note"><a class="cost-source" href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer" data-cost="source"></a></p>
    </div>
    <div id="cts-settings-page" role="tabpanel" aria-labelledby="cts-settings-tab" hidden>
      <div id="cts-layout-label" class="settings-label" data-settings="label"></div>
      <div class="settings-options" role="radiogroup" aria-labelledby="cts-layout-label" data-settings="layout">
        <button type="button" role="radio" data-layout-option="adaptive"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7"/><circle class="choice-dot" cx="10" cy="10" r="3" fill="currentColor" stroke="none"/></svg><span></span></button>
        <button type="button" role="radio" data-layout-option="separate"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7"/><circle class="choice-dot" cx="10" cy="10" r="3" fill="currentColor" stroke="none"/></svg><span></span></button>
        <button type="button" role="radio" data-layout-option="icon"><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7"/><circle class="choice-dot" cx="10" cy="10" r="3" fill="currentColor" stroke="none"/></svg><span></span></button>
      </div>
      <p class="note" data-settings="description"></p><p class="note" data-settings="scope"></p>
      <p class="note settings-status" role="status" data-settings="status"></p>
    </div></div>
  </section>`;
  let snapshot = {};
  let mountCount = 0;
  let disposed = false;
  let observedFooter = null;
  let activeTab = 'usage';
  let previousCostKey = null;
  let layout = 'adaptive';
  let layoutRequest = null;
  let settingsStatus = '';
  let requestSerial = 0;
  let availableWidth = null;
  let presentation = 'full';
  let footerWrap = null;
  const button = shadow.querySelector('button');
  const panel = shadow.querySelector('section');
  const viewport = shadow.querySelector('.tab-viewport');
  const pages = [...shadow.querySelectorAll('[role="tabpanel"]')];
  const tabs = [...shadow.querySelectorAll('[data-tab]')];
  const indicator = shadow.querySelector('.tab-indicator');
  const layoutOptions = [...shadow.querySelectorAll('[data-layout-option]')];
  const ratesDetails = shadow.querySelector('details');
  const ratesSummary = ratesDetails.querySelector('summary');
  const ratesClip = shadow.querySelector('.rates-clip');
  const ratesContent = shadow.querySelector('.rates');
  const ratesChevron = shadow.querySelector('.rates-chevron');
  const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
  const motion = new Map();
  const easing = 'cubic-bezier(.2,.8,.2,1)';
  let panelOpen = false;
  let ratesOpen = false;
  let placeAbove = true;
  let tabHeightTarget = null;
  let ratesHeightTarget = null;
  let indicatorTarget = '';
  function cancelMotion(name) { const job = motion.get(name); motion.delete(name); job?.cancel(); }
  function play(name, element, frames, duration, complete = () => {}) {
    cancelMotion(name);
    if (reducedMotion.matches || typeof element.animate !== 'function') { complete(); return; }
    const job = element.animate(frames, { duration, easing, fill: 'both' });
    motion.set(name, job);
    job.finished.then(() => {
      if (motion.get(name) !== job) return;
      motion.delete(name); complete(); job.cancel();
    }).catch(() => {});
  }
  function syncIndicator(animate = false) {
    if (panel.hidden) return;
    const selected = tabs.find(item => item.dataset.tab === activeTab);
    const target = { transform: `translateX(${selected.offsetLeft}px)`, width: `${selected.offsetWidth}px` };
    const key = JSON.stringify(target);
    if (key === indicatorTarget) return;
    const before = { transform: getComputedStyle(indicator).transform, width: getComputedStyle(indicator).width };
    indicatorTarget = key; cancelMotion('indicator'); Object.assign(indicator.style, target);
    if (animate) play('indicator', indicator, [before, target], 190);
  }
  function settleTabs() {
    for (const name of ['tab-in', 'tab-out', 'tab-height']) cancelMotion(name);
    tabHeightTarget = null; viewport.style.height = '';
    for (const page of pages) {
      page.hidden = page.id !== `cts-${activeTab}-page`; page.inert = page.hidden;
      page.style.position = ''; page.style.inset = '';
    }
  }
  function animateTabHeight(height, from = parseFloat(getComputedStyle(viewport).height) || 0) {
    tabHeightTarget = height;
    play('tab-height', viewport, [{ height: `${from}px` }, { height: `${height}px` }], 190, () => {
      viewport.style.height = ''; tabHeightTarget = null;
    });
  }
  function animateRatesHeight(height, from = parseFloat(getComputedStyle(ratesClip).height) || 0) {
    ratesHeightTarget = height;
    play('rates-height', ratesClip, [{ height: `${from}px` }, { height: `${height}px` }], 210, () => {
      ratesDetails.open = ratesOpen; ratesClip.style.height = ''; ratesHeightTarget = null;
    });
  }
  function setRates(open, animate = true) {
    const from = ratesDetails.open ? parseFloat(getComputedStyle(ratesClip).height) || 0 : 0;
    const opacity = ratesDetails.open ? getComputedStyle(ratesContent).opacity : '0';
    const rotation = getComputedStyle(ratesChevron).transform;
    ratesOpen = open; ratesSummary.setAttribute('aria-expanded', String(open)); ratesClip.inert = !open;
    for (const name of ['rates-height', 'rates-text', 'rates-chevron']) cancelMotion(name);
    ratesHeightTarget = null;
    ratesChevron.style.transform = `rotate(${open ? 90 : 0}deg)`;
    if (!animate || !panelOpen || activeTab !== 'cost' || reducedMotion.matches) {
      ratesDetails.open = open; ratesClip.style.height = ''; return;
    }
    settleTabs(); ratesDetails.open = true;
    animateRatesHeight(open ? ratesContent.offsetHeight : 0, from);
    play('rates-text', ratesContent, [{ opacity }, { opacity: open ? 1 : 0 }], 210);
    play('rates-chevron', ratesChevron, [{ transform: rotation }, { transform: ratesChevron.style.transform }], 210);
  }
  const number = n => Number.isFinite(n) ? Math.trunc(n).toLocaleString('en-US') : '--';
  const compact = n => !Number.isFinite(n) ? '--' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : number(n);
  function detail(selector, rows) {
    const list = shadow.querySelector(selector);
    list.replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      list.append(dt, dd);
    }
  }
  function usageRows(usage) {
    return [
      [text('input'), number(usage?.input_tokens)], [text('cachedInput'), number(usage?.cached_input_tokens)],
      [text('costWrite'), number(usage?.cache_write_input_tokens)], [text('output'), number(usage?.output_tokens)], [text('reasoning'), number(usage?.reasoning_output_tokens)],
      [text('total'), number(usage?.total_tokens)],
    ];
  }
  function dollars(value, decimals = 4) {
    try {
      if (typeof value !== 'string' || !/^\d+$/.test(value)) return '--';
      const n = BigInt(value);
      if (decimals === 4 && n > 0n && n < 100000000n) return '< $0.0001';
      const scale = 10n ** BigInt(decimals);
      const unit = 1000000000000n / scale;
      const rounded = (n + unit / 2n) / unit;
      return '$' + (rounded / scale).toLocaleString('en-US') + '.' + (rounded % scale).toString().padStart(decimals, '0');
    } catch { return '--'; }
  }
  function costAmount(value, inline = false) {
    if (!value?.amount) return '--';
    const { minPicoUsd: min, maxPicoUsd: max } = value.amount;
    const lower = dollars(min, inline ? 2 : 4), upper = dollars(max, inline ? 2 : 4);
    const range = lower === upper ? lower : lower + '–' + upper;
    return (inline ? '' : '≈ ') + range;
  }
  function renderSettings() {
    const key = layout === 'separate' ? 'layoutSeparate' : layout === 'icon' ? 'layoutIcon' : 'layoutAdaptive';
    const update = (element, value) => { if (element.textContent !== value) element.textContent = value; };
    update(shadow.querySelector('[data-settings="label"]'), text('layoutLabel'));
    for (const option of layoutOptions) {
      update(option.querySelector('span'), text(option.dataset.layoutOption === 'separate' ? 'layoutSeparate' : option.dataset.layoutOption === 'icon' ? 'layoutIcon' : 'layoutAdaptive'));
      option.setAttribute('aria-checked', String(option.dataset.layoutOption === layout));
      option.tabIndex = option.dataset.layoutOption === layout ? 0 : -1;
    }
    update(shadow.querySelector('[data-settings="description"]'), text(key + 'Note'));
    update(shadow.querySelector('[data-settings="scope"]'), text('settingsScope'));
    update(shadow.querySelector('[data-settings="status"]'), settingsStatus ? text(settingsStatus) : '');
  }
  function applyLayout(value, requested = false) {
    if (!['adaptive', 'separate', 'icon'].includes(value)) return false;
    layout = value;
    if (requested) {
      layoutRequest = { id: `${Date.now()}-${++requestSerial}`, layout: value };
      settingsStatus = 'settingsSaving';
    }
    renderSettings(); syncLayout();
    if (!panel.hidden) { syncIndicator(); positionPanel(); }
    return true;
  }
  function setTab(tab, animate = true) {
    if (tab === activeTab) return;
    const outgoing = pages.find(page => page.id === `cts-${activeTab}-page`);
    const incoming = pages.find(page => page.id === `cts-${tab}-page`);
    const fromHeight = parseFloat(getComputedStyle(viewport).height) || 0;
    const opacity = getComputedStyle(outgoing).opacity;
    const transform = getComputedStyle(outgoing).transform;
    settleTabs(); setRates(ratesOpen, false);
    activeTab = tab;
    for (const item of tabs) item.setAttribute('aria-selected', String(item.dataset.tab === tab));
    syncIndicator(animate && panelOpen);
    if (!animate || !panelOpen || reducedMotion.matches) { settleTabs(); if (!panel.hidden) positionPanel(); return; }
    outgoing.hidden = false; outgoing.inert = true; outgoing.style.position = 'absolute'; outgoing.style.inset = '0';
    incoming.hidden = false; incoming.inert = false;
    const direction = tabs.findIndex(item => item.dataset.tab === tab) > tabs.findIndex(item => item.getAttribute('aria-controls') === outgoing.id) ? 1 : -1;
    animateTabHeight(incoming.offsetHeight, fromHeight);
    play('tab-out', outgoing, [{ opacity, transform }, { opacity: 0, transform: `translateX(${-7 * direction}px)` }], 124, () => { outgoing.hidden = true; });
    play('tab-in', incoming, [{ opacity: 0, transform: `translateX(${7 * direction}px)` }, { opacity: 1, transform: 'translateX(0)' }], 190, () => {
      cancelMotion('tab-out');
      for (const page of pages) {
        page.hidden = page !== incoming; page.inert = page.hidden; page.style.position = ''; page.style.inset = '';
      }
    });
    positionPanel();
  }
  function renderCost() {
    shadow.querySelector('[data-label="cost"]').textContent = text('cost');
    const cost = snapshot.cost;
    shadow.querySelector('[data-value="cost"]').textContent = costAmount(cost?.total, true);
    for (const tab of tabs) tab.textContent = text(tab.dataset.tab + 'Tab');
    shadow.querySelector('[role="tablist"]').setAttribute('aria-label', text('statistics'));
    const key = JSON.stringify([language, cost, !!snapshot.currentTurn]);
    if (previousCostKey === key) return;
    previousCostKey = key;
    shadow.querySelector('[data-heading="cost-scope"]').textContent = text('costScope');
    shadow.querySelector('[data-cost="amount"]').textContent = costAmount(cost?.total);
    shadow.querySelector('[data-cost="version"]').textContent = text('costVersion', { date: cost?.priceVersion ?? '--' });
    const turn = snapshot.currentTurn ? cost?.currentTurn : cost?.lastTurn;
    detail('[data-detail="cost-turn"]', [[text(snapshot.currentTurn ? 'costCurrent' : 'costLatest'), costAmount(turn)]]);
    const component = name => cost?.total?.components?.[name] ? costAmount({ amount: cost.total.components[name] }) : '--';
    detail('[data-detail="cost-components"]', [[text('costInput'), component('input')], [text('costRead'), component('cacheRead')], [text('costWrite'), component('cacheWrite')], [text('costOutput'), component('output')]]);
    shadow.querySelector('[data-cost="coverage"]').textContent = text('costCoverage') + ': ' + number(cost?.total?.pricedResponses) + ' / ' + number(cost?.total?.responseCount);
    const reasons = shadow.querySelector('[data-cost="reasons"]');
    reasons.replaceChildren();
    const notes = [
      ...(!cost?.total?.responseCount ? [text('costWaiting')] : []),
      ...(cost?.total?.amount && !cost.total.complete ? [text('costPartial')] : []),
      ...(cost?.total?.assumptions ?? []).map(reason => text('cost.reason.' + reason)),
      ...(cost?.total?.reasons ?? []).map(reason => text('cost.reason.' + reason.key) + (reason.count > 1 ? ' (' + number(reason.count) + ')' : '')),
    ];
    for (const value of notes) { const li = document.createElement('li'); li.textContent = value; reasons.append(li); }
    shadow.querySelector('[data-cost="rates-title"]').textContent = text('costRates');
    shadow.querySelector('[data-cost="disclaimer"]').textContent = text('costDisclaimer');
    shadow.querySelector('[data-cost="source"]').textContent = text('costSource');
    const rates = shadow.querySelector('[data-cost="rates"]');
    rates.replaceChildren();
    if (!cost?.total?.models?.length) rates.textContent = text('costMissingRates');
    for (const model of cost?.total?.models ?? []) {
      const heading = document.createElement('h4');
      heading.textContent = model.model + ' · ' + text('cost.tier.' + model.tier) + ' · ' + text('cost.context.' + model.context);
      const list = document.createElement('dl');
      for (const [label, name] of [['costInput','input'], ['costRead','cachedInput'], ['cost30','cacheWrite30m'], ['cost12','cacheWrite12h'], ['costOutput','output']]) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = text(label); dd.textContent = model.rates?.[name] != null ? '$' + model.rates[name] : '--';
        list.append(dt, dd);
      }
      rates.append(heading, list);
    }
  }
  function render() {
    const speed = snapshot.speed;
    const turnRate = snapshot.turnRate;
    const displayedRate = speed ?? turnRate;
    const ratePending = snapshot.ratePending === true && displayedRate?.value == null;
    const sampled = turnRate?.status === 'sampled';
    const sampleAge = Number.isFinite(turnRate?.sampleAgeMs) ? text('ago', { value: (turnRate.sampleAgeMs / 1000).toFixed(1) }) : '--';
    if (host.lang !== language) host.lang = language;
    panel.setAttribute('aria-label', text('usageDetails'));
    shadow.querySelector('[data-heading="scope"]').textContent = snapshot.scopeKey ? text(snapshot.scopeKey) : snapshot.scopeLabel ?? text('scope.current');
    shadow.querySelector('[data-label="tokens"]').textContent = text('tokens');
    shadow.querySelector('[data-label="cache"]').textContent = text('cache');
    shadow.querySelector('[data-label="speed"]').textContent = text(speed?.value != null || turnRate?.value == null ? 'speed' : sampled ? 'sampled' : 'completed');
    shadow.querySelector('[data-value="speed"]').textContent = displayedRate?.value != null ? `${displayedRate.value.toFixed(1)} t/s` : ratePending ? text('waitingSample') : '--';
    button.title = !speed && turnRate ? text(sampled ? 'sampledTitle' : 'completedTitle', { age: sampleAge }) : ratePending ? text('waitingSampleTitle') : text('statistics');
    if (snapshot.bridgeDisconnected) {
      shadow.querySelector('[data-label="speed"]').textContent = text('bridge');
      shadow.querySelector('[data-value="speed"]').textContent = text('reconnecting');
      button.title = text('disconnectedTitle');
    }
    shadow.querySelector('[data-value="total"]').textContent = compact(snapshot.total?.total_tokens);
    shadow.querySelector('[data-value="cache"]').textContent = Number.isFinite(snapshot.cacheHitRate) ? `${snapshot.cacheHitRate.toFixed(1)}%` : '--';
    button.setAttribute('aria-label', text('accessible', {
      rate: text(displayedRate?.estimated ? sampled ? 'rateSampled' : 'rateCompleted' : 'rateGeneration'),
      value: shadow.querySelector('[data-value="speed"]').textContent, updated: sampled ? text('updated', { age: sampleAge }) : '',
      total: number(snapshot.total?.total_tokens), cache: shadow.querySelector('[data-value="cache"]').textContent,
    }));
    renderCost();
    renderSettings();
    const costDescription = text('costAccessible', { amount: costAmount(snapshot.cost?.total) });
    button.setAttribute('aria-label', button.getAttribute('aria-label') + ' ' + costDescription);
    button.title += '\n' + costDescription + (snapshot.cost?.total?.complete === false && snapshot.cost.total.amount ? ' ' + text('costPartial') : '');
    detail('[data-detail="total"]', usageRows(snapshot.total));
    const turn = snapshot.currentTurn ?? snapshot.lastTurn;
    const turnDurationMs = turn?.durationMs ?? (turnRate?.turnId === turn?.id ? snapshot.currentTurn ? turnRate?.elapsedMs : turnRate?.durationMs : null);
    shadow.querySelector('[data-heading="turn"]').textContent = text(snapshot.currentTurn ? 'currentTurn' : 'latestTurn');
    detail('[data-detail="turn"]', [
      ...usageRows(turn?.usage), [text('responses'), number(turn?.responseCount)],
      [text(snapshot.currentTurn ? 'elapsed' : 'duration'), Number.isFinite(turnDurationMs) ? text('seconds', { value: (turnDurationMs / 1000).toFixed(2) }) : '--'],
    ]);
    detail('[data-detail="speed"]', [
      [text('generationSpeed'), speed?.value != null ? `${speed.value.toFixed(1)} t/s` : '--'],
      [text(sampled || ratePending ? 'sampledAverage' : 'completedAverage'), turnRate?.value != null ? `≈ ${turnRate.value.toFixed(1)} t/s` : ratePending ? text('waitingSample') : '--'],
      ...(sampled ? [[text('sampleAge'), sampleAge]] : []),
      [text('lastThroughput'), snapshot.endToEndSpeed?.value != null ? `${snapshot.endToEndSpeed.value.toFixed(1)} t/s` : '--'],
    ]);
    const fallbackNoteKey = turnRate && !speed ? sampled ? 'note.sampled' : 'note.completed'
      : snapshot.speed?.estimated ? 'note.estimatedSpeed' : 'note.default';
    shadow.querySelector('[data-detail="note"]').textContent = snapshot.noteKey ? text(snapshot.noteKey, snapshot.noteParams)
      : snapshot.scopeNote ?? text(fallbackNoteKey);
    syncLayout();
    if (!panel.hidden) { syncIndicator(); positionPanel(); }
  }
  function positionPanel() {
    const rect = host.getBoundingClientRect();
    const above = rect.top - 22;
    const below = window.innerHeight - rect.bottom - 22;
    placeAbove = above >= below;
    panel.style.maxHeight = `${Math.max(1, placeAbove ? above : below)}px`;
    // 用未缩放的布局宽度定位，并固定靠近输入框的一边，内容变高时向外展开。
    const width = panel.offsetWidth;
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    panel.style.left = `${left}px`;
    panel.style.top = placeAbove ? 'auto' : `${rect.bottom + 10}px`;
    panel.style.bottom = placeAbove ? `${window.innerHeight - rect.top + 10}px` : 'auto';
    panel.style.transformOrigin = `${Math.max(12, Math.min(width - 12, rect.right - left - 28))}px ${placeAbove ? 'bottom' : 'top'}`;
  }
  function setOpen(open, animate = true) {
    if (open === panelOpen && animate) return;
    const wasVisible = !panel.hidden;
    const before = wasVisible ? { opacity: getComputedStyle(panel).opacity, transform: getComputedStyle(panel).transform } : null;
    panelOpen = open;
    cancelMotion('menu');
    if (!open) {
      settleTabs(); setRates(ratesOpen, false); cancelMotion('indicator');
    }
    const finish = () => {
      panel.style.opacity = ''; panel.style.transform = '';
      if (!panelOpen) { if (panel.matches(':popover-open')) panel.hidePopover(); panel.hidden = true; }
    };
    panel.inert = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      // 顶层弹出框避免被客户端输入区的 overflow 和 transform 裁切。
      if (!panel.matches(':popover-open')) panel.showPopover();
      positionPanel(); syncIndicator();
    }
    if (!animate || reducedMotion.matches || (!open && !wasVisible)) { finish(); return; }
    const closed = { opacity: 0, transform: `translateY(${placeAbove ? 7 : -7}px) scale(.985)` };
    play('menu', panel, [before ?? closed, open ? { opacity: 1, transform: 'translateY(0) scale(1)' } : closed], open ? 200 : 150, finish);
  }
  button.addEventListener('click', event => {
    if (event.composedPath().some(element => element?.dataset?.metric === 'cost')) {
      if (activeTab === 'cost' && panelOpen) setOpen(false);
      else { setTab('cost', panelOpen); setOpen(true); }
    }
    else setOpen(!panelOpen);
  });
  for (const tab of shadow.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => setTab(tab.dataset.tab));
  // 直接在菜单内选择，避免依赖客户端未必支持的系统下拉弹窗。
  for (const option of layoutOptions) {
    option.addEventListener('click', () => applyLayout(option.dataset.layoutOption, true));
    option.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const index = layoutOptions.indexOf(option);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? layoutOptions.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + layoutOptions.length) % layoutOptions.length;
      applyLayout(layoutOptions[next].dataset.layoutOption, true); layoutOptions[next].focus(); event.preventDefault();
    });
  }
  // 菜单内的操作不交给输入框的聚焦和快捷键处理器。
  for (const type of ['pointerdown', 'mousedown', 'click']) panel.addEventListener(type, event => event.stopPropagation());
  panel.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  shadow.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const index = tabs.findIndex(tab => tab.dataset.tab === activeTab);
    const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].dataset.tab;
    setTab(next); shadow.querySelector('[data-tab="' + next + '"]').focus(); event.preventDefault();
  });
  const closeOutside = event => { if (!event.composedPath().includes(host)) setOpen(false); };
  ratesSummary.addEventListener('click', event => { event.preventDefault(); setRates(!ratesOpen); });
  const keydown = event => {
    if (event.key === 'Escape' && panelOpen) {
      if (shadow.activeElement) button.focus();
      setOpen(false);
    }
  };
  document.addEventListener('pointerdown', closeOutside);
  document.addEventListener('keydown', keydown);
  const reposition = () => { if (!panel.hidden) { syncIndicator(); positionPanel(); } };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  function releaseFooterWrap() {
    if (footerWrap && footerWrap.footer.style.flexWrap === 'wrap') footerWrap.footer.style.flexWrap = footerWrap.value;
    footerWrap = null;
  }
  function syncLayout() {
    if (!observedFooter) return;
    const footerStyle = getComputedStyle(observedFooter);
    const width = observedFooter.getBoundingClientRect().width;
    const grid = footerStyle.display.includes('grid');
    const style = (name, value) => { if (host.style[name] !== value) host.style[name] = value; };
    if (host.getAttribute('data-layout') !== layout) host.setAttribute('data-layout', layout);
    // 测量原生工具区，并为可能被原生响应式布局收起的模型按钮预留空间。
    const native = [...observedFooter.children].filter(element => {
      if (element === host || !element.getBoundingClientRect().width || !element.getBoundingClientRect().height) return false;
      const computed = getComputedStyle(element);
      return !grid || (computed.gridRowStart !== '1' && computed.gridColumnEnd !== '-1');
    });
    const nativeWidth = native.reduce((sum, element) => {
      // 工具区可能占满剩余列，测量实际控件而非伸展后的容器，避免收起后无法恢复。
      const controls = (element.matches('button,[role="button"],[role="combobox"]') ? [element] : [...element.querySelectorAll('button,[role="button"],[role="combobox"]')]).filter(control => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && control.checkVisibility?.({ checkVisibilityCSS: true }) !== false;
      });
      const gap = controls.length > 1 ? parseFloat(getComputedStyle(controls[0].parentElement).columnGap) || 5 : 0;
      const measured = controls.length ? controls.reduce((width, control) => width + Math.max(control.getBoundingClientRect().width, control.scrollWidth), 0) + gap * (controls.length - 1) : element.getBoundingClientRect().width;
      const reserveModel = grid && getComputedStyle(element).gridColumnStart === '3' && controls.length >= 2;
      return sum + Math.max(measured, reserveModel ? 280 : 0);
    }, 0);
    const padding = (parseFloat(footerStyle.paddingLeft) || 0) + (parseFloat(footerStyle.paddingRight) || 0);
    availableWidth = Math.max(0, Math.floor(width - padding - nativeWidth - (parseFloat(footerStyle.columnGap) || 0) * native.length - 12));
    const ownRow = layout === 'separate' || (layout !== 'separate' && availableWidth < 28);
    if (!grid && ownRow && !footerWrap) { footerWrap = { footer: observedFooter, value: observedFooter.style.flexWrap }; observedFooter.style.flexWrap = 'wrap'; }
    else if (!ownRow && footerWrap) releaseFooterWrap();
    style('gridColumn', ownRow ? '1 / -1' : '2'); style('gridRow', ownRow ? '3' : '2');
    style('flexBasis', ownRow && !grid ? '100%' : ''); style('width', ownRow ? '100%' : '');
    style('marginInlineStart', ownRow ? '0px' : 'auto'); style('marginTop', ownRow ? '4px' : '0px');
    style('justifyContent', 'flex-end');
    style('maxWidth', ownRow ? '100%' : `${Math.max(28, availableWidth)}px`);
    host.toggleAttribute('data-compact', width < 1000);
    for (const attribute of ['data-hide-total', 'data-hide-cost', 'data-hide-chevron', 'data-icon']) host.removeAttribute(attribute);
    // 逐项测量自身内容，优先保留速度与缓存；不能用视口断点直接跳过三项。
    const needsSpace = () => button.scrollWidth > button.clientWidth + 1;
    if (layout === 'adaptive' && needsSpace()) host.setAttribute('data-compact', '');
    if (layout === 'adaptive' && needsSpace()) host.setAttribute('data-hide-chevron', '');
    if (layout === 'adaptive' && needsSpace()) host.setAttribute('data-hide-total', '');
    if (layout === 'adaptive' && needsSpace()) host.setAttribute('data-hide-cost', '');
    if (layout === 'icon' || (layout === 'adaptive' && (needsSpace() || ownRow))) host.setAttribute('data-icon', '');
    presentation = host.hasAttribute('data-icon') ? 'icon' : host.hasAttribute('data-hide-cost') ? 'primary' : host.hasAttribute('data-hide-total') ? 'three' : 'full';
  }
  const resizeObserver = new ResizeObserver(() => { syncLayout(); reposition(); });
  const contentObserver = new ResizeObserver(() => {
    if (motion.has('rates-height') && ratesOpen) {
      const height = ratesContent.offsetHeight;
      if (Math.abs(height - ratesHeightTarget) > .5) animateRatesHeight(height);
    }
    if (motion.has('tab-height')) {
      const height = pages.find(page => page.id === `cts-${activeTab}-page`).offsetHeight;
      if (Math.abs(height - tabHeightTarget) > .5) animateTabHeight(height);
    }
  });
  for (const content of [...pages, ratesContent]) contentObserver.observe(content);
  const finishMotion = () => {
    for (const name of [...motion.keys()]) cancelMotion(name);
    settleTabs(); setRates(ratesOpen, false); setOpen(panelOpen, false); syncIndicator();
  };
  reducedMotion.addEventListener('change', finishMotion);
  function findActiveFooter() {
    // Codex 会保留隐藏对话的输入框，不能把第一个匹配项当作当前对话。
    return [...document.querySelectorAll('[data-composer-footer-responsive], .ComposerFooter-WlpjXt')].find(footer => {
      if (!footer.isConnected || footer.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      if (footer.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) === false) return false;
      const rect = footer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null;
  }
  function mount(footer = findActiveFooter()) {
    if (disposed) return;
    if (host.parentElement !== footer) {
      setOpen(false, false); setRates(false, false);
      releaseFooterWrap();
      resizeObserver.disconnect(); observedFooter = footer;
      if (footer) { footer.append(host); mountCount++; resizeObserver.observe(footer); for (const child of footer.children) if (child !== host) resizeObserver.observe(child); }
      else host.remove();
    }
    render();
  }
  const observer = new MutationObserver(() => {
    const nextLanguage = readLanguage();
    const languageChanged = nextLanguage !== language;
    language = nextLanguage;
    const footer = findActiveFooter();
    if (host.parentElement !== footer || (footer && !host.isConnected)) {
      // 新对话先显示未知值，等同一可见输入框的身份和统计通过核验后再更新。
      snapshot = {}; mount(footer);
    }
    else if (languageChanged) render();
    else { syncLayout(); for (const child of footer?.children ?? []) if (child !== host) resizeObserver.observe(child); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden', 'data-state', 'data-active', 'data-theme', 'lang'] });
  window[KEY] = {
    version: '0.6.1',
    setSettings(value, acknowledgedRequest = null) {
      if (layoutRequest && acknowledgedRequest !== layoutRequest.id) return false;
      if (!['adaptive', 'separate', 'icon'].includes(value?.layout)) return false;
      if (layoutRequest) { layoutRequest = null; settingsStatus = 'settingsSaved'; }
      return applyLayout(value.layout);
    },
    settingsError(requestId) { if (layoutRequest?.id === requestId) { settingsStatus = 'settingsError'; renderSettings(); } },
    setSnapshot(value) {
      const next = value ?? {};
      if (next.threadId !== snapshot.threadId || next.hostId !== snapshot.hostId || (next.bridgeDisconnected && !snapshot.bridgeDisconnected)) {
        setOpen(false, false); setRates(false, false);
      }
      snapshot = next; mount();
    },
    desktopSnapshot() {
      if (!host.isConnected || host.parentElement !== findActiveFooter()) return null;
      // 主窗口复用已渲染的统计与口径，避免再维护一套舍入、等待采样和费用算法。
      const read = selector => shadow.querySelector(selector)?.textContent ?? '';
      const rows = selector => [...shadow.querySelectorAll(selector + ' dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent ?? '--']);
      const color = getComputedStyle(button).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [238, 238, 238];
      return {
        theme: color.reduce((sum, value) => sum + value, 0) > 384 ? 'dark' : 'light',
        scope: read('[data-heading="scope"]'),
        values: Object.fromEntries(['speed', 'cache', 'total', 'cost'].map(key => [key, read(`[data-value="${key}"]`)])),
        speedNote: button.title.split('\n')[0], note: read('[data-detail="note"]'),
        usageRows: rows('[data-detail="total"]'), turnRows: rows('[data-detail="turn"]'),
        cost: {
          amount: read('[data-cost="amount"]'), scope: read('[data-heading="cost-scope"]'),
          version: read('[data-cost="version"]'), coverage: read('[data-cost="coverage"]'),
          rows: rows('[data-detail="cost-components"]'),
          notes: [...shadow.querySelectorAll('[data-cost="reasons"] li')].map(li => li.textContent),
          rates: [...shadow.querySelectorAll('[data-cost="rates"] h4')].map(heading => ({
            heading: heading.textContent, rows: [...heading.nextElementSibling.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]),
          })),
          disclaimer: read('[data-cost="disclaimer"]'),
        },
      };
    },
    inspect() { return { mounted: host.isConnected && host.parentElement === findActiveFooter(), mountCount, threadId: snapshot.threadId ?? null, language, version: this.version,
      layout, presentation, availableWidth, settingsChange: layoutRequest ? { ...layoutRequest } : null, settingsStatus,
      motion: { preset: 'native-gentle', open: panelOpen, tab: activeTab, ratesOpen, reduced: reducedMotion.matches, active: motion.size } }; },
    dispose() {
      disposed = true;
      releaseFooterWrap();
      observer.disconnect();
      resizeObserver.disconnect();
      contentObserver.disconnect();
      reducedMotion.removeEventListener('change', finishMotion);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      setOpen(false, false); setRates(false, false);
      for (const name of [...motion.keys()]) cancelMotion(name);
      host.remove();
      delete window[KEY];
    },
  };
  mount();
})();
