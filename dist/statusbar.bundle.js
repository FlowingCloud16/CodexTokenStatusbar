(() => {
  // src/statusbar.js
  (() => {
    const KEY = "__codexTokenStatusbar";
    if (window[KEY]) return;
    const readLanguage = () => /^zh(?:[-_]|$)/i.test(document.documentElement.lang.trim()) ? "zh" : "en";
    let language = readLanguage();
    const messages = {
      en: {
        speed: "Speed ",
        sampled: "Sample avg ",
        completed: "Turn avg ",
        tokens: "Tokens ",
        cache: "Cache ",
        bridge: "Bridge ",
        reconnecting: "Reconnecting\u2026",
        waitingSample: "Waiting\u2026",
        waitingSampleTitle: "Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample.",
        "note.waitingSample": "Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample.",
        statistics: "Token statistics",
        usageDetails: "Token usage details",
        settingsTab: "Settings",
        layoutLabel: "Status bar layout",
        layoutAdaptive: "Model-first adaptive",
        layoutSeparate: "Separate statistics row",
        layoutIcon: "Single icon",
        layoutAdaptiveNote: "Keeps space for native controls. Prioritizes speed and cache; adds cost, then token usage as space allows.",
        layoutSeparateNote: "Shows all four metrics on their own row. The composer becomes one row taller.",
        layoutIconNote: "One compact statistics button. Open it to see usage, speed, cache and cost.",
        settingsScope: "Applies to all chats. Saved automatically by the loader.",
        settingsSaving: "Saving\u2026",
        settingsSaved: "Saved",
        settingsError: "Could not save. Retrying when the loader connects.",
        "scope.current": "Current conversation",
        "scope.waiting": "Waiting for current conversation",
        "scope.reconnecting": "Reconnecting to local bridge",
        "scope.unavailable": "Runtime adapter unavailable",
        "scope.pinned": "Pinned conversation (probe)",
        "scope.unverified": "Active conversation not verified",
        input: "Input",
        cachedInput: "Cached input (included)",
        output: "Output",
        reasoning: "Reasoning (included)",
        total: "Total",
        currentTurn: "Current turn",
        latestTurn: "Latest completed turn",
        responses: "Observed responses",
        elapsed: "Elapsed time",
        duration: "Turn duration",
        generationSpeed: "Generation speed",
        sampledAverage: "Sampled turn average",
        completedAverage: "Estimated turn average",
        sampleAge: "Usage sample age",
        lastThroughput: "Last turn throughput",
        seconds: "{value} s",
        ago: "{value} s ago",
        sampledTitle: "Sampled turn average: output tokens including reasoning / time up to the same usage sample, including waiting and tools. Updated {age}; waiting for the next official usage update.",
        completedTitle: "Estimated turn average: output tokens including reasoning / final turn duration including waiting and tools.",
        disconnectedTitle: "Local bridge disconnected. Usage is paused until the connection recovers.",
        rateSampled: "sampled turn average",
        rateCompleted: "estimated turn average",
        rateGeneration: "generation speed",
        updated: ", updated {age}",
        accessible: "Token statistics: {rate} {value}{updated}; {total} total tokens; cache {cache}. Show usage details.",
        "note.sampled": "Sample avg is estimated: official turn output tokens (including reasoning) divided by turn time up to the same usage sample, including waiting and tools. The value holds until usage changes; sample age is shown below. Completion uses the final turn duration. Generation speed is unverified.",
        "note.completed": "Turn avg is estimated: official turn output tokens (including reasoning) divided by the final turn duration, including waiting and tools. This completed average does not change with the clock. Generation speed is unverified.",
        "note.usageWaitingTiming": "Usage follows the verified conversation identity. Generation speed is awaiting verified token timing. Runtime-only turn totals may cover observed responses only.",
        "note.waitingUsage": "Conversation identified. Waiting for an official usage update or a matching local rollout.",
        "note.identityUnresolved": "Conversation identity is not available ({status}).",
        "note.bridgeDisconnected": "The local bridge is disconnected. Usage is paused until the verified connection recovers.",
        "note.adapterUnavailable": "The loaded modules or mounted application scope could not be verified for this client.",
        "note.estimatedSpeed": "Estimated speed. See the runtime adapter for coverage and method.",
        "note.default": "Generation speed needs verified timing. End-to-end throughput includes waiting and tool execution. Cached input and reasoning are already included in totals.",
        "note.pinned": "Pinned probe data. Matching to the active conversation has not been verified. Generation speed is unavailable.",
        "note.unverified": "Waiting for a verified mapping between the active UI conversation and the rollout thread. No usage is attributed yet."
      },
      zh: {
        speed: "\u901F\u5EA6 ",
        sampled: "\u91C7\u6837\u5747\u901F ",
        completed: "\u6574\u8F6E\u5747\u901F ",
        tokens: "\u7528\u91CF ",
        cache: "\u7F13\u5B58 ",
        bridge: "\u8FDE\u63A5 ",
        reconnecting: "\u6B63\u5728\u91CD\u8FDE\u2026",
        waitingSample: "\u7B49\u5F85\u91C7\u6837",
        waitingSampleTitle: "\u6B63\u5728\u7B49\u5F85\u672C\u8F6E\u5B8C\u6574\u7528\u91CF\u53CA\u5339\u914D\u7684\u91C7\u6837\u65F6\u95F4\uFF0C\u538B\u7F29\u5BF9\u8BDD\u6216\u9996\u6B21\u54CD\u5E94\u53EF\u80FD\u4F7F\u91C7\u6837\u5EF6\u540E\u3002",
        "note.waitingSample": "\u6B63\u5728\u7B49\u5F85\u672C\u8F6E\u5B8C\u6574\u7528\u91CF\u53CA\u5339\u914D\u7684\u91C7\u6837\u65F6\u95F4\uFF0C\u538B\u7F29\u5BF9\u8BDD\u6216\u9996\u6B21\u54CD\u5E94\u53EF\u80FD\u4F7F\u91C7\u6837\u5EF6\u540E\u3002",
        statistics: "Token \u7EDF\u8BA1",
        usageDetails: "Token \u7528\u91CF\u8BE6\u60C5",
        settingsTab: "\u8BBE\u7F6E",
        layoutLabel: "\u72B6\u6001\u680F\u5E03\u5C40",
        layoutAdaptive: "\u6A21\u578B\u4F18\u5148\u81EA\u9002\u5E94",
        layoutSeparate: "\u7EDF\u8BA1\u72EC\u7ACB\u4E00\u884C",
        layoutIcon: "\u5355\u56FE\u6807\u5165\u53E3",
        layoutAdaptiveNote: "\u4F18\u5148\u4E3A\u539F\u751F\u63A7\u4EF6\u7559\u7A7A\u95F4\uFF0C\u5148\u663E\u793A\u901F\u5EA6\u4E0E\u7F13\u5B58\uFF0C\u518D\u968F\u5269\u4F59\u5BBD\u5EA6\u52A0\u5165\u8D39\u7528\u3001\u7528\u91CF\u3002",
        layoutSeparateNote: "\u56DB\u9879\u6307\u6807\u653E\u5728\u72EC\u7ACB\u4E00\u884C\uFF0C\u8F93\u5165\u6846\u4F1A\u589E\u52A0\u4E00\u884C\u9AD8\u5EA6\u3002",
        layoutIconNote: "\u53EA\u4FDD\u7559\u4E00\u4E2A\u7EDF\u8BA1\u6309\u94AE\uFF0C\u5C55\u5F00\u540E\u67E5\u770B\u7528\u91CF\u3001\u901F\u5EA6\u3001\u7F13\u5B58\u4E0E\u8D39\u7528\u3002",
        settingsScope: "\u5E94\u7528\u4E8E\u6240\u6709\u5BF9\u8BDD\uFF0C\u7531\u52A0\u8F7D\u5668\u81EA\u52A8\u4FDD\u5B58\u3002",
        settingsSaving: "\u6B63\u5728\u4FDD\u5B58\u2026",
        settingsSaved: "\u5DF2\u4FDD\u5B58",
        settingsError: "\u6682\u65F6\u65E0\u6CD5\u4FDD\u5B58\uFF0C\u52A0\u8F7D\u5668\u8FDE\u63A5\u540E\u4F1A\u91CD\u8BD5\u3002",
        "scope.current": "\u5F53\u524D\u5BF9\u8BDD",
        "scope.waiting": "\u7B49\u5F85\u8BC6\u522B\u5F53\u524D\u5BF9\u8BDD",
        "scope.reconnecting": "\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\u672C\u5730\u52A9\u624B",
        "scope.unavailable": "\u8FD0\u884C\u65F6\u9002\u914D\u5668\u4E0D\u53EF\u7528",
        "scope.pinned": "\u56FA\u5B9A\u5BF9\u8BDD\uFF08\u63A2\u9488\uFF09",
        "scope.unverified": "\u5C1A\u672A\u786E\u8BA4\u5F53\u524D\u5BF9\u8BDD",
        input: "\u8F93\u5165",
        cachedInput: "\u7F13\u5B58\u8F93\u5165\uFF08\u5DF2\u5305\u542B\uFF09",
        output: "\u8F93\u51FA",
        reasoning: "\u63A8\u7406\u8F93\u51FA\uFF08\u5DF2\u5305\u542B\uFF09",
        total: "\u603B\u8BA1",
        currentTurn: "\u5F53\u524D\u8F6E\u6B21",
        latestTurn: "\u6700\u8FD1\u5DF2\u5B8C\u6210\u8F6E\u6B21",
        responses: "\u5DF2\u89C2\u6D4B\u54CD\u5E94\u6570",
        elapsed: "\u5DF2\u7528\u65F6\u95F4",
        duration: "\u6574\u8F6E\u8017\u65F6",
        generationSpeed: "\u751F\u6210\u901F\u5EA6",
        sampledAverage: "\u91C7\u6837\u5E73\u5747\u901F\u5EA6",
        completedAverage: "\u4F30\u7B97\u6574\u8F6E\u5747\u901F",
        sampleAge: "\u8DDD\u4E0A\u6B21\u91C7\u6837",
        lastThroughput: "\u4E0A\u4E00\u8F6E\u541E\u5410",
        seconds: "{value} \u79D2",
        ago: "{value} \u79D2\u524D",
        sampledTitle: "\u91C7\u6837\u5E73\u5747\u901F\u5EA6\uFF1A\u672C\u8F6E\u8F93\u51FA token\uFF08\u542B\u63A8\u7406\uFF09\u9664\u4EE5\u8F6E\u6B21\u5F00\u59CB\u81F3\u540C\u4E00\u6B21\u7528\u91CF\u91C7\u6837\u7684\u65F6\u95F4\uFF0C\u5305\u542B\u7B49\u5F85\u548C\u5DE5\u5177\u6267\u884C\u3002\u66F4\u65B0\u4E8E {age}\uFF0C\u6B63\u5728\u7B49\u5F85\u4E0B\u4E00\u6B21\u5B98\u65B9\u7528\u91CF\u8BB0\u5F55\u3002",
        completedTitle: "\u4F30\u7B97\u6574\u8F6E\u5747\u901F\uFF1A\u672C\u8F6E\u8F93\u51FA token\uFF08\u542B\u63A8\u7406\uFF09\u9664\u4EE5\u6700\u7EC8\u6574\u8F6E\u8017\u65F6\uFF0C\u5305\u542B\u7B49\u5F85\u548C\u5DE5\u5177\u6267\u884C\u3002",
        disconnectedTitle: "\u672C\u5730\u52A9\u624B\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u6062\u590D\u8FDE\u63A5\u540E\u7EE7\u7EED\u66F4\u65B0\u7528\u91CF\u3002",
        rateSampled: "\u91C7\u6837\u5E73\u5747\u901F\u5EA6",
        rateCompleted: "\u4F30\u7B97\u6574\u8F6E\u5747\u901F",
        rateGeneration: "\u751F\u6210\u901F\u5EA6",
        updated: "\uFF0C\u66F4\u65B0\u4E8E {age}",
        accessible: "Token \u7EDF\u8BA1\uFF1A{rate} {value}{updated}\uFF1B\u7D2F\u8BA1 {total} token\uFF1B\u7F13\u5B58\u547D\u4E2D\u7387 {cache}\u3002\u5C55\u5F00\u7528\u91CF\u8BE6\u60C5\u3002",
        "note.sampled": "\u91C7\u6837\u5747\u901F\u4E3A\u4F30\u7B97\u503C\uFF1A\u672C\u8F6E\u5B98\u65B9\u8F93\u51FA token\uFF08\u542B\u63A8\u7406\uFF09\u9664\u4EE5\u8F6E\u6B21\u5F00\u59CB\u81F3\u540C\u4E00\u6B21\u7528\u91CF\u91C7\u6837\u7684\u65F6\u95F4\uFF0C\u5305\u542B\u7B49\u5F85\u548C\u5DE5\u5177\u6267\u884C\u3002\u6CA1\u6709\u65B0\u7528\u91CF\u65F6\u4FDD\u7559\u4E0A\u6B21\u7ED3\u679C\uFF0C\u5E76\u663E\u793A\u8DDD\u4E0A\u6B21\u91C7\u6837\u7684\u65F6\u95F4\u3002\u5B8C\u6210\u540E\u91C7\u7528\u6700\u7EC8\u6574\u8F6E\u8017\u65F6\u3002\u751F\u6210\u9636\u6BB5\u8BA1\u65F6\u5C1A\u672A\u786E\u8BA4\u3002",
        "note.completed": "\u6574\u8F6E\u5747\u901F\u4E3A\u4F30\u7B97\u503C\uFF1A\u672C\u8F6E\u5B98\u65B9\u8F93\u51FA token\uFF08\u542B\u63A8\u7406\uFF09\u9664\u4EE5\u6700\u7EC8\u6574\u8F6E\u8017\u65F6\uFF0C\u5305\u542B\u7B49\u5F85\u548C\u5DE5\u5177\u6267\u884C\u3002\u5B8C\u6210\u540E\u7ED3\u679C\u4FDD\u6301\u56FA\u5B9A\u3002\u751F\u6210\u9636\u6BB5\u8BA1\u65F6\u5C1A\u672A\u786E\u8BA4\u3002",
        "note.usageWaitingTiming": "\u7528\u91CF\u8DDF\u968F\u5DF2\u786E\u8BA4\u7684\u5F53\u524D\u5BF9\u8BDD\u3002\u751F\u6210\u901F\u5EA6\u4ECD\u7B49\u5F85\u53EF\u9760\u7684 token \u8BA1\u65F6\uFF1B\u4EC5\u4F9D\u8D56\u8FD0\u884C\u65F6\u901A\u77E5\u7684\u8F6E\u6B21\u7528\u91CF\u53EF\u80FD\u53EA\u8986\u76D6\u5DF2\u89C2\u6D4B\u54CD\u5E94\u3002",
        "note.waitingUsage": "\u5DF2\u8BC6\u522B\u5F53\u524D\u5BF9\u8BDD\uFF0C\u6B63\u5728\u7B49\u5F85\u5B98\u65B9\u7528\u91CF\u66F4\u65B0\u6216\u5339\u914D\u7684\u672C\u5730\u4F1A\u8BDD\u65E5\u5FD7\u3002",
        "note.identityUnresolved": "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u5F53\u524D\u5BF9\u8BDD\uFF0C\u786E\u8BA4\u540E\u518D\u663E\u793A\u7528\u91CF\u3002",
        "note.bridgeDisconnected": "\u672C\u5730\u52A9\u624B\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u8FDE\u63A5\u6062\u590D\u5E76\u901A\u8FC7\u6838\u9A8C\u540E\u7EE7\u7EED\u66F4\u65B0\u7528\u91CF\u3002",
        "note.adapterUnavailable": "\u65E0\u6CD5\u6838\u9A8C\u6B64\u5BA2\u6237\u7AEF\u5DF2\u52A0\u8F7D\u7684\u6A21\u5757\u6216\u5F53\u524D\u5E94\u7528\u72B6\u6001\u3002",
        "note.estimatedSpeed": "\u5F53\u524D\u901F\u5EA6\u4E3A\u4F30\u7B97\u503C\uFF0C\u8986\u76D6\u8303\u56F4\u4E0E\u8BA1\u7B97\u65B9\u5F0F\u89C1\u8FD0\u884C\u65F6\u9002\u914D\u5668\u8BF4\u660E\u3002",
        "note.default": "\u751F\u6210\u901F\u5EA6\u9700\u8981\u53EF\u9760\u7684\u751F\u6210\u9636\u6BB5\u8BA1\u65F6\u3002\u6574\u8F6E\u541E\u5410\u5305\u542B\u7B49\u5F85\u548C\u5DE5\u5177\u6267\u884C\uFF1B\u7F13\u5B58\u8F93\u5165\u4E0E\u63A8\u7406\u8F93\u51FA\u5DF2\u5305\u542B\u5728\u7528\u91CF\u603B\u8BA1\u4E2D\u3002",
        "note.pinned": "\u5F53\u524D\u663E\u793A\u63A2\u9488\u56FA\u5B9A\u5BF9\u8BDD\u7684\u6570\u636E\uFF0C\u5C1A\u672A\u786E\u8BA4\u5176\u4E0E\u5F53\u524D\u9875\u9762\u5BF9\u8BDD\u7684\u5BF9\u5E94\u5173\u7CFB\u3002\u751F\u6210\u901F\u5EA6\u4E0D\u53EF\u7528\u3002",
        "note.unverified": "\u6B63\u5728\u7B49\u5F85\u786E\u8BA4\u5F53\u524D\u9875\u9762\u4E0E\u4F1A\u8BDD\u65E5\u5FD7\u7684\u5BF9\u5E94\u5173\u7CFB\uFF0C\u6682\u4E0D\u5F52\u5C5E\u4EFB\u4F55\u7528\u91CF\u3002"
      }
    };
    Object.assign(messages.en, {
      cost: "Cost ",
      costTab: "Cost",
      usageTab: "Usage",
      costScope: "Conversation \xB7 API estimate",
      costDetails: "API cost details",
      costInput: "Uncached input",
      costRead: "Cache reads",
      costWrite: "Cache writes",
      costOutput: "Output incl. reasoning",
      costLatest: "Latest completed turn",
      costCurrent: "Current turn",
      costCoverage: "Priced responses (observed)",
      costRates: "Rates and assumptions",
      costVersion: "Built-in rates \xB7 {date} \xB7 USD / 1M tokens",
      costSource: "Official API pricing",
      costWaiting: "Waiting for verified response usage and model information.",
      costDisclaimer: "Estimated at the dated API rates, not a subscription charge or invoice. Excludes tool fees, tax, regional premiums and contract discounts.",
      costAccessible: "API cost estimate: {amount}.",
      costPartial: "Known subtotal plus unpriced usage.",
      cost30: "Cache writes \xB7 30 minutes",
      cost12: "Cache writes \xB7 12 hours",
      costMissingRates: "No verified model rates available.",
      "cost.tier.standard": "Standard",
      "cost.tier.fast": "Fast",
      "cost.tier.flex": "Flex",
      "cost.tier.batch": "Batch",
      "cost.tier.ultrafast": "Ultrafast",
      "cost.context.short": "\u2264272K input/request",
      "cost.context.long": ">272K input/request",
      "cost.context.flat": "Published flat rate",
      "cost.reason.tier-standard-assumed": "Standard pricing basis; actual tier unverified.",
      "cost.reason.write-ttl-unknown": "Write lifetime unknown; the range covers 30-minute to 12-hour write rates.",
      "cost.reason.model-unpriced": "Model price not listed",
      "cost.reason.model-unknown": "Model context missing",
      "cost.reason.provider-unknown": "Provider not verified",
      "cost.reason.custom-provider": "Custom provider price not available",
      "cost.reason.usage-incomplete": "Required usage fields missing",
      "cost.reason.usage-invalid": "Inconsistent usage fields",
      "cost.reason.write-details-invalid": "Write lifetime totals inconsistent",
      "cost.reason.tier-unpriced": "Tier price not listed",
      "cost.reason.context-unpriced": "Context-length price not listed",
      "cost.reason.component-unpriced": "Usage component has no published rate",
      "cost.reason.response-id-missing": "Stable response ID missing",
      "cost.reason.response-conflict": "Response attribution conflicts",
      "cost.reason.history-incomplete": "Observed usage does not reconcile to the official total",
      "cost.reason.total-unverified": "Official cumulative usage not available",
      "cost.reason.counter-reset": "Cumulative counters reset; historical coverage unverified",
      "cost.reason.inherited-history": "Inherited history coverage unverified",
      "cost.reason.runtime-gap": "New usage is awaiting matching response records"
    });
    Object.assign(messages.zh, {
      cost: "\u8D39\u7528 ",
      costTab: "\u8D39\u7528",
      usageTab: "\u7528\u91CF",
      costScope: "\u5F53\u524D\u5BF9\u8BDD \xB7 API \u4F30\u7B97",
      costDetails: "API \u8D39\u7528\u8BE6\u60C5",
      costInput: "\u666E\u901A\u8F93\u5165",
      costRead: "\u7F13\u5B58\u8BFB\u53D6",
      costWrite: "\u7F13\u5B58\u5199\u5165",
      costOutput: "\u8F93\u51FA\uFF08\u542B\u63A8\u7406\uFF09",
      costLatest: "\u6700\u8FD1\u5DF2\u5B8C\u6210\u8F6E\u6B21",
      costCurrent: "\u5F53\u524D\u8F6E\u6B21",
      costCoverage: "\u5DF2\u89C2\u6D4B\u54CD\u5E94\u8BA1\u4EF7\u6570",
      costRates: "\u5355\u4EF7\u4E0E\u8BA1\u7B97\u53E3\u5F84",
      costVersion: "\u5185\u7F6E\u4EF7 \xB7 {date} \xB7 \u7F8E\u5143\uFF0F\u767E\u4E07 token",
      costSource: "\u5B98\u65B9 API \u4EF7\u683C",
      costWaiting: "\u6B63\u5728\u7B49\u5F85\u53EF\u6838\u9A8C\u7684\u9010\u54CD\u5E94\u7528\u91CF\u548C\u6A21\u578B\u4FE1\u606F\u3002",
      costDisclaimer: "\u6309\u6807\u660E\u65E5\u671F\u7684 API \u4EF7\u6298\u7B97\uFF0C\u4E0D\u4EE3\u8868\u8BA2\u9605\u6263\u6B3E\u6216\u771F\u5B9E\u8D26\u5355\u3002\u4E0D\u542B\u5DE5\u5177\u9644\u52A0\u8D39\u7528\u3001\u7A0E\u8D39\u3001\u5730\u533A\u9644\u52A0\u8D39\u53CA\u5408\u540C\u6298\u6263\u3002",
      costAccessible: "API \u4F30\u7B97\u8D39\u7528\uFF1A{amount}\u3002",
      costPartial: "\u663E\u793A\u5DF2\u8BA1\u4EF7\u5C0F\u8BA1\uFF0C\u53E6\u6709\u672A\u8BA1\u4EF7\u7528\u91CF\u3002",
      cost30: "\u7F13\u5B58\u5199\u5165 \xB7 30 \u5206\u949F",
      cost12: "\u7F13\u5B58\u5199\u5165 \xB7 12 \u5C0F\u65F6",
      costMissingRates: "\u6682\u65E0\u53EF\u6838\u9A8C\u7684\u6A21\u578B\u5355\u4EF7\u3002",
      "cost.tier.standard": "Standard",
      "cost.tier.fast": "Fast",
      "cost.tier.flex": "Flex",
      "cost.tier.batch": "Batch",
      "cost.tier.ultrafast": "Ultrafast",
      "cost.context.short": "\u5355\u6B21\u8F93\u5165 \u2264272K",
      "cost.context.long": "\u5355\u6B21\u8F93\u5165 >272K",
      "cost.context.flat": "\u516C\u5F00\u56FA\u5B9A\u5355\u4EF7",
      "cost.reason.tier-standard-assumed": "\u6309 Standard \u4F30\u7B97\uFF0C\u5B9E\u9645\u4EF7\u683C\u6863\u4F4D\u5C1A\u672A\u786E\u8BA4\u3002",
      "cost.reason.write-ttl-unknown": "\u7F13\u5B58\u5199\u5165\u671F\u9650\u672A\u786E\u8BA4\uFF0C\u663E\u793A 30 \u5206\u949F\u81F3 12 \u5C0F\u65F6\u8D39\u7387\u8303\u56F4\u3002",
      "cost.reason.model-unpriced": "\u6A21\u578B\u5355\u4EF7\u672A\u6536\u5F55",
      "cost.reason.model-unknown": "\u7F3A\u5C11\u6A21\u578B\u4E0A\u4E0B\u6587",
      "cost.reason.provider-unknown": "\u5C1A\u672A\u786E\u8BA4\u63D0\u4F9B\u5546",
      "cost.reason.custom-provider": "\u81EA\u5B9A\u4E49\u63D0\u4F9B\u5546\u5355\u4EF7\u672A\u77E5",
      "cost.reason.usage-incomplete": "\u7F3A\u5C11\u5FC5\u8981\u7528\u91CF\u5B57\u6BB5",
      "cost.reason.usage-invalid": "\u7528\u91CF\u5B57\u6BB5\u4E0D\u4E00\u81F4",
      "cost.reason.write-details-invalid": "\u7F13\u5B58\u5199\u5165\u671F\u9650\u62C6\u5206\u4E0D\u4E00\u81F4",
      "cost.reason.tier-unpriced": "\u8BE5\u4EF7\u683C\u6863\u4F4D\u672A\u6536\u5F55",
      "cost.reason.context-unpriced": "\u8BE5\u4E0A\u4E0B\u6587\u957F\u5EA6\u4EF7\u683C\u672A\u6536\u5F55",
      "cost.reason.component-unpriced": "\u90E8\u5206\u7528\u91CF\u6CA1\u6709\u516C\u5F00\u5355\u4EF7",
      "cost.reason.response-id-missing": "\u7F3A\u5C11\u7A33\u5B9A\u7684\u54CD\u5E94\u6807\u8BC6",
      "cost.reason.response-conflict": "\u54CD\u5E94\u5F52\u5C5E\u5B58\u5728\u51B2\u7A81",
      "cost.reason.history-incomplete": "\u5DF2\u89C2\u6D4B\u7528\u91CF\u4E0E\u5B98\u65B9\u7D2F\u8BA1\u672A\u5BF9\u9F50\uFF0C\u5386\u53F2\u8986\u76D6\u4E0D\u8DB3",
      "cost.reason.total-unverified": "\u5C1A\u672A\u53D6\u5F97\u5B98\u65B9\u7D2F\u8BA1\u7528\u91CF",
      "cost.reason.counter-reset": "\u7D2F\u8BA1\u8BA1\u6570\u5DF2\u91CD\u7F6E\uFF0C\u5386\u53F2\u8986\u76D6\u5C1A\u672A\u6838\u9A8C",
      "cost.reason.inherited-history": "\u7EE7\u627F\u5386\u53F2\u7684\u8986\u76D6\u8303\u56F4\u5C1A\u672A\u6838\u9A8C",
      "cost.reason.runtime-gap": "\u65B0\u589E\u7528\u91CF\u6B63\u5728\u7B49\u5F85\u5BF9\u5E94\u7684\u54CD\u5E94\u8BB0\u5F55"
    });
    const text = (key, params = {}) => (messages[language][key] ?? messages.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
    const host = document.createElement("span");
    host.id = "codex-token-statusbar";
    host.style.cssText = "display:inline-flex;position:relative;align-items:center;margin-inline-start:auto;min-width:0;max-width:100%;flex-shrink:1;grid-column:2;grid-row:2;justify-self:end;color:inherit";
    const shadow = host.attachShadow({ mode: "open" });
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
    <span class="metric" data-metric="speed"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" style="stroke-width:2.4"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg><span class="label" data-label="speed">Speed </span><span class="value" data-value="speed">--</span></span><span class="sep total-sep" aria-hidden="true">\xB7</span>
    <span class="metric" data-metric="total"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="m8 2 5.5 3-5.5 3L2.5 5 8 2Zm-5.5 6L8 11l5.5-3M2.5 11l5.5 3 5.5-3"/></svg><span class="label" data-label="tokens">Tokens </span><span class="value" data-value="total">--</span></span><span class="sep cache-sep" aria-hidden="true">\xB7</span>
    <span class="metric" data-metric="cache"><svg class="metric-icon" aria-hidden="true" viewBox="0 0 24 24" style="stroke-width:2.4"><path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span class="label" data-label="cache">Cache </span><span class="value" data-value="cache">--</span></span>
    <span class="sep cost-sep" aria-hidden="true">\xB7</span>
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
    let activeTab = "usage";
    let previousCostKey = null;
    let layout = "adaptive";
    let layoutRequest = null;
    let settingsStatus = "";
    let requestSerial = 0;
    let availableWidth = null;
    let presentation = "full";
    let footerWrap = null;
    const button = shadow.querySelector("button");
    const panel = shadow.querySelector("section");
    const viewport = shadow.querySelector(".tab-viewport");
    const pages = [...shadow.querySelectorAll('[role="tabpanel"]')];
    const tabs = [...shadow.querySelectorAll("[data-tab]")];
    const indicator = shadow.querySelector(".tab-indicator");
    const layoutOptions = [...shadow.querySelectorAll("[data-layout-option]")];
    const ratesDetails = shadow.querySelector("details");
    const ratesSummary = ratesDetails.querySelector("summary");
    const ratesClip = shadow.querySelector(".rates-clip");
    const ratesContent = shadow.querySelector(".rates");
    const ratesChevron = shadow.querySelector(".rates-chevron");
    const reducedMotion = matchMedia("(prefers-reduced-motion:reduce)");
    const motion = /* @__PURE__ */ new Map();
    const easing = "cubic-bezier(.2,.8,.2,1)";
    let panelOpen = false;
    let ratesOpen = false;
    let placeAbove = true;
    let tabHeightTarget = null;
    let ratesHeightTarget = null;
    let indicatorTarget = "";
    function cancelMotion(name) {
      const job = motion.get(name);
      motion.delete(name);
      job?.cancel();
    }
    function play(name, element, frames, duration, complete = () => {
    }) {
      cancelMotion(name);
      if (reducedMotion.matches || typeof element.animate !== "function") {
        complete();
        return;
      }
      const job = element.animate(frames, { duration, easing, fill: "both" });
      motion.set(name, job);
      job.finished.then(() => {
        if (motion.get(name) !== job) return;
        motion.delete(name);
        complete();
        job.cancel();
      }).catch(() => {
      });
    }
    function syncIndicator(animate = false) {
      if (panel.hidden) return;
      const selected = tabs.find((item) => item.dataset.tab === activeTab);
      const target = { transform: `translateX(${selected.offsetLeft}px)`, width: `${selected.offsetWidth}px` };
      const key = JSON.stringify(target);
      if (key === indicatorTarget) return;
      const before = { transform: getComputedStyle(indicator).transform, width: getComputedStyle(indicator).width };
      indicatorTarget = key;
      cancelMotion("indicator");
      Object.assign(indicator.style, target);
      if (animate) play("indicator", indicator, [before, target], 190);
    }
    function settleTabs() {
      for (const name of ["tab-in", "tab-out", "tab-height"]) cancelMotion(name);
      tabHeightTarget = null;
      viewport.style.height = "";
      for (const page of pages) {
        page.hidden = page.id !== `cts-${activeTab}-page`;
        page.inert = page.hidden;
        page.style.position = "";
        page.style.inset = "";
      }
    }
    function animateTabHeight(height, from = parseFloat(getComputedStyle(viewport).height) || 0) {
      tabHeightTarget = height;
      play("tab-height", viewport, [{ height: `${from}px` }, { height: `${height}px` }], 190, () => {
        viewport.style.height = "";
        tabHeightTarget = null;
      });
    }
    function animateRatesHeight(height, from = parseFloat(getComputedStyle(ratesClip).height) || 0) {
      ratesHeightTarget = height;
      play("rates-height", ratesClip, [{ height: `${from}px` }, { height: `${height}px` }], 210, () => {
        ratesDetails.open = ratesOpen;
        ratesClip.style.height = "";
        ratesHeightTarget = null;
      });
    }
    function setRates(open, animate = true) {
      const from = ratesDetails.open ? parseFloat(getComputedStyle(ratesClip).height) || 0 : 0;
      const opacity = ratesDetails.open ? getComputedStyle(ratesContent).opacity : "0";
      const rotation = getComputedStyle(ratesChevron).transform;
      ratesOpen = open;
      ratesSummary.setAttribute("aria-expanded", String(open));
      ratesClip.inert = !open;
      for (const name of ["rates-height", "rates-text", "rates-chevron"]) cancelMotion(name);
      ratesHeightTarget = null;
      ratesChevron.style.transform = `rotate(${open ? 90 : 0}deg)`;
      if (!animate || !panelOpen || activeTab !== "cost" || reducedMotion.matches) {
        ratesDetails.open = open;
        ratesClip.style.height = "";
        return;
      }
      settleTabs();
      ratesDetails.open = true;
      animateRatesHeight(open ? ratesContent.offsetHeight : 0, from);
      play("rates-text", ratesContent, [{ opacity }, { opacity: open ? 1 : 0 }], 210);
      play("rates-chevron", ratesChevron, [{ transform: rotation }, { transform: ratesChevron.style.transform }], 210);
    }
    const number = (n) => Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : "--";
    const compact = (n) => !Number.isFinite(n) ? "--" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : number(n);
    function detail(selector, rows) {
      const list = shadow.querySelector(selector);
      list.replaceChildren();
      for (const [label, value] of rows) {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        list.append(dt, dd);
      }
    }
    function usageRows(usage) {
      return [
        [text("input"), number(usage?.input_tokens)],
        [text("cachedInput"), number(usage?.cached_input_tokens)],
        [text("costWrite"), number(usage?.cache_write_input_tokens)],
        [text("output"), number(usage?.output_tokens)],
        [text("reasoning"), number(usage?.reasoning_output_tokens)],
        [text("total"), number(usage?.total_tokens)]
      ];
    }
    function dollars(value, decimals = 4) {
      try {
        if (typeof value !== "string" || !/^\d+$/.test(value)) return "--";
        const n = BigInt(value);
        if (decimals === 4 && n > 0n && n < 100000000n) return "< $0.0001";
        const scale = 10n ** BigInt(decimals);
        const unit = 1000000000000n / scale;
        const rounded = (n + unit / 2n) / unit;
        return "$" + (rounded / scale).toLocaleString("en-US") + "." + (rounded % scale).toString().padStart(decimals, "0");
      } catch {
        return "--";
      }
    }
    function costAmount(value, inline = false) {
      if (!value?.amount) return "--";
      const { minPicoUsd: min, maxPicoUsd: max } = value.amount;
      const lower = dollars(min, inline ? 2 : 4), upper = dollars(max, inline ? 2 : 4);
      const range = lower === upper ? lower : lower + "\u2013" + upper;
      return (inline ? "" : "\u2248 ") + range;
    }
    function renderSettings() {
      const key = layout === "separate" ? "layoutSeparate" : layout === "icon" ? "layoutIcon" : "layoutAdaptive";
      const update = (element, value) => {
        if (element.textContent !== value) element.textContent = value;
      };
      update(shadow.querySelector('[data-settings="label"]'), text("layoutLabel"));
      for (const option of layoutOptions) {
        update(option.querySelector("span"), text(option.dataset.layoutOption === "separate" ? "layoutSeparate" : option.dataset.layoutOption === "icon" ? "layoutIcon" : "layoutAdaptive"));
        option.setAttribute("aria-checked", String(option.dataset.layoutOption === layout));
        option.tabIndex = option.dataset.layoutOption === layout ? 0 : -1;
      }
      update(shadow.querySelector('[data-settings="description"]'), text(key + "Note"));
      update(shadow.querySelector('[data-settings="scope"]'), text("settingsScope"));
      update(shadow.querySelector('[data-settings="status"]'), settingsStatus ? text(settingsStatus) : "");
    }
    function applyLayout(value, requested = false) {
      if (!["adaptive", "separate", "icon"].includes(value)) return false;
      layout = value;
      if (requested) {
        layoutRequest = { id: `${Date.now()}-${++requestSerial}`, layout: value };
        settingsStatus = "settingsSaving";
      }
      renderSettings();
      syncLayout();
      if (!panel.hidden) {
        syncIndicator();
        positionPanel();
      }
      return true;
    }
    function setTab(tab, animate = true) {
      if (tab === activeTab) return;
      const outgoing = pages.find((page) => page.id === `cts-${activeTab}-page`);
      const incoming = pages.find((page) => page.id === `cts-${tab}-page`);
      const fromHeight = parseFloat(getComputedStyle(viewport).height) || 0;
      const opacity = getComputedStyle(outgoing).opacity;
      const transform = getComputedStyle(outgoing).transform;
      settleTabs();
      setRates(ratesOpen, false);
      activeTab = tab;
      for (const item of tabs) item.setAttribute("aria-selected", String(item.dataset.tab === tab));
      syncIndicator(animate && panelOpen);
      if (!animate || !panelOpen || reducedMotion.matches) {
        settleTabs();
        if (!panel.hidden) positionPanel();
        return;
      }
      outgoing.hidden = false;
      outgoing.inert = true;
      outgoing.style.position = "absolute";
      outgoing.style.inset = "0";
      incoming.hidden = false;
      incoming.inert = false;
      const direction = tabs.findIndex((item) => item.dataset.tab === tab) > tabs.findIndex((item) => item.getAttribute("aria-controls") === outgoing.id) ? 1 : -1;
      animateTabHeight(incoming.offsetHeight, fromHeight);
      play("tab-out", outgoing, [{ opacity, transform }, { opacity: 0, transform: `translateX(${-7 * direction}px)` }], 124, () => {
        outgoing.hidden = true;
      });
      play("tab-in", incoming, [{ opacity: 0, transform: `translateX(${7 * direction}px)` }, { opacity: 1, transform: "translateX(0)" }], 190, () => {
        cancelMotion("tab-out");
        for (const page of pages) {
          page.hidden = page !== incoming;
          page.inert = page.hidden;
          page.style.position = "";
          page.style.inset = "";
        }
      });
      positionPanel();
    }
    function renderCost() {
      shadow.querySelector('[data-label="cost"]').textContent = text("cost");
      const cost = snapshot.cost;
      shadow.querySelector('[data-value="cost"]').textContent = costAmount(cost?.total, true);
      for (const tab of tabs) tab.textContent = text(tab.dataset.tab + "Tab");
      shadow.querySelector('[role="tablist"]').setAttribute("aria-label", text("statistics"));
      const key = JSON.stringify([language, cost, !!snapshot.currentTurn]);
      if (previousCostKey === key) return;
      previousCostKey = key;
      shadow.querySelector('[data-heading="cost-scope"]').textContent = text("costScope");
      shadow.querySelector('[data-cost="amount"]').textContent = costAmount(cost?.total);
      shadow.querySelector('[data-cost="version"]').textContent = text("costVersion", { date: cost?.priceVersion ?? "--" });
      const turn = snapshot.currentTurn ? cost?.currentTurn : cost?.lastTurn;
      detail('[data-detail="cost-turn"]', [[text(snapshot.currentTurn ? "costCurrent" : "costLatest"), costAmount(turn)]]);
      const component = (name) => cost?.total?.components?.[name] ? costAmount({ amount: cost.total.components[name] }) : "--";
      detail('[data-detail="cost-components"]', [[text("costInput"), component("input")], [text("costRead"), component("cacheRead")], [text("costWrite"), component("cacheWrite")], [text("costOutput"), component("output")]]);
      shadow.querySelector('[data-cost="coverage"]').textContent = text("costCoverage") + ": " + number(cost?.total?.pricedResponses) + " / " + number(cost?.total?.responseCount);
      const reasons = shadow.querySelector('[data-cost="reasons"]');
      reasons.replaceChildren();
      const notes = [
        ...!cost?.total?.responseCount ? [text("costWaiting")] : [],
        ...cost?.total?.amount && !cost.total.complete ? [text("costPartial")] : [],
        ...(cost?.total?.assumptions ?? []).map((reason) => text("cost.reason." + reason)),
        ...(cost?.total?.reasons ?? []).map((reason) => text("cost.reason." + reason.key) + (reason.count > 1 ? " (" + number(reason.count) + ")" : ""))
      ];
      for (const value of notes) {
        const li = document.createElement("li");
        li.textContent = value;
        reasons.append(li);
      }
      shadow.querySelector('[data-cost="rates-title"]').textContent = text("costRates");
      shadow.querySelector('[data-cost="disclaimer"]').textContent = text("costDisclaimer");
      shadow.querySelector('[data-cost="source"]').textContent = text("costSource");
      const rates = shadow.querySelector('[data-cost="rates"]');
      rates.replaceChildren();
      if (!cost?.total?.models?.length) rates.textContent = text("costMissingRates");
      for (const model of cost?.total?.models ?? []) {
        const heading = document.createElement("h4");
        heading.textContent = model.model + " \xB7 " + text("cost.tier." + model.tier) + " \xB7 " + text("cost.context." + model.context);
        const list = document.createElement("dl");
        for (const [label, name] of [["costInput", "input"], ["costRead", "cachedInput"], ["cost30", "cacheWrite30m"], ["cost12", "cacheWrite12h"], ["costOutput", "output"]]) {
          const dt = document.createElement("dt"), dd = document.createElement("dd");
          dt.textContent = text(label);
          dd.textContent = model.rates?.[name] != null ? "$" + model.rates[name] : "--";
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
      const sampled = turnRate?.status === "sampled";
      const sampleAge = Number.isFinite(turnRate?.sampleAgeMs) ? text("ago", { value: (turnRate.sampleAgeMs / 1e3).toFixed(1) }) : "--";
      if (host.lang !== language) host.lang = language;
      panel.setAttribute("aria-label", text("usageDetails"));
      shadow.querySelector('[data-heading="scope"]').textContent = snapshot.scopeKey ? text(snapshot.scopeKey) : snapshot.scopeLabel ?? text("scope.current");
      shadow.querySelector('[data-label="tokens"]').textContent = text("tokens");
      shadow.querySelector('[data-label="cache"]').textContent = text("cache");
      shadow.querySelector('[data-label="speed"]').textContent = text(speed?.value != null || turnRate?.value == null ? "speed" : sampled ? "sampled" : "completed");
      shadow.querySelector('[data-value="speed"]').textContent = displayedRate?.value != null ? `${displayedRate.value.toFixed(1)} t/s` : ratePending ? text("waitingSample") : "--";
      button.title = !speed && turnRate ? text(sampled ? "sampledTitle" : "completedTitle", { age: sampleAge }) : ratePending ? text("waitingSampleTitle") : text("statistics");
      if (snapshot.bridgeDisconnected) {
        shadow.querySelector('[data-label="speed"]').textContent = text("bridge");
        shadow.querySelector('[data-value="speed"]').textContent = text("reconnecting");
        button.title = text("disconnectedTitle");
      }
      shadow.querySelector('[data-value="total"]').textContent = compact(snapshot.total?.total_tokens);
      shadow.querySelector('[data-value="cache"]').textContent = Number.isFinite(snapshot.cacheHitRate) ? `${snapshot.cacheHitRate.toFixed(1)}%` : "--";
      button.setAttribute("aria-label", text("accessible", {
        rate: text(displayedRate?.estimated ? sampled ? "rateSampled" : "rateCompleted" : "rateGeneration"),
        value: shadow.querySelector('[data-value="speed"]').textContent,
        updated: sampled ? text("updated", { age: sampleAge }) : "",
        total: number(snapshot.total?.total_tokens),
        cache: shadow.querySelector('[data-value="cache"]').textContent
      }));
      renderCost();
      renderSettings();
      const costDescription = text("costAccessible", { amount: costAmount(snapshot.cost?.total) });
      button.setAttribute("aria-label", button.getAttribute("aria-label") + " " + costDescription);
      button.title += "\n" + costDescription + (snapshot.cost?.total?.complete === false && snapshot.cost.total.amount ? " " + text("costPartial") : "");
      detail('[data-detail="total"]', usageRows(snapshot.total));
      const turn = snapshot.currentTurn ?? snapshot.lastTurn;
      const turnDurationMs = turn?.durationMs ?? (turnRate?.turnId === turn?.id ? snapshot.currentTurn ? turnRate?.elapsedMs : turnRate?.durationMs : null);
      shadow.querySelector('[data-heading="turn"]').textContent = text(snapshot.currentTurn ? "currentTurn" : "latestTurn");
      detail('[data-detail="turn"]', [
        ...usageRows(turn?.usage),
        [text("responses"), number(turn?.responseCount)],
        [text(snapshot.currentTurn ? "elapsed" : "duration"), Number.isFinite(turnDurationMs) ? text("seconds", { value: (turnDurationMs / 1e3).toFixed(2) }) : "--"]
      ]);
      detail('[data-detail="speed"]', [
        [text("generationSpeed"), speed?.value != null ? `${speed.value.toFixed(1)} t/s` : "--"],
        [text(sampled || ratePending ? "sampledAverage" : "completedAverage"), turnRate?.value != null ? `\u2248 ${turnRate.value.toFixed(1)} t/s` : ratePending ? text("waitingSample") : "--"],
        ...sampled ? [[text("sampleAge"), sampleAge]] : [],
        [text("lastThroughput"), snapshot.endToEndSpeed?.value != null ? `${snapshot.endToEndSpeed.value.toFixed(1)} t/s` : "--"]
      ]);
      const fallbackNoteKey = turnRate && !speed ? sampled ? "note.sampled" : "note.completed" : snapshot.speed?.estimated ? "note.estimatedSpeed" : "note.default";
      shadow.querySelector('[data-detail="note"]').textContent = snapshot.noteKey ? text(snapshot.noteKey, snapshot.noteParams) : snapshot.scopeNote ?? text(fallbackNoteKey);
      syncLayout();
      if (!panel.hidden) {
        syncIndicator();
        positionPanel();
      }
    }
    function positionPanel() {
      const rect = host.getBoundingClientRect();
      const above = rect.top - 22;
      const below = window.innerHeight - rect.bottom - 22;
      placeAbove = above >= below;
      panel.style.maxHeight = `${Math.max(1, placeAbove ? above : below)}px`;
      const width = panel.offsetWidth;
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      panel.style.left = `${left}px`;
      panel.style.top = placeAbove ? "auto" : `${rect.bottom + 10}px`;
      panel.style.bottom = placeAbove ? `${window.innerHeight - rect.top + 10}px` : "auto";
      panel.style.transformOrigin = `${Math.max(12, Math.min(width - 12, rect.right - left - 28))}px ${placeAbove ? "bottom" : "top"}`;
    }
    function setOpen(open, animate = true) {
      if (open === panelOpen && animate) return;
      const wasVisible = !panel.hidden;
      const before = wasVisible ? { opacity: getComputedStyle(panel).opacity, transform: getComputedStyle(panel).transform } : null;
      panelOpen = open;
      cancelMotion("menu");
      if (!open) {
        settleTabs();
        setRates(ratesOpen, false);
        cancelMotion("indicator");
      }
      const finish = () => {
        panel.style.opacity = "";
        panel.style.transform = "";
        if (!panelOpen) {
          if (panel.matches(":popover-open")) panel.hidePopover();
          panel.hidden = true;
        }
      };
      panel.inert = !open;
      button.setAttribute("aria-expanded", String(open));
      if (open) {
        panel.hidden = false;
        if (!panel.matches(":popover-open")) panel.showPopover();
        positionPanel();
        syncIndicator();
      }
      if (!animate || reducedMotion.matches || !open && !wasVisible) {
        finish();
        return;
      }
      const closed = { opacity: 0, transform: `translateY(${placeAbove ? 7 : -7}px) scale(.985)` };
      play("menu", panel, [before ?? closed, open ? { opacity: 1, transform: "translateY(0) scale(1)" } : closed], open ? 200 : 150, finish);
    }
    button.addEventListener("click", (event) => {
      if (event.composedPath().some((element) => element?.dataset?.metric === "cost")) {
        if (activeTab === "cost" && panelOpen) setOpen(false);
        else {
          setTab("cost", panelOpen);
          setOpen(true);
        }
      } else setOpen(!panelOpen);
    });
    for (const tab of shadow.querySelectorAll("[data-tab]")) tab.addEventListener("click", () => setTab(tab.dataset.tab));
    for (const option of layoutOptions) {
      option.addEventListener("click", () => applyLayout(option.dataset.layoutOption, true));
      option.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const index = layoutOptions.indexOf(option);
        const next = event.key === "Home" ? 0 : event.key === "End" ? layoutOptions.length - 1 : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + layoutOptions.length) % layoutOptions.length;
        applyLayout(layoutOptions[next].dataset.layoutOption, true);
        layoutOptions[next].focus();
        event.preventDefault();
      });
    }
    for (const type of ["pointerdown", "mousedown", "click"]) panel.addEventListener(type, (event) => event.stopPropagation());
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") event.stopPropagation();
    });
    shadow.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const index = tabs.findIndex((tab) => tab.dataset.tab === activeTab);
      const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].dataset.tab;
      setTab(next);
      shadow.querySelector('[data-tab="' + next + '"]').focus();
      event.preventDefault();
    });
    const closeOutside = (event) => {
      if (!event.composedPath().includes(host)) setOpen(false);
    };
    ratesSummary.addEventListener("click", (event) => {
      event.preventDefault();
      setRates(!ratesOpen);
    });
    const keydown = (event) => {
      if (event.key === "Escape" && panelOpen) {
        if (shadow.activeElement) button.focus();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", keydown);
    const reposition = () => {
      if (!panel.hidden) {
        syncIndicator();
        positionPanel();
      }
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    function releaseFooterWrap() {
      if (footerWrap && footerWrap.footer.style.flexWrap === "wrap") footerWrap.footer.style.flexWrap = footerWrap.value;
      footerWrap = null;
    }
    function syncLayout() {
      if (!observedFooter) return;
      const footerStyle = getComputedStyle(observedFooter);
      const width = observedFooter.getBoundingClientRect().width;
      const grid = footerStyle.display.includes("grid");
      const style = (name, value) => {
        if (host.style[name] !== value) host.style[name] = value;
      };
      if (host.getAttribute("data-layout") !== layout) host.setAttribute("data-layout", layout);
      const native = [...observedFooter.children].filter((element) => {
        if (element === host || !element.getBoundingClientRect().width || !element.getBoundingClientRect().height) return false;
        const computed = getComputedStyle(element);
        return !grid || computed.gridRowStart !== "1" && computed.gridColumnEnd !== "-1";
      });
      const nativeWidth = native.reduce((sum, element) => {
        const controls = (element.matches('button,[role="button"],[role="combobox"]') ? [element] : [...element.querySelectorAll('button,[role="button"],[role="combobox"]')]).filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && control.checkVisibility?.({ checkVisibilityCSS: true }) !== false;
        });
        const gap = controls.length > 1 ? parseFloat(getComputedStyle(controls[0].parentElement).columnGap) || 5 : 0;
        const measured = controls.length ? controls.reduce((width2, control) => width2 + Math.max(control.getBoundingClientRect().width, control.scrollWidth), 0) + gap * (controls.length - 1) : element.getBoundingClientRect().width;
        const reserveModel = grid && getComputedStyle(element).gridColumnStart === "3" && controls.length >= 2;
        return sum + Math.max(measured, reserveModel ? 280 : 0);
      }, 0);
      const padding = (parseFloat(footerStyle.paddingLeft) || 0) + (parseFloat(footerStyle.paddingRight) || 0);
      availableWidth = Math.max(0, Math.floor(width - padding - nativeWidth - (parseFloat(footerStyle.columnGap) || 0) * native.length - 12));
      const ownRow = layout === "separate" || layout !== "separate" && availableWidth < 28;
      if (!grid && ownRow && !footerWrap) {
        footerWrap = { footer: observedFooter, value: observedFooter.style.flexWrap };
        observedFooter.style.flexWrap = "wrap";
      } else if (!ownRow && footerWrap) releaseFooterWrap();
      style("gridColumn", ownRow ? "1 / -1" : "2");
      style("gridRow", ownRow ? "3" : "2");
      style("flexBasis", ownRow && !grid ? "100%" : "");
      style("width", ownRow ? "100%" : "");
      style("marginInlineStart", ownRow ? "0px" : "auto");
      style("marginTop", ownRow ? "4px" : "0px");
      style("justifyContent", "flex-end");
      style("maxWidth", ownRow ? "100%" : `${Math.max(28, availableWidth)}px`);
      host.toggleAttribute("data-compact", width < 1e3);
      for (const attribute of ["data-hide-total", "data-hide-cost", "data-hide-chevron", "data-icon"]) host.removeAttribute(attribute);
      const needsSpace = () => button.scrollWidth > button.clientWidth + 1;
      if (layout === "adaptive" && needsSpace()) host.setAttribute("data-compact", "");
      if (layout === "adaptive" && needsSpace()) host.setAttribute("data-hide-chevron", "");
      if (layout === "adaptive" && needsSpace()) host.setAttribute("data-hide-total", "");
      if (layout === "adaptive" && needsSpace()) host.setAttribute("data-hide-cost", "");
      if (layout === "icon" || layout === "adaptive" && (needsSpace() || ownRow)) host.setAttribute("data-icon", "");
      presentation = host.hasAttribute("data-icon") ? "icon" : host.hasAttribute("data-hide-cost") ? "primary" : host.hasAttribute("data-hide-total") ? "three" : "full";
    }
    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
      reposition();
    });
    const contentObserver = new ResizeObserver(() => {
      if (motion.has("rates-height") && ratesOpen) {
        const height = ratesContent.offsetHeight;
        if (Math.abs(height - ratesHeightTarget) > 0.5) animateRatesHeight(height);
      }
      if (motion.has("tab-height")) {
        const height = pages.find((page) => page.id === `cts-${activeTab}-page`).offsetHeight;
        if (Math.abs(height - tabHeightTarget) > 0.5) animateTabHeight(height);
      }
    });
    for (const content of [...pages, ratesContent]) contentObserver.observe(content);
    const finishMotion = () => {
      for (const name of [...motion.keys()]) cancelMotion(name);
      settleTabs();
      setRates(ratesOpen, false);
      setOpen(panelOpen, false);
      syncIndicator();
    };
    reducedMotion.addEventListener("change", finishMotion);
    function findActiveFooter() {
      return [...document.querySelectorAll("[data-composer-footer-responsive], .ComposerFooter-WlpjXt")].find((footer) => {
        if (!footer.isConnected || footer.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        if (footer.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) === false) return false;
        const rect = footer.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) ?? null;
    }
    function mount(footer = findActiveFooter()) {
      if (disposed) return;
      if (host.parentElement !== footer) {
        setOpen(false, false);
        setRates(false, false);
        releaseFooterWrap();
        resizeObserver.disconnect();
        observedFooter = footer;
        if (footer) {
          footer.append(host);
          mountCount++;
          resizeObserver.observe(footer);
          for (const child of footer.children) if (child !== host) resizeObserver.observe(child);
        } else host.remove();
      }
      render();
    }
    const observer = new MutationObserver(() => {
      const nextLanguage = readLanguage();
      const languageChanged = nextLanguage !== language;
      language = nextLanguage;
      const footer = findActiveFooter();
      if (host.parentElement !== footer || footer && !host.isConnected) {
        snapshot = {};
        mount(footer);
      } else if (languageChanged) render();
      else {
        syncLayout();
        for (const child of footer?.children ?? []) if (child !== host) resizeObserver.observe(child);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "data-state", "data-active", "data-theme", "lang"] });
    window[KEY] = {
      version: "0.6.1",
      setSettings(value, acknowledgedRequest = null) {
        if (layoutRequest && acknowledgedRequest !== layoutRequest.id) return false;
        if (!["adaptive", "separate", "icon"].includes(value?.layout)) return false;
        if (layoutRequest) {
          layoutRequest = null;
          settingsStatus = "settingsSaved";
        }
        return applyLayout(value.layout);
      },
      settingsError(requestId) {
        if (layoutRequest?.id === requestId) {
          settingsStatus = "settingsError";
          renderSettings();
        }
      },
      setSnapshot(value) {
        const next = value ?? {};
        if (next.threadId !== snapshot.threadId || next.hostId !== snapshot.hostId || next.bridgeDisconnected && !snapshot.bridgeDisconnected) {
          setOpen(false, false);
          setRates(false, false);
        }
        snapshot = next;
        mount();
      },
      desktopSnapshot() {
        if (!host.isConnected || host.parentElement !== findActiveFooter()) return null;
        const read = (selector) => shadow.querySelector(selector)?.textContent ?? "";
        const rows = (selector) => [...shadow.querySelectorAll(selector + " dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? "--"]);
        const color = getComputedStyle(button).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [238, 238, 238];
        return {
          theme: color.reduce((sum, value) => sum + value, 0) > 384 ? "dark" : "light",
          scope: read('[data-heading="scope"]'),
          values: Object.fromEntries(["speed", "cache", "total", "cost"].map((key) => [key, read(`[data-value="${key}"]`)])),
          speedNote: button.title.split("\n")[0],
          note: read('[data-detail="note"]'),
          usageRows: rows('[data-detail="total"]'),
          turnRows: rows('[data-detail="turn"]'),
          cost: {
            amount: read('[data-cost="amount"]'),
            scope: read('[data-heading="cost-scope"]'),
            version: read('[data-cost="version"]'),
            coverage: read('[data-cost="coverage"]'),
            rows: rows('[data-detail="cost-components"]'),
            notes: [...shadow.querySelectorAll('[data-cost="reasons"] li')].map((li) => li.textContent),
            rates: [...shadow.querySelectorAll('[data-cost="rates"] h4')].map((heading) => ({
              heading: heading.textContent,
              rows: [...heading.nextElementSibling.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])
            })),
            disclaimer: read('[data-cost="disclaimer"]')
          }
        };
      },
      inspect() {
        return {
          mounted: host.isConnected && host.parentElement === findActiveFooter(),
          mountCount,
          threadId: snapshot.threadId ?? null,
          language,
          version: this.version,
          layout,
          presentation,
          availableWidth,
          settingsChange: layoutRequest ? { ...layoutRequest } : null,
          settingsStatus,
          motion: { preset: "native-gentle", open: panelOpen, tab: activeTab, ratesOpen, reduced: reducedMotion.matches, active: motion.size }
        };
      },
      dispose() {
        disposed = true;
        releaseFooterWrap();
        observer.disconnect();
        resizeObserver.disconnect();
        contentObserver.disconnect();
        reducedMotion.removeEventListener("change", finishMotion);
        document.removeEventListener("pointerdown", closeOutside);
        document.removeEventListener("keydown", keydown);
        window.removeEventListener("resize", reposition);
        window.removeEventListener("scroll", reposition, true);
        setOpen(false, false);
        setRates(false, false);
        for (const name of [...motion.keys()]) cancelMotion(name);
        host.remove();
        delete window[KEY];
      }
    };
    mount();
  })();

  // src/thread-identity.mjs
  var CLIENT_THREAD_PREFIX = "client-new-thread:";
  var UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  var validHost = (value) => typeof value === "string" && value.length > 0 && value.length <= 512;
  var isCoreThreadId = (value) => typeof value === "string" && UUID.test(value);
  var isClientThreadId = (value) => typeof value === "string" && value.startsWith(CLIENT_THREAD_PREFIX) && UUID.test(value.slice(CLIENT_THREAD_PREFIX.length));
  function parseLocalThreadRoute({ pathname = "", search = "" } = {}) {
    if (typeof pathname !== "string" || typeof search !== "string") return null;
    const match = /^(?:\/local|\/hotkey-window\/thread)\/([^/?#]+)$/.exec(pathname);
    if (!match) return null;
    let id;
    try {
      id = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    const params = new URLSearchParams(search);
    const hosts = params.getAll("hostId");
    if (hosts.length > 1 || hosts.length && !validHost(hosts[0])) return null;
    if (isClientThreadId(id)) return {
      routeKind: "client-local-thread",
      clientThreadId: id,
      // 当前客户端的别名分支不从查询参数得出主机，必须靠既有 AppScope。
      hostId: null
    };
    if (!isCoreThreadId(id)) return null;
    return { routeKind: "local-thread", threadId: id, hostId: hosts[0] ?? null };
  }

  // src/message-decoder.mjs
  function createMessageDecoder({ maxUnits = 1e5, maxCharacters = 2 * 1024 * 1024, maxDepth = 64, timeoutMs = 3e4, now = Date.now } = {}) {
    const transfers = /* @__PURE__ */ new Map();
    const diagnostics = { incomplete: 0, rejected: 0, completed: 0 };
    function reject(id) {
      transfers.delete(id);
      diagnostics.rejected++;
      return null;
    }
    function receive(message) {
      const time = now();
      for (const [id2, state2] of transfers) if (time - state2.updatedAt > timeoutMs) {
        transfers.delete(id2);
        diagnostics.incomplete++;
      }
      if (message?.marker !== "codex-host-chunked-message-v1") return message;
      const { transferId: id, sequence, kind } = message;
      if (typeof id !== "string" || id.length > 200 || !Number.isSafeInteger(sequence) || sequence < 0) return reject(id);
      if (kind === "start") {
        diagnostics.incomplete += transfers.size;
        transfers.clear();
        transfers.set(id, { next: sequence + 1, stack: [], root: void 0, hasRoot: false, chunks: null, target: null, units: 0, characters: 0, updatedAt: time });
        return null;
      }
      const state = transfers.get(id);
      if (!state || sequence !== state.next) return reject(id);
      state.next++;
      state.updatedAt = time;
      const addText = (value) => {
        if (typeof value !== "string") throw new Error("\u5E8F\u5217\u5316\u6587\u672C\u7C7B\u578B\u65E0\u6548");
        state.characters += value.length;
        if (state.characters > maxCharacters) throw new Error("\u5206\u7247\u6587\u672C\u8D85\u51FA\u89C2\u5BDF\u9884\u7B97");
        return value;
      };
      const setKey = (key) => {
        const parent = state.stack.at(-1);
        if (!parent || parent.type !== "object" || parent.key !== null) throw new Error("\u5BF9\u8C61\u952E\u987A\u5E8F\u65E0\u6548");
        parent.key = key;
      };
      const save = (value) => {
        const parent = state.stack.at(-1);
        if (!parent) {
          if (state.hasRoot) throw new Error("\u91CD\u590D\u6839\u5BF9\u8C61");
          state.root = value;
          state.hasRoot = true;
        } else if (parent.type === "array") parent.value.push(value);
        else {
          if (parent.key === null) throw new Error("\u5BF9\u8C61\u503C\u7F3A\u5C11\u952E");
          Object.defineProperty(parent.value, parent.key, { configurable: true, enumerable: true, writable: true, value });
          parent.key = null;
        }
      };
      try {
        if (kind === "chunk") {
          if (!Array.isArray(message.tokens) || state.units + message.tokens.length > maxUnits) throw new Error("\u5206\u7247\u5355\u5143\u8D85\u51FA\u89C2\u5BDF\u9884\u7B97");
          state.units += message.tokens.length;
          for (const unit of message.tokens) {
            if (!unit || typeof unit !== "object") throw new Error("\u5E8F\u5217\u5316\u5355\u5143\u65E0\u6548");
            switch (unit.type) {
              case "array-start":
              case "object-start": {
                if (state.chunks || state.stack.length >= maxDepth) throw new Error("\u5D4C\u5957\u6DF1\u5EA6\u8D85\u9650");
                const value = unit.type === "array-start" ? [] : {};
                save(value);
                state.stack.push({ type: unit.type === "array-start" ? "array" : "object", value, key: null });
                break;
              }
              case "container-end": {
                const parent = state.stack.pop();
                if (!parent || parent.key !== null || state.chunks) throw new Error("\u5BB9\u5668\u672A\u5B8C\u6210");
                break;
              }
              case "key":
                setKey(addText(unit.value));
                break;
              case "value":
                if (state.chunks || !(unit.value == null || ["string", "boolean", "number"].includes(typeof unit.value))) throw new Error("\u975E\u6807\u91CF\u5E8F\u5217\u5316\u503C");
                save(typeof unit.value === "string" ? addText(unit.value) : unit.value);
                break;
              case "string-start":
                if (state.chunks || !["key", "value"].includes(unit.target)) throw new Error("\u5B57\u7B26\u4E32\u8D77\u59CB\u65E0\u6548");
                state.chunks = [];
                state.target = unit.target;
                break;
              case "string-chunk":
                if (!state.chunks) throw new Error("\u5B57\u7B26\u4E32\u7F3A\u5C11\u8D77\u59CB");
                state.chunks.push(addText(unit.value));
                break;
              case "string-end": {
                if (!state.chunks) throw new Error("\u5B57\u7B26\u4E32\u7F3A\u5C11\u8D77\u59CB");
                const value = state.chunks.join("");
                state.target === "key" ? setKey(value) : save(value);
                state.chunks = null;
                state.target = null;
                break;
              }
              default:
                throw new Error("\u672A\u77E5\u5E8F\u5217\u5316\u5355\u5143");
            }
          }
          return null;
        }
        if (kind !== "end" || !state.hasRoot || state.stack.length || state.chunks) throw new Error("\u4F20\u8F93\u672A\u5B8C\u6210");
        transfers.delete(id);
        diagnostics.completed++;
        return state.root;
      } catch {
        return reject(id);
      }
    }
    return { receive, inspect: () => ({ ...diagnostics, pending: transfers.size }), dispose: () => transfers.clear() };
  }

  // src/page-adapter.mjs
  function discoverRuntimeEntries(pageWindow) {
    const current = new URL(pageWindow.location.href);
    return [...new Set([...pageWindow.document.scripts].flatMap((script) => {
      if (!script.src || script.type !== "module") return [];
      try {
        const url = new URL(script.src, current);
        return url.protocol === current.protocol && url.host === current.host && /\.(?:m?js)$/.test(url.pathname) ? [url.href] : [];
      } catch {
        return [];
      }
    }))].slice(0, 8);
  }
  async function connectPageAdapter({ pageWindow = window, importRuntime = (url) => import(url) } = {}) {
    let require2 = null;
    for (const url of discoverRuntimeEntries(pageWindow)) {
      try {
        const runtime = await importRuntime(url);
        if (runtime.__webpack_require__?.c) {
          require2 = runtime.__webpack_require__;
          break;
        }
      } catch {
      }
    }
    if (!require2) throw new Error("\u5F53\u524D\u9875\u9762\u5165\u53E3\u5C1A\u672A\u63D0\u4F9B\u53EF\u8BFB\u53D6\u7684\u6A21\u5757\u7F13\u5B58\u3002");
    const cached = (id) => require2?.c?.[id]?.exports;
    const required = ["OWtl", "GNwQ", "nlNF", "gp55", "V3rO"];
    const modulesReady = () => required.every((id) => cached(id) != null);
    let wrapperCache = null;
    let disposed = false;
    const removers = /* @__PURE__ */ new Set();
    function findScope() {
      if (!modulesReady()) return null;
      const definition = cached("OWtl").u;
      const wrap = cached("GNwQ").GB;
      const footer = [...pageWindow.document.querySelectorAll("[data-composer-footer-responsive], .ComposerFooter-WlpjXt")].find((element2) => {
        if (!element2.isConnected || element2.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        if (element2.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) === false) return false;
        const rect = element2.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!definition?.id || typeof wrap !== "function" || !footer) return null;
      let element = footer;
      for (let depth = 0; element && depth < 12; depth++, element = element.parentElement) {
        const key = Object.getOwnPropertyNames(element).find((name) => name.startsWith("__reactFiber$"));
        let fiber = key ? element[key] : null;
        const seen = /* @__PURE__ */ new Set();
        for (let count = 0; fiber && count < 150 && !seen.has(fiber); count++, fiber = fiber.return) {
          seen.add(fiber);
          const chain = fiber.memoizedProps?.value;
          if (!(chain instanceof pageWindow.Map) || !chain.has(definition.id)) continue;
          const node = chain.get(definition.id);
          if (!node) continue;
          if (wrapperCache?.chain === chain && wrapperCache.node === node) return wrapperCache.get;
          const wrapper = wrap(definition, chain, node);
          if (typeof wrapper?.get !== "function") continue;
          wrapperCache = { chain, node, get: wrapper.get };
          return wrapper.get;
        }
      }
      return null;
    }
    function readActiveIdentity() {
      if (disposed) return { status: "disposed", threadId: null, hostId: null };
      if (!modulesReady()) return { status: "modules-not-loaded", threadId: null, hostId: null };
      try {
        const get = findScope();
        if (!get) return { status: "mounted-scope-not-found", threadId: null, hostId: null };
        const location = get(cached("nlNF").x2);
        const route = parseLocalThreadRoute(location);
        if (!route) return { status: "unsupported-route", threadId: null, hostId: null };
        const selected = cached("gp55").oE(get);
        if (!selected || !isCoreThreadId(selected.id) || typeof selected.hostId !== "string" || !selected.hostId) {
          return { status: route.routeKind === "client-local-thread" ? "alias-unresolved" : "identity-unresolved", threadId: null, hostId: null };
        }
        if (route.hostId && route.hostId !== selected.hostId) return { status: "host-conflict", threadId: null, hostId: null };
        const mapped = route.routeKind === "client-local-thread" ? get(cached("V3rO").Tl, route.clientThreadId) : route.threadId;
        if (mapped !== selected.id) return { status: "identity-conflict", threadId: null, hostId: null };
        return { status: "resolved", threadId: selected.id, hostId: selected.hostId, source: "mounted-app-scope", routeKind: route.routeKind };
      } catch {
        return { status: "scope-read-failed", threadId: null, hostId: null };
      }
    }
    function subscribeMessages(listener) {
      const dispatcher = cached("TL6G")?.O1;
      let remove;
      if (typeof dispatcher?.interceptHostMessages === "function") {
        remove = dispatcher.interceptHostMessages((message) => {
          try {
            listener(message);
          } catch {
          }
          return false;
        });
      } else {
        const decoder = createMessageDecoder();
        const handler = (event) => {
          if (event.source != null && event.source !== pageWindow) return;
          if (event.source === pageWindow && event.origin && event.origin !== pageWindow.location.origin) return;
          try {
            const message = decoder.receive(event.data);
            if (message) listener(message);
          } catch {
          }
        };
        pageWindow.addEventListener("message", handler);
        remove = () => {
          pageWindow.removeEventListener("message", handler);
          decoder.dispose();
        };
      }
      let removed = false;
      const cleanup = () => {
        if (!removed) {
          removed = true;
          remove();
          removers.delete(cleanup);
        }
      };
      removers.add(cleanup);
      return cleanup;
    }
    return {
      readActiveIdentity,
      subscribeMessages,
      inspect: () => ({ modulesReady: modulesReady(), source: "loaded-module-cache-and-mounted-scope", active: readActiveIdentity() }),
      dispose() {
        disposed = true;
        for (const remove of [...removers]) remove();
        wrapperCache = null;
      }
    };
  }

  // src/api-prices.json
  var api_prices_default = {
    version: "2026-11-09",
    verifiedOn: "2026-11-09",
    currency: "USD",
    unitTokens: 1e6,
    source: "https://developers.openai.com/api/docs/pricing",
    sourceSha256: "f1ade44afc62fd8a12dd6e199bcecaa989a94c9b691aa620a34e1504ff62ff57",
    cacheSource: "https://developers.openai.com/api/docs/guides/prompt-caching",
    basis: "current-published-api-token-prices",
    aliases: {},
    models: {
      "gpt-4.1": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "2.00",
              output: "8.00",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "1.00",
              output: "4.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "3.50",
              output: "14.00",
              cachedInput: "0.875",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-4.1-mini": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.40",
              output: "1.60",
              cachedInput: "0.10",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.20",
              output: "0.80",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "0.70",
              output: "2.80",
              cachedInput: "0.175",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-4o": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "2.50",
              output: "10.00",
              cachedInput: "1.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "1.25",
              output: "5.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "4.25",
              output: "17.00",
              cachedInput: "2.125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-4o-mini": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.15",
              output: "0.60",
              cachedInput: "0.075",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.075",
              output: "0.30",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "0.25",
              output: "1.00",
              cachedInput: "0.125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "1.25",
              output: "10.00",
              cachedInput: "0.125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.625",
              output: "5.00",
              cachedInput: "0.0625",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.625",
              output: "5.00",
              cachedInput: "0.0625",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "2.50",
              output: "20.00",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5-mini": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.25",
              output: "2.00",
              cachedInput: "0.025",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.125",
              output: "1.00",
              cachedInput: "0.0125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.125",
              output: "1.00",
              cachedInput: "0.0125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "0.45",
              output: "3.60",
              cachedInput: "0.045",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5-nano": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.05",
              output: "0.40",
              cachedInput: "0.005",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.025",
              output: "0.20",
              cachedInput: "0.0025",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.025",
              output: "0.20",
              cachedInput: "0.0025",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5-pro": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "15.00",
              output: "120.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "7.50",
              output: "60.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.1": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "1.25",
              output: "10.00",
              cachedInput: "0.125",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.625",
              output: "5.00",
              cachedInput: "0.0625",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.625",
              output: "5.00",
              cachedInput: "0.0625",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "2.50",
              output: "20.00",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.2": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "1.75",
              output: "14.00",
              cachedInput: "0.175",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.875",
              output: "7.00",
              cachedInput: "0.0875",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.875",
              output: "7.00",
              cachedInput: "0.0875",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "3.50",
              output: "28.00",
              cachedInput: "0.35",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.2-pro": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "21.00",
              output: "168.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "10.50",
              output: "84.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.3-codex": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "1.75",
              output: "14.00",
              cachedInput: "0.175",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "3.50",
              output: "28.00",
              cachedInput: "0.35",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.4": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "2.50",
              output: "15.00",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "5.00",
              output: "22.50",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "1.25",
              output: "7.50",
              cachedInput: "0.13",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "2.50",
              output: "11.25",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "1.25",
              output: "7.50",
              cachedInput: "0.13",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "2.50",
              output: "11.25",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "5.00",
              output: "30.00",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: null,
              output: null,
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          }
        }
      },
      "gpt-5.4-mini": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.75",
              output: "4.50",
              cachedInput: "0.075",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.375",
              output: "2.25",
              cachedInput: "0.0375",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.375",
              output: "2.25",
              cachedInput: "0.0375",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          fast: {
            contextThreshold: null,
            short: {
              input: "1.50",
              output: "9.00",
              cachedInput: "0.15",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.4-nano": {
        tiers: {
          standard: {
            contextThreshold: null,
            short: {
              input: "0.20",
              output: "1.25",
              cachedInput: "0.02",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          batch: {
            contextThreshold: null,
            short: {
              input: "0.10",
              output: "0.625",
              cachedInput: "0.01",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          },
          flex: {
            contextThreshold: null,
            short: {
              input: "0.10",
              output: "0.625",
              cachedInput: "0.01",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: null
          }
        }
      },
      "gpt-5.4-pro": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "30.00",
              output: "180.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "60.00",
              output: "270.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "15.00",
              output: "90.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "30.00",
              output: "135.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "15.00",
              output: "90.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "30.00",
              output: "135.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          }
        }
      },
      "gpt-5.5": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "5.00",
              output: "30.00",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "10.00",
              output: "45.00",
              cachedInput: "1.00",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "2.50",
              output: "15.00",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "5.00",
              output: "22.50",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "2.50",
              output: "15.00",
              cachedInput: "0.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "5.00",
              output: "22.50",
              cachedInput: "0.50",
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "12.50",
              output: "75.00",
              cachedInput: "1.25",
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: null,
              output: null,
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          }
        }
      },
      "gpt-5.5-pro": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "30.00",
              output: "180.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: "60.00",
              output: "270.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "15.00",
              output: "90.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: null,
              output: null,
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "15.00",
              output: "90.00",
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            },
            long: {
              input: null,
              output: null,
              cachedInput: null,
              cacheWrite30m: null,
              cacheWrite12h: null
            }
          }
        }
      },
      "gpt-5.6-luna": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "0.20",
              output: "1.20",
              cachedInput: "0.02",
              cacheWrite30m: "0.25",
              cacheWrite12h: "0.50"
            },
            long: {
              input: "0.40",
              output: "1.80",
              cachedInput: "0.04",
              cacheWrite30m: "0.50",
              cacheWrite12h: "1.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "0.10",
              output: "0.60",
              cachedInput: "0.01",
              cacheWrite30m: "0.125",
              cacheWrite12h: "0.25"
            },
            long: {
              input: "0.20",
              output: "0.90",
              cachedInput: "0.02",
              cacheWrite30m: "0.25",
              cacheWrite12h: "0.50"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "0.10",
              output: "0.60",
              cachedInput: "0.01",
              cacheWrite30m: "0.125",
              cacheWrite12h: "0.25"
            },
            long: {
              input: "0.20",
              output: "0.90",
              cachedInput: "0.02",
              cacheWrite30m: "0.25",
              cacheWrite12h: "0.50"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "0.40",
              output: "2.40",
              cachedInput: "0.04",
              cacheWrite30m: "0.50",
              cacheWrite12h: "1.00"
            },
            long: {
              input: "0.80",
              output: "3.60",
              cachedInput: "0.08",
              cacheWrite30m: "1.00",
              cacheWrite12h: "2.00"
            }
          }
        }
      },
      "gpt-5.6-sol": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "4.00",
              output: "20.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            },
            long: {
              input: "8.00",
              output: "30.00",
              cachedInput: "0.80",
              cacheWrite30m: "10.00",
              cacheWrite12h: "20.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "10.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "15.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "10.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "15.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "8.00",
              output: "40.00",
              cachedInput: "0.80",
              cacheWrite30m: "10.00",
              cacheWrite12h: "20.00"
            },
            long: {
              input: "16.00",
              output: "60.00",
              cachedInput: "1.60",
              cacheWrite30m: "20.00",
              cacheWrite12h: "40.00"
            }
          }
        }
      },
      "gpt-5.6-terra": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "12.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "18.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "6.00",
              cachedInput: "0.10",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "9.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "6.00",
              cachedInput: "0.10",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "9.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "4.00",
              output: "24.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            },
            long: {
              input: "8.00",
              output: "36.00",
              cachedInput: "0.80",
              cacheWrite30m: "10.00",
              cacheWrite12h: "20.00"
            }
          }
        }
      },
      "gpt-6-astra": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "10.00",
              output: "50.00",
              cachedInput: "1.00",
              cacheWrite30m: "12.50",
              cacheWrite12h: "25.00"
            },
            long: {
              input: "20.00",
              output: "75.00",
              cachedInput: "2.00",
              cacheWrite30m: "25.00",
              cacheWrite12h: "50.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "5.00",
              output: "25.00",
              cachedInput: "0.50",
              cacheWrite30m: "6.25",
              cacheWrite12h: "12.50"
            },
            long: {
              input: "10.00",
              output: "37.50",
              cachedInput: "1.00",
              cacheWrite30m: "12.50",
              cacheWrite12h: "25.00"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "5.00",
              output: "25.00",
              cachedInput: "0.50",
              cacheWrite30m: "6.25",
              cacheWrite12h: "12.50"
            },
            long: {
              input: "10.00",
              output: "37.50",
              cachedInput: "1.00",
              cacheWrite30m: "12.50",
              cacheWrite12h: "25.00"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "20.00",
              output: "100.00",
              cachedInput: "2.00",
              cacheWrite30m: "25.00",
              cacheWrite12h: "50.00"
            },
            long: {
              input: "40.00",
              output: "150.00",
              cachedInput: "4.00",
              cacheWrite30m: "50.00",
              cacheWrite12h: "100.00"
            }
          },
          ultrafast: {
            contextThreshold: 272e3,
            short: {
              input: "60.00",
              output: "300.00",
              cachedInput: "6.00",
              cacheWrite30m: "75.00",
              cacheWrite12h: "150.00"
            },
            long: {
              input: "120.00",
              output: "450.00",
              cachedInput: "12.00",
              cacheWrite30m: "150.00",
              cacheWrite12h: "300.00"
            }
          }
        }
      },
      "gpt-6-luna": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "0.10",
              output: "0.50",
              cachedInput: "0.01",
              cacheWrite30m: "0.125",
              cacheWrite12h: "0.25"
            },
            long: {
              input: "0.20",
              output: "0.75",
              cachedInput: "0.02",
              cacheWrite30m: "0.25",
              cacheWrite12h: "0.50"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "0.05",
              output: "0.25",
              cachedInput: "0.005",
              cacheWrite30m: "0.0625",
              cacheWrite12h: "0.125"
            },
            long: {
              input: "0.10",
              output: "0.375",
              cachedInput: "0.01",
              cacheWrite30m: "0.125",
              cacheWrite12h: "0.25"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "0.05",
              output: "0.25",
              cachedInput: "0.005",
              cacheWrite30m: "0.0625",
              cacheWrite12h: "0.125"
            },
            long: {
              input: "0.10",
              output: "0.375",
              cachedInput: "0.01",
              cacheWrite30m: "0.125",
              cacheWrite12h: "0.25"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "0.20",
              output: "1.00",
              cachedInput: "0.02",
              cacheWrite30m: "0.25",
              cacheWrite12h: "0.50"
            },
            long: {
              input: "0.40",
              output: "1.50",
              cachedInput: "0.04",
              cacheWrite30m: "0.50",
              cacheWrite12h: "1.00"
            }
          }
        }
      },
      "gpt-6-sol": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "10.00",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "15.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "5.00",
              cachedInput: "0.10",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "7.50",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "5.00",
              cachedInput: "0.10",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "7.50",
              cachedInput: "0.20",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "4.00",
              output: "20.00",
              cachedInput: "0.40",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            },
            long: {
              input: "8.00",
              output: "30.00",
              cachedInput: "0.80",
              cacheWrite30m: "10.00",
              cacheWrite12h: "20.00"
            }
          }
        }
      },
      "gpt-6.1-sol": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "10.00",
              cachedInput: "0.10",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "15.00",
              cachedInput: "0.20",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "5.00",
              cachedInput: "0.05",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "7.50",
              cachedInput: "0.10",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "5.00",
              cachedInput: "0.05",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "7.50",
              cachedInput: "0.10",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "4.00",
              output: "20.00",
              cachedInput: "0.20",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            },
            long: {
              input: "8.00",
              output: "30.00",
              cachedInput: "0.40",
              cacheWrite30m: "10.00",
              cacheWrite12h: "20.00"
            }
          },
          ultrafast: {
            contextThreshold: 272e3,
            short: {
              input: "12.00",
              output: "60.00",
              cachedInput: "0.60",
              cacheWrite30m: "15.00",
              cacheWrite12h: "30.00"
            },
            long: {
              input: "24.00",
              output: "90.00",
              cachedInput: "1.20",
              cacheWrite30m: "30.00",
              cacheWrite12h: "60.00"
            }
          }
        }
      },
      "gpt-6.1-terra": {
        tiers: {
          standard: {
            contextThreshold: 272e3,
            short: {
              input: "1.00",
              output: "5.00",
              cachedInput: "0.05",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            },
            long: {
              input: "2.00",
              output: "7.50",
              cachedInput: "0.10",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            }
          },
          batch: {
            contextThreshold: 272e3,
            short: {
              input: "0.50",
              output: "2.50",
              cachedInput: "0.025",
              cacheWrite30m: "0.625",
              cacheWrite12h: "1.25"
            },
            long: {
              input: "1.00",
              output: "3.75",
              cachedInput: "0.05",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            }
          },
          flex: {
            contextThreshold: 272e3,
            short: {
              input: "0.50",
              output: "2.50",
              cachedInput: "0.025",
              cacheWrite30m: "0.625",
              cacheWrite12h: "1.25"
            },
            long: {
              input: "1.00",
              output: "3.75",
              cachedInput: "0.05",
              cacheWrite30m: "1.25",
              cacheWrite12h: "2.50"
            }
          },
          fast: {
            contextThreshold: 272e3,
            short: {
              input: "2.00",
              output: "10.00",
              cachedInput: "0.10",
              cacheWrite30m: "2.50",
              cacheWrite12h: "5.00"
            },
            long: {
              input: "4.00",
              output: "15.00",
              cachedInput: "0.20",
              cacheWrite30m: "5.00",
              cacheWrite12h: "10.00"
            }
          }
        }
      }
    }
  };

  // src/api-cost.mjs
  var PRICE_CATALOG = api_prices_default;
  var COST_USAGE_FIELDS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens"];
  var valid = (value) => Number.isSafeInteger(value) && value >= 0;
  var tierNames = { standard: "standard", default: "standard", fast: "fast", priority: "fast", flex: "flex", batch: "batch", ultrafast: "ultrafast" };
  var amount = (min, max = min) => ({ minPicoUsd: min.toString(), maxPicoUsd: max.toString() });
  function rateUnits(value) {
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  }
  function priceResponse({ model, provider, serviceTier, usage } = {}) {
    const fail = (reason) => ({ amount: null, reason, model: typeof model === "string" ? model : null });
    if (provider !== "openai") return fail(provider ? "custom-provider" : "provider-unknown");
    const id = Object.hasOwn(api_prices_default.aliases, model ?? "") ? api_prices_default.aliases[model] : model;
    const item = Object.hasOwn(api_prices_default.models, id ?? "") ? api_prices_default.models[id] : null;
    if (!item) return fail(model ? "model-unpriced" : "model-unknown");
    if (!usage || COST_USAGE_FIELDS.some((key) => !valid(usage[key]))) return fail("usage-incomplete");
    const { input_tokens: input, cached_input_tokens: read, cache_write_input_tokens: write, output_tokens: output } = usage;
    if (BigInt(read) + BigInt(write) > BigInt(input) || usage.reasoning_output_tokens != null && (!valid(usage.reasoning_output_tokens) || usage.reasoning_output_tokens > output) || usage.total_tokens != null && (!valid(usage.total_tokens) || BigInt(usage.total_tokens) !== BigInt(input) + BigInt(output))) return fail("usage-invalid");
    const assumedTier = serviceTier == null || serviceTier === "auto";
    const tier = assumedTier ? "standard" : Object.hasOwn(tierNames, serviceTier) ? tierNames[serviceTier] : null;
    const schedule = tier ? item.tiers[tier] : null;
    if (!schedule) return fail("tier-unpriced");
    const long = schedule.contextThreshold != null && input > schedule.contextThreshold;
    const rates = long ? schedule.long : schedule.short;
    if (!rates?.input || !rates?.output) return fail("context-unpriced");
    const charge = (tokens, rate) => tokens === 0 ? 0n : rateUnits(rate) == null ? null : BigInt(tokens) * rateUnits(rate);
    const inputCost = charge(input - read - write, rates.input), readCost = charge(read, rates.cachedInput), outputCost = charge(output, rates.output);
    if ([inputCost, readCost, outputCost].includes(null)) return fail("component-unpriced");
    let writeMin = 0n, writeMax = 0n, writeAssumed = false;
    if (write > 0) {
      const details = usage.cache_write_input_tokens_details ?? usage.input_tokens_details?.cache_write_tokens_details;
      if (details != null) {
        const a = details.ttl_30m_tokens, b = details.ttl_12h_tokens;
        if (!valid(a) || !valid(b) || BigInt(a) + BigInt(b) !== BigInt(write)) return fail("write-details-invalid");
        const x = charge(a, rates.cacheWrite30m), y = charge(b, rates.cacheWrite12h);
        if (x == null || y == null) return fail("component-unpriced");
        writeMin = writeMax = x + y;
      } else {
        const x = charge(write, rates.cacheWrite30m), y = charge(write, rates.cacheWrite12h);
        if (x == null || y == null) return fail("component-unpriced");
        writeMin = x < y ? x : y;
        writeMax = x > y ? x : y;
        writeAssumed = true;
      }
    }
    const ordinary = inputCost + readCost + outputCost;
    return {
      amount: amount(ordinary + writeMin, ordinary + writeMax),
      components: { input: amount(inputCost), cacheRead: amount(readCost), cacheWrite: amount(writeMin, writeMax), output: amount(outputCost) },
      model: id,
      provider,
      tier,
      context: long ? "long" : schedule.contextThreshold == null ? "flat" : "short",
      rates,
      assumptions: [...assumedTier ? ["tier-standard-assumed"] : [], ...writeAssumed ? ["write-ttl-unknown"] : []]
    };
  }
  function sums(entries) {
    return Object.fromEntries(COST_USAGE_FIELDS.map((key) => [key, entries.every((e) => valid(e.usage?.[key])) ? entries.reduce((sum, e) => sum + BigInt(e.usage[key]), 0n).toString() : null]));
  }
  function summarizeCosts(entries, expectedUsage, extraReasons = []) {
    const observed = sums(entries), reasons = new Map(extraReasons.map((key) => [key, 1]));
    const addReason = (key) => reasons.set(key, (reasons.get(key) ?? 0) + 1);
    const components = Object.fromEntries(["input", "cacheRead", "cacheWrite", "output"].map((key) => [key, { min: 0n, max: 0n }]));
    let min = 0n, max = 0n, priced = 0;
    const models = /* @__PURE__ */ new Map(), assumptions = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const result = entry.forcedReason ? { reason: entry.forcedReason } : priceResponse(entry);
      if (!result.amount) {
        addReason(result.reason);
        continue;
      }
      priced++;
      min += BigInt(result.amount.minPicoUsd);
      max += BigInt(result.amount.maxPicoUsd);
      for (const [key, value] of Object.entries(result.components)) {
        components[key].min += BigInt(value.minPicoUsd);
        components[key].max += BigInt(value.maxPicoUsd);
      }
      for (const key of result.assumptions) assumptions.add(key);
      const groupKey = JSON.stringify([result.model, result.tier, result.context]);
      if (!models.has(groupKey)) models.set(groupKey, { model: result.model, tier: result.tier, context: result.context, rates: result.rates, responses: 0, min: 0n, max: 0n });
      const group = models.get(groupKey);
      group.responses++;
      group.min += BigInt(result.amount.minPicoUsd);
      group.max += BigInt(result.amount.maxPicoUsd);
    }
    const matched = entries.length > 0 && COST_USAGE_FIELDS.every((key) => valid(expectedUsage?.[key]) && observed[key] === String(expectedUsage[key]));
    if (!matched) addReason(expectedUsage ? "history-incomplete" : "total-unverified");
    return {
      amount: priced ? amount(min, max) : null,
      pricedResponses: priced,
      unpricedResponses: entries.length - priced,
      responseCount: entries.length,
      complete: matched && priced === entries.length && extraReasons.length === 0,
      components: priced ? Object.fromEntries(Object.entries(components).map(([key, value]) => [key, amount(value.min, value.max)])) : null,
      models: [...models.values()].map(({ min: a, max: b, ...group }) => ({ ...group, amount: amount(a, b) })),
      assumptions: [...assumptions],
      reasons: [...reasons].map(([key, count]) => ({ key, count })),
      coverage: { matched, observedUsage: observed, expectedUsage: expectedUsage ?? null }
    };
  }
  function reconcileCostSummary(summary, expectedUsage) {
    if (!summary) return null;
    const matched = summary.responseCount > 0 && COST_USAGE_FIELDS.every((key) => valid(expectedUsage?.[key]) && summary.coverage?.observedUsage?.[key] === String(expectedUsage[key]));
    if (matched) return summary;
    return {
      ...summary,
      complete: false,
      reasons: [...summary.reasons.filter((r) => r.key !== "runtime-gap"), { key: "runtime-gap", count: 1 }],
      coverage: { ...summary.coverage, matched: false, expectedUsage: expectedUsage ?? null }
    };
  }

  // src/cost-accumulator.mjs
  var valid2 = (value) => Number.isSafeInteger(value) && value >= 0;
  var copy = (value) => value == null ? null : structuredClone(value);
  var usageOf = (value) => value && typeof value === "object" ? Object.fromEntries([
    ...COST_USAGE_FIELDS,
    "total_tokens",
    "reasoning_output_tokens",
    "cache_write_input_tokens_details",
    "input_tokens_details"
  ].filter((key) => Object.hasOwn(value, key)).map((key) => [key, copy(value[key])])) : null;
  function createCostAccumulator() {
    let provider = null, expected = null, currentTurnId = null, lastTurnId = null;
    let reset = false, inherited = false, revision = 0, cachedRevision = -1, cached = null;
    const contexts = /* @__PURE__ */ new Map(), responses = /* @__PURE__ */ new Map(), turnExpected = /* @__PURE__ */ new Map();
    function consume(record) {
      const p = record.payload ?? {};
      if (record.type === "session_meta") {
        provider = typeof p.model_provider === "string" ? p.model_provider : null;
        inherited = !!(p.forked_from_id || p.forked_from || p.parent_thread_id || p.thread_source === "fork");
        revision++;
        return;
      }
      if (record.type === "turn_context") {
        if (typeof p.turn_id === "string") contexts.set(p.turn_id, {
          model: typeof p.model === "string" ? p.model : null,
          provider: typeof p.model_provider === "string" ? p.model_provider : provider,
          serviceTier: p.service_tier ?? null
        });
        revision++;
        return;
      }
      if (record.type === "event_msg" && ["task_started", "task_complete"].includes(p.type)) {
        const id = p.turn_id ?? p.root_turn_id;
        if (p.type === "task_started") currentTurnId = id ?? null;
        else {
          lastTurnId = id ?? currentTurnId;
          if (currentTurnId === lastTurnId) currentTurnId = null;
        }
        revision++;
        return;
      }
      if (record.type !== "token_usage_record") return;
      const turnId = p.turn_id ?? null;
      const key = typeof p.response_id === "string" && p.response_id ? p.response_id : JSON.stringify(["unidentified", turnId, p.thread_token_usage ?? null, p.usage ?? null]);
      let previous = responses.get(key);
      const nextTotal = usageOf(p.thread_token_usage);
      if (!previous && expected && nextTotal && COST_USAGE_FIELDS.some((field) => valid2(expected[field]) && valid2(nextTotal[field]) && nextTotal[field] < expected[field])) {
        responses.clear();
        turnExpected.clear();
        reset = true;
        previous = null;
      }
      if (nextTotal) expected = nextTotal;
      if (p.turn_token_usage && turnId) turnExpected.set(turnId, usageOf(p.turn_token_usage));
      const context = previous ?? contexts.get(turnId) ?? {};
      const entry = {
        model: typeof p.model === "string" ? p.model : context.model ?? null,
        provider: typeof p.model_provider === "string" ? p.model_provider : context.provider ?? provider,
        serviceTier: p.service_tier ?? context.serviceTier ?? null,
        turnId,
        usage: usageOf(p.usage),
        forcedReason: !p.response_id ? "response-id-missing" : previous && previous.turnId !== turnId ? "response-conflict" : previous?.forcedReason ?? null
      };
      if (previous && (p.model && previous.model && p.model !== previous.model || p.model_provider && previous.provider && p.model_provider !== previous.provider)) entry.forcedReason = "response-conflict";
      responses.set(key, entry);
      if (!currentTurnId && lastTurnId !== turnId) currentTurnId = turnId;
      revision++;
    }
    function snapshot() {
      if (cachedRevision === revision) return cached;
      const entries = [...responses.values()];
      const reasons = [...reset ? ["counter-reset"] : [], ...inherited ? ["inherited-history"] : []];
      const turn = (id) => id ? { turnId: id, ...summarizeCosts(entries.filter((entry) => entry.turnId === id), turnExpected.get(id), reasons) } : null;
      cached = {
        currency: "USD",
        scale: 12,
        priceVersion: PRICE_CATALOG.version,
        source: PRICE_CATALOG.source,
        sourceKind: "verified-response-records",
        total: summarizeCosts(entries, expected, reasons),
        currentTurn: turn(currentTurnId),
        lastTurn: turn(lastTurnId)
      };
      cachedRevision = revision;
      return cached;
    }
    return { consume, snapshot };
  }

  // src/metrics.mjs
  var USAGE_FIELDS = [
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens"
  ];
  var validNumber = (value) => Number.isSafeInteger(value) && value >= 0;
  var clone = (value) => value == null ? null : structuredClone(value);
  var emptyUsage = () => Object.fromEntries(USAGE_FIELDS.map((key) => [key, 0]));
  function normalizeUsage(value) {
    if (!value || typeof value !== "object") return null;
    const result = Object.fromEntries(USAGE_FIELDS.map((key) => [key, validNumber(value[key]) ? value[key] : null]));
    if (result.total_tokens == null && result.input_tokens != null && result.output_tokens != null) {
      result.total_tokens = result.input_tokens + result.output_tokens;
    }
    return result.input_tokens == null && result.output_tokens == null ? null : result;
  }
  function cacheHitRate(usage) {
    if (!usage || !(usage.input_tokens > 0) || usage.cached_input_tokens == null) return null;
    return usage.cached_input_tokens / usage.input_tokens * 100;
  }
  function addUsage(values) {
    if (!values.length) return null;
    return Object.fromEntries(USAGE_FIELDS.map((key) => [
      key,
      values.every((value) => value[key] != null) ? values.reduce((sum, value) => sum + value[key], 0) : null
    ]));
  }
  function subtractUsage(total, baseline) {
    if (!total || !baseline) return null;
    const value = Object.fromEntries(USAGE_FIELDS.map((key) => [
      key,
      total[key] != null && baseline[key] != null && total[key] >= baseline[key] ? total[key] - baseline[key] : null
    ]));
    return value.input_tokens == null || value.output_tokens == null ? null : value;
  }
  function toTime(value, numericUnit) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (numericUnit === "seconds") return value * 1e3;
      if (numericUnit === "milliseconds") return value;
      return null;
    }
    const parsed = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  function usageKey(usage) {
    return usage ? USAGE_FIELDS.map((key) => usage[key] ?? "?").join(":") : null;
  }
  var turnUsage = (turn) => turn.officialUsage ?? turn.deltaUsage ?? addUsage([...turn.responses.values()].map((response) => response.usage));
  function publicTurn(turn) {
    if (!turn) return null;
    const usage = turnUsage(turn);
    return {
      id: turn.id,
      usage: clone(usage),
      cacheHitRate: cacheHitRate(usage),
      responseCount: turn.responses.size,
      status: turn.status,
      startedAtMs: turn.startedAtMs,
      completedAtMs: turn.completedAtMs,
      durationMs: turn.durationMs,
      timeToFirstTokenMs: turn.timeToFirstTokenMs,
      usageUpdatedAtMs: turn.usageUpdatedAtMs,
      coverage: turn.officialUsage || turn.deltaUsage ? "complete" : "observed-responses-only"
    };
  }
  function responseSpeed(response, timing) {
    if (!response || !timing || !(timing.completedAtMs > timing.startedAtMs) || response.usage.output_tokens == null) return null;
    return {
      value: response.usage.output_tokens / ((timing.completedAtMs - timing.startedAtMs) / 1e3),
      unit: "t/s",
      basis: "response-output-including-reasoning",
      source: "explicit-response-timing",
      estimated: false,
      live: false,
      responseId: response.id,
      durationMs: timing.completedAtMs - timing.startedAtMs
    };
  }
  function createMetricsAccumulator({ threadId = null } = {}) {
    const costs = createCostAccumulator();
    let total = null;
    let currentTurnId = null;
    let lastTurnId = null;
    let latestResponse = null;
    let updatedAt = null;
    let totalUpdatedAt = null;
    let sawSessionMeta = false;
    let hasModernUsage = false;
    const turns = /* @__PURE__ */ new Map();
    const responseAliases = /* @__PURE__ */ new Map();
    const responseTimings = /* @__PURE__ */ new Map();
    const diagnostics = { malformedLines: 0, duplicateUsageEvents: 0, ignoredForeignThreadEvents: 0, ignoredLegacyUsageEvents: 0 };
    function getTurn(id) {
      if (!id) return null;
      if (!turns.has(id)) turns.set(id, {
        id,
        baseline: null,
        responses: /* @__PURE__ */ new Map(),
        officialUsage: null,
        deltaUsage: null,
        status: "running",
        startedAtMs: null,
        completedAtMs: null,
        durationMs: null,
        timeToFirstTokenMs: null,
        usageUpdatedAtMs: null
      });
      return turns.get(id);
    }
    function consume(record) {
      if (typeof record === "string") {
        try {
          record = JSON.parse(record);
        } catch {
          diagnostics.malformedLines++;
          return;
        }
      }
      if (!record || typeof record !== "object") return;
      const p = record.payload ?? {};
      if (record.type === "session_meta") {
        if (threadId && p.id && p.id !== threadId) {
          diagnostics.ignoredForeignThreadEvents++;
          return;
        }
        threadId ??= p.id ?? null;
        sawSessionMeta = true;
        costs.consume(record);
        return;
      }
      if (threadId && p.thread_id && p.thread_id !== threadId) {
        diagnostics.ignoredForeignThreadEvents++;
        return;
      }
      costs.consume(record);
      if (record.type === "event_msg" && p.type === "task_started") {
        currentTurnId = p.turn_id ?? p.root_turn_id ?? null;
        const turn2 = getTurn(currentTurnId);
        if (!turn2) return;
        if (turn2.startedAtMs == null) {
          turn2.startedAtMs = toTime(p.started_at, "seconds") ?? toTime(record.timestamp);
          turn2.baseline = clone(total ?? (sawSessionMeta ? emptyUsage() : null));
        }
        updatedAt = record.timestamp ?? updatedAt;
        return;
      }
      if (record.type === "event_msg" && p.type === "task_complete") {
        const id2 = p.turn_id ?? p.root_turn_id ?? currentTurnId;
        const turn2 = getTurn(id2);
        if (!turn2) return;
        turn2.status = "completed";
        turn2.completedAtMs = toTime(p.completed_at, "seconds") ?? toTime(record.timestamp);
        turn2.startedAtMs ??= toTime(p.started_at, "seconds");
        turn2.durationMs = validNumber(p.duration_ms) ? p.duration_ms : null;
        turn2.timeToFirstTokenMs = validNumber(p.time_to_first_token_ms) ? p.time_to_first_token_ms : null;
        lastTurnId = id2;
        if (currentTurnId === id2) currentTurnId = null;
        updatedAt = record.timestamp ?? updatedAt;
        return;
      }
      if (record.type === "response_timing" && p.response_id) {
        const startedAtMs = toTime(p.started_at_ms, "milliseconds");
        const completedAtMs = toTime(p.completed_at_ms, "milliseconds");
        if (startedAtMs != null && completedAtMs > startedAtMs) {
          responseTimings.set(p.response_id, { startedAtMs, completedAtMs });
        }
        return;
      }
      const isModern = record.type === "token_usage_record";
      const isLegacy = record.type === "event_msg" && p.type === "token_count";
      if (!isModern && !isLegacy) return;
      const nextTotal = normalizeUsage(isModern ? p.thread_token_usage : p.info?.total_token_usage);
      const responseUsage = normalizeUsage(isModern ? p.usage : p.info?.last_token_usage);
      if (isLegacy && hasModernUsage) {
        if (nextTotal && usageKey(nextTotal) === usageKey(total)) diagnostics.duplicateUsageEvents++;
        else diagnostics.ignoredLegacyUsageEvents++;
        return;
      }
      if (isModern && nextTotal) hasModernUsage = true;
      const previousTotal = total;
      if (nextTotal) {
        total = nextTotal;
        if (usageKey(nextTotal) !== usageKey(previousTotal)) totalUpdatedAt = record.timestamp ?? null;
      }
      const id = p.turn_id ?? currentTurnId;
      const turn = getTurn(id);
      const previousTurnUsage = turn ? usageKey(turnUsage(turn)) : null;
      if (id && currentTurnId == null && turn?.status !== "completed") currentTurnId = id;
      if (turn) {
        turn.deltaUsage = subtractUsage(total, turn.baseline);
        const officialTurn = isModern ? normalizeUsage(p.turn_token_usage) : null;
        if (!isModern && usageKey(nextTotal) !== usageKey(previousTotal)) turn.officialUsage = null;
        if (officialTurn) {
          const looksLikeThreadCopy = usageKey(officialTurn) === usageKey(nextTotal) && turn.baseline?.total_tokens > 0;
          if (!looksLikeThreadCopy) turn.officialUsage = officialTurn;
        }
      }
      if (responseUsage && turn) {
        const cumulativeAlias = nextTotal ? `${id}|${usageKey(nextTotal)}` : null;
        const explicitKey = p.response_id ? `${id}|${p.response_id}` : null;
        const knownKey = explicitKey && turn.responses.has(explicitKey) ? explicitKey : cumulativeAlias ? responseAliases.get(cumulativeAlias) : null;
        const key = knownKey ?? explicitKey ?? cumulativeAlias;
        if (key) {
          if (turn.responses.has(key)) diagnostics.duplicateUsageEvents++;
          const response = {
            id: p.response_id ?? turn.responses.get(key)?.id ?? null,
            turnId: id,
            usage: responseUsage,
            timestamp: record.timestamp ?? null
          };
          turn.responses.set(key, response);
          if (cumulativeAlias) responseAliases.set(cumulativeAlias, key);
          latestResponse = response;
        }
      }
      if (turn && usageKey(turnUsage(turn)) !== previousTurnUsage) turn.usageUpdatedAtMs = toTime(record.timestamp);
      if (nextTotal || responseUsage) updatedAt = record.timestamp ?? updatedAt;
      if (!nextTotal && !responseUsage) total = previousTotal;
    }
    function snapshot() {
      const currentTurn = publicTurn(turns.get(currentTurnId));
      const lastTurn = publicTurn(turns.get(lastTurnId));
      return {
        threadId,
        total: clone(total),
        cacheHitRate: cacheHitRate(total),
        currentTurn,
        lastTurn,
        cost: clone(costs.snapshot()),
        latestResponse: clone(latestResponse),
        speed: responseSpeed(latestResponse, responseTimings.get(latestResponse?.id)),
        endToEndSpeed: lastTurn?.usage?.output_tokens != null && lastTurn.durationMs > 0 ? {
          value: lastTurn.usage.output_tokens / (lastTurn.durationMs / 1e3),
          unit: "t/s",
          basis: "whole-turn-including-waiting-and-tools",
          source: "task_complete.duration_ms",
          estimated: false,
          live: false
        } : null,
        updatedAt,
        totalUpdatedAt,
        diagnostics: clone(diagnostics)
      };
    }
    return { consume, snapshot };
  }

  // src/turn-rate.mjs
  function estimateTurnRate(snapshot, nowMs = Date.now()) {
    const running = snapshot?.currentTurn != null;
    const turn = snapshot?.currentTurn ?? snapshot?.lastTurn;
    const outputTokens = turn?.usage?.output_tokens;
    if (turn?.coverage !== "complete" || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return null;
    let durationMs;
    let elapsedMs = null;
    let sampledAtMs = null;
    if (running) {
      if (!Number.isFinite(nowMs) || !Number.isFinite(turn.startedAtMs) || turn.startedAtMs < 0) return null;
      sampledAtMs = turn.usageUpdatedAtMs;
      if (!Number.isFinite(sampledAtMs) || sampledAtMs > nowMs) return null;
      durationMs = sampledAtMs - turn.startedAtMs;
      elapsedMs = nowMs - turn.startedAtMs;
    } else {
      durationMs = turn.durationMs > 0 ? turn.durationMs : Number.isFinite(turn.completedAtMs) && Number.isFinite(turn.startedAtMs) ? turn.completedAtMs - turn.startedAtMs : null;
    }
    if (!Number.isFinite(durationMs) || !(durationMs > 0)) return null;
    return {
      value: outputTokens / (durationMs / 1e3),
      unit: "t/s",
      estimated: true,
      live: false,
      turnId: turn.id,
      outputTokens,
      durationMs,
      status: running ? "sampled" : "completed",
      elapsedMs,
      sampledAtMs,
      sampleAgeMs: running ? nowMs - sampledAtMs : null,
      basis: "turn-output-including-reasoning/elapsed-including-waiting-and-tools",
      source: running ? "official-turn-output-and-matching-sample-time" : "official-turn-output-and-completed-duration"
    };
  }

  // src/runtime-model.mjs
  var keyFor = (identity) => JSON.stringify([identity.hostId, identity.threadId]);
  var at = (value) => {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  var usageFields = ["input_tokens", "output_tokens", "total_tokens"];
  var sameUsage = (a, b) => usageFields.every((field) => a?.[field] === b?.[field]);
  function mergeSnapshots(live, offline, nowMs) {
    const views = [{ value: live, source: "live" }, { value: offline, source: "log" }].filter((view) => view.value).sort((a, b) => at(b.value.updatedAt) - at(a.value.updatedAt) || (a.source === "log" ? -1 : 1));
    const countAt = (view) => at(Object.hasOwn(view.value, "totalUpdatedAt") ? view.value.totalUpdatedAt : view.value.updatedAt);
    const countViews = views.filter((view) => view.value.total).sort((a, b) => countAt(b) - countAt(a) || (a.source === "log" ? -1 : 1));
    const counts = countViews[0]?.value;
    const reset = countViews.length > 1 && ["input_tokens", "output_tokens"].some((field) => Number.isSafeInteger(counts.total[field]) && Number.isSafeInteger(countViews[1].value.total[field]) && counts.total[field] < countViews[1].value.total[field]);
    const turnViews = reset ? countViews.slice(0, 1) : views;
    const entries = turnViews.flatMap((view) => ["currentTurn", "lastTurn"].flatMap((key) => view.value[key]?.id ? [{
      ...view,
      turn: view.value[key],
      completed: key === "lastTurn" || view.value[key].status === "completed"
    }] : []));
    const started = (id) => Math.max(...entries.filter((entry) => entry.turn.id === id).map((entry) => at(entry.turn.startedAtMs)));
    const heads = turnViews.map((view) => ({ ...view, head: view.value.currentTurn ?? view.value.lastTurn })).filter((view) => view.head?.id);
    heads.sort((a, b) => {
      const x = started(a.head.id), y = started(b.head.id);
      return Number.isFinite(x) && Number.isFinite(y) && x !== y ? y - x : at(b.value.updatedAt) - at(a.value.updatedAt);
    });
    function choose(id) {
      const candidates = entries.filter((entry) => entry.turn.id === id);
      const completed = candidates.filter((entry) => entry.completed);
      const final = completed.filter((entry) => estimateTurnRate({ lastTurn: entry.turn }, nowMs));
      if (final.length) return { entry: final.find((entry) => entry.source === "log") ?? final[0], completed: true };
      const sampled = candidates.filter((entry) => estimateTurnRate({ currentTurn: entry.turn }, nowMs)).sort((a, b) => at(b.turn.usageUpdatedAtMs) - at(a.turn.usageUpdatedAtMs));
      if (sampled.length) {
        const latest = sampled[0];
        const selected = sampled.find((entry) => entry.source === "log" && sameUsage(entry.turn.usage, latest.turn.usage)) ?? latest;
        return { entry: selected, completed: false };
      }
      return candidates.length ? { entry: completed.find((entry) => entry.source === "log") ?? completed[0] ?? candidates[0], completed: completed.length > 0 } : null;
    }
    const head = heads.length ? choose(heads[0].head.id) : null;
    const previous = entries.filter((entry) => entry.completed && entry.turn.id !== head?.entry.turn.id).sort((a, b) => at(b.turn.completedAtMs ?? b.turn.startedAtMs) - at(a.turn.completedAtMs ?? a.turn.startedAtMs));
    const last = head?.completed ? head.entry.turn : previous.length ? choose(previous[0].turn.id)?.entry.turn : null;
    const combined = Object.assign({}, ...views.slice().reverse().map((view) => view.value));
    combined.total = counts?.total ?? null;
    combined.totalUpdatedAt = counts?.totalUpdatedAt ?? counts?.updatedAt ?? null;
    combined.cacheHitRate = cacheHitRate(combined.total);
    combined.currentTurn = head && !head.completed ? head.entry.turn : null;
    combined.lastTurn = last ?? null;
    combined.endToEndSpeed = last?.usage?.output_tokens != null && last.durationMs > 0 ? {
      value: last.usage.output_tokens / (last.durationMs / 1e3),
      unit: "t/s",
      basis: "whole-turn-including-waiting-and-tools",
      source: "task_complete.duration_ms",
      estimated: false,
      live: false
    } : null;
    return combined;
  }
  var runtimeUsage = (value) => {
    if (!value || typeof value !== "object") return null;
    const fields = { input_tokens: "inputTokens", cached_input_tokens: "cachedInputTokens", cache_write_input_tokens: "cacheWriteInputTokens", output_tokens: "outputTokens", reasoning_output_tokens: "reasoningOutputTokens", total_tokens: "totalTokens" };
    return Object.fromEntries(Object.entries(fields).map(([out, source]) => [out, Number.isSafeInteger(value[source]) && value[source] >= 0 ? value[source] : null]));
  };
  function createRuntimeModel({ now = Date.now, maxThreads = 32 } = {}) {
    const threads = /* @__PURE__ */ new Map();
    let active = { status: "identity-unresolved", threadId: null, hostId: null };
    function getState(identity) {
      const key = keyFor(identity);
      if (!threads.has(key)) {
        if (threads.size >= maxThreads) {
          const victim = [...threads.keys()].find((candidate) => candidate !== keyFor(active));
          if (victim) threads.delete(victim);
        }
        threads.set(key, { accumulator: createMetricsAccumulator({ threadId: identity.threadId }), visibleDeltaEvents: 0, visibleCharacters: 0, usageUpdates: 0, logSnapshot: null });
      }
      return threads.get(key);
    }
    function setIdentity(identity) {
      active = identity?.status === "resolved" && isCoreThreadId(identity.threadId) && typeof identity.hostId === "string" && identity.hostId ? { ...identity } : { status: identity?.status ?? "identity-unresolved", threadId: null, hostId: null };
    }
    function consume(message) {
      if (message?.type !== "mcp-notification") return;
      const p = message.params;
      if (!p || !isCoreThreadId(p.threadId) || typeof message.hostId !== "string" || !message.hostId) return;
      const state = getState({ threadId: p.threadId, hostId: message.hostId });
      const timestamp = new Date(now()).toISOString();
      if (message.method === "thread/tokenUsage/updated") {
        state.usageUpdates++;
        state.accumulator.consume({ type: "token_usage_record", timestamp, payload: {
          thread_id: p.threadId,
          turn_id: p.turnId,
          thread_token_usage: runtimeUsage(p.tokenUsage?.total),
          usage: runtimeUsage(p.tokenUsage?.last)
        } });
      } else if (message.method === "turn/started" && typeof p.turn?.id === "string") {
        state.accumulator.consume({ type: "event_msg", timestamp, payload: { type: "task_started", thread_id: p.threadId, turn_id: p.turn.id, started_at: timestamp } });
      } else if (message.method === "turn/completed" && typeof p.turn?.id === "string") {
        state.accumulator.consume({ type: "event_msg", timestamp, payload: { type: "task_complete", thread_id: p.threadId, turn_id: p.turn.id, completed_at: timestamp } });
      } else if (message.method === "item/agentMessage/delta" && typeof p.delta === "string") {
        state.visibleDeltaEvents++;
        state.visibleCharacters += p.delta.length;
      }
    }
    function setLogSnapshot(identity, snapshot2) {
      if (identity?.status !== "resolved" || !isCoreThreadId(identity.threadId) || snapshot2?.threadId !== identity.threadId || typeof identity.hostId !== "string") return false;
      getState(identity).logSnapshot = structuredClone(snapshot2);
      return true;
    }
    function snapshot() {
      if (active.status !== "resolved") return {
        scopeKey: "scope.waiting",
        noteKey: "note.identityUnresolved",
        noteParams: { status: active.status },
        scopeLabel: "Waiting for current conversation",
        scopeNote: `Conversation identity is not available (${active.status}).`,
        identity: { ...active },
        threadId: null,
        total: null,
        cacheHitRate: null,
        speed: null
      };
      const state = getState(active);
      const live = state.accumulator.snapshot();
      const offline = state.logSnapshot;
      const nowMs = now();
      const combined = mergeSnapshots(live, offline, nowMs);
      const observedCost = offline?.cost ?? live.cost;
      combined.cost = observedCost ? {
        ...observedCost,
        total: reconcileCostSummary(observedCost.total, combined.total),
        currentTurn: observedCost.currentTurn?.turnId === combined.currentTurn?.id ? reconcileCostSummary(observedCost.currentTurn, combined.currentTurn?.usage) : null,
        lastTurn: observedCost.lastTurn?.turnId === combined.lastTurn?.id ? reconcileCostSummary(observedCost.lastTurn, combined.lastTurn?.usage) : null
      } : null;
      const turnRate = estimateTurnRate(combined, nowMs);
      const ratePending = combined.currentTurn != null && !turnRate;
      return {
        ...combined,
        identity: { ...active },
        threadId: active.threadId,
        hostId: active.hostId,
        scopeKey: "scope.current",
        noteKey: turnRate ? turnRate.status === "sampled" ? "note.sampled" : "note.completed" : ratePending ? "note.waitingSample" : live.total || offline?.total ? "note.usageWaitingTiming" : "note.waitingUsage",
        scopeLabel: "Current conversation",
        speed: null,
        turnRate,
        ratePending,
        scopeNote: turnRate ? turnRate.status === "sampled" ? "Sample avg is estimated: official turn output tokens (including reasoning) divided by turn time up to the same usage sample, including waiting and tools. The value holds until usage changes; sample age is shown below. Completion uses the final turn duration. Generation speed is unverified." : "Turn avg is estimated: official turn output tokens (including reasoning) divided by the final turn duration, including waiting and tools. This completed average does not change with the clock. Generation speed is unverified." : ratePending ? "Waiting for a complete usage sample and matching timing for this turn. Compaction or the first response can delay this sample." : live.total || offline?.total ? "Usage follows the verified conversation identity. Generation speed is awaiting verified token timing. Runtime-only turn totals may cover observed responses only." : "Conversation identified. Waiting for an official usage update or a matching local rollout.",
        runtimeDiagnostics: { usageUpdates: state.usageUpdates, visibleDeltaEvents: state.visibleDeltaEvents, visibleCharacters: state.visibleCharacters }
      };
    }
    return { setIdentity, consume, setLogSnapshot, snapshot, dispose: () => threads.clear() };
  }

  // src/bridge-lease.mjs
  function createBridgeLease({ now = () => performance.now() } = {}) {
    let ownerId = null;
    let lastSeenAtMs = null;
    let leaseMs = 1e4;
    const inspect = () => ({
      required: ownerId !== null,
      ownerId,
      lastSeenAtMs,
      leaseMs,
      connected: ownerId === null || now() - lastSeenAtMs <= leaseMs
    });
    return {
      inspect,
      claim(candidate, duration = 1e4) {
        if (typeof candidate !== "string" || !candidate || candidate.length > 128 || !Number.isFinite(duration) || duration < 3e3 || duration > 6e4) return false;
        if (ownerId !== null && ownerId !== candidate && inspect().connected) return false;
        ownerId = candidate;
        leaseMs = duration;
        lastSeenAtMs = now();
        return true;
      },
      renew(candidate) {
        if (ownerId === null || candidate !== ownerId) return false;
        lastSeenAtMs = now();
        return true;
      },
      accepts: (candidate) => ownerId === null || candidate === ownerId
    };
  }

  // src/version.mjs
  var VERSION = "0.6.1";
  var BUILD_ID = true ? "09eb043780c7489c9f7f361655bce5a48a9d62d20eae6600e15ed20cb4924f31" : "development";

  // src/browser-entry.mjs
  (() => {
    const key = "__codexTokenStatusbarRuntime";
    if (window[key]) return;
    const ui = window.__codexTokenStatusbar;
    const model = createRuntimeModel();
    const bridge = createBridgeLease();
    let adapter = null;
    let interval = null;
    let removeMessages = null;
    let disposed = false;
    let phase = "connecting";
    let connectingAdapter = false;
    let nextAdapterAttempt = 0;
    let focusedAt = document.hasFocus() ? Date.now() : 0;
    const onFocus = () => {
      focusedAt = Date.now();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("pointerdown", onFocus, true);
    window.addEventListener("keydown", onFocus, true);
    const visibleSnapshot = () => {
      const snapshot = model.snapshot();
      if (bridge.inspect().connected) return snapshot;
      return {
        ...snapshot,
        bridgeDisconnected: true,
        total: null,
        cost: null,
        cacheHitRate: null,
        speed: null,
        turnRate: null,
        ratePending: false,
        currentTurn: null,
        lastTurn: null,
        endToEndSpeed: null,
        scopeLabel: "Reconnecting to local bridge",
        scopeKey: "scope.reconnecting",
        noteKey: "note.bridgeDisconnected",
        scopeNote: "The local bridge is disconnected. Usage is paused until the verified connection recovers."
      };
    };
    const poll = () => {
      if (disposed) return;
      ensureAdapter();
      if (adapter) phase = adapter.inspect().modulesReady ? "observing" : "adapter-unavailable";
      model.setIdentity(adapter?.readActiveIdentity());
      const snapshot = visibleSnapshot();
      if (phase === "adapter-unavailable" && !snapshot.bridgeDisconnected) Object.assign(snapshot, {
        scopeKey: "scope.unavailable",
        noteKey: "note.adapterUnavailable",
        scopeLabel: "Runtime adapter unavailable",
        scopeNote: "The loaded modules or mounted application scope could not be verified for this client."
      });
      ui.setSnapshot(snapshot);
      return snapshot;
    };
    window[key] = {
      version: VERSION,
      buildId: BUILD_ID,
      inspect() {
        const snapshot = poll() ?? visibleSnapshot();
        return {
          version: VERSION,
          buildId: BUILD_ID,
          phase,
          bridge: bridge.inspect(),
          ui: ui.inspect(),
          identity: snapshot.identity ?? null,
          hasUsage: !!snapshot.total,
          hasCost: !!snapshot.cost?.total?.amount,
          costComplete: snapshot.cost?.total?.complete === true,
          priceVersion: snapshot.cost?.priceVersion ?? null,
          desktop: { ...ui.desktopSnapshot(), focused: document.hasFocus(), focusedAt },
          diagnostics: snapshot.runtimeDiagnostics ?? null
        };
      },
      claimBridge(ownerId, leaseMs) {
        if (disposed) return false;
        const claimed = bridge.claim(ownerId, leaseMs);
        if (claimed) poll();
        return claimed;
      },
      refreshBridge(ownerId) {
        if (disposed) return false;
        const renewed = bridge.renew(ownerId);
        if (renewed) poll();
        return renewed;
      },
      setSettings(value, acknowledgedRequest, ownerId) {
        if (disposed || !bridge.accepts(ownerId)) return false;
        return ui.setSettings(value, acknowledgedRequest);
      },
      settingsError(requestId, ownerId) {
        if (!disposed && bridge.accepts(ownerId)) ui.settingsError(requestId);
      },
      setLogSnapshot(identity, snapshot, ownerId) {
        model.setIdentity(adapter?.readActiveIdentity());
        const current = model.snapshot().identity;
        if (disposed || !bridge.accepts(ownerId) || current?.status !== "resolved" || current.threadId !== identity?.threadId || current.hostId !== identity?.hostId) return false;
        const accepted = model.setLogSnapshot(identity, snapshot);
        if (accepted) ui.setSnapshot(visibleSnapshot());
        return accepted;
      },
      dispose() {
        disposed = true;
        phase = "disposed";
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pointerdown", onFocus, true);
        window.removeEventListener("keydown", onFocus, true);
        removeMessages?.();
        adapter?.dispose();
        model.dispose();
        ui.dispose();
        delete window[key];
      }
    };
    function ensureAdapter() {
      if (adapter || connectingAdapter || Date.now() < nextAdapterAttempt) return;
      connectingAdapter = true;
      nextAdapterAttempt = Date.now() + 5e3;
      connectPageAdapter().then((value) => {
        if (disposed) {
          value.dispose();
          return;
        }
        try {
          removeMessages = value.subscribeMessages((message) => {
            model.consume(message);
          });
        } catch (error) {
          value.dispose();
          throw error;
        }
        adapter = value;
        phase = "observing";
        poll();
      }).catch(() => {
        if (!disposed) {
          phase = "adapter-unavailable";
          poll();
        }
      }).finally(() => {
        connectingAdapter = false;
      });
    }
    interval = setInterval(poll, 500);
    poll();
  })();
})();
