using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace CodexTokenStatusbar {
    internal static class Data {
        internal static Dictionary<string, object> Obj(params object[] pairs) {
            var result = new Dictionary<string, object>();
            for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]);
            return result;
        }
        internal static object Get(object value, string key) {
            var map = value as Dictionary<string, object>; object result;
            return map != null && map.TryGetValue(key, out result) ? result : null;
        }
        internal static string Str(object value) { return value as string; }
        internal static string Text(object value, string key) { return Str(Get(value, key)); }
        internal static bool Bool(object value) { return value is bool && (bool)value; }
        internal static bool Has(object value, string key) { var map = value as Dictionary<string, object>; return map != null && map.ContainsKey(key); }
        internal static object[] Array(object value) {
            var sequence = value as IEnumerable;
            return sequence == null || value is string || value is IDictionary ? new object[0] : sequence.Cast<object>().ToArray();
        }
        internal static long? Number(object value) {
            if (!(value is int || value is long || value is decimal || value is double || value is float)) return null;
            try { decimal n = Convert.ToDecimal(value, CultureInfo.InvariantCulture); return n >= 0 && n <= 9007199254740991m && decimal.Truncate(n) == n ? (long?)n : null; }
            catch { return null; }
        }
        internal static long? Num(object value, string key) { return Number(Get(value, key)); }
        internal static double? Time(object value, string numericUnit = null) {
            if (value is int || value is long || value is decimal || value is double) {
                double n = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                return double.IsNaN(n) || double.IsInfinity(n) ? null : numericUnit == "seconds" ? n * 1000 : numericUnit == "milliseconds" ? (double?)n : null;
            }
            DateTimeOffset time;
            return value is string && DateTimeOffset.TryParse((string)value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out time) ? (double?)(time.ToUniversalTime() - Epoch).TotalMilliseconds : null;
        }
        internal static readonly DateTimeOffset Epoch = new DateTimeOffset(1970, 1, 1, 0, 0, 0, TimeSpan.Zero);
        internal static long Now { get { return (long)(DateTimeOffset.UtcNow - Epoch).TotalMilliseconds; } }
        internal static string Json(object value) { return Serializer().Serialize(value); }
        internal static object Parse(string value) { return Serializer().DeserializeObject(value); }
        private static JavaScriptSerializer Serializer() { return new JavaScriptSerializer { MaxJsonLength = 72 * 1024 * 1024, RecursionLimit = 256 }; }
        internal static object Copy(object value) { return value == null ? null : Parse(Json(value)); }
        internal static bool ThreadId(string value) { return value != null && Regex.IsMatch(value, @"\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z", RegexOptions.IgnoreCase); }
    }

    internal sealed class ApiPrices {
        internal static readonly string[] UsageFields = { "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens" };
        private static readonly string[] Components = { "input", "cacheRead", "cacheWrite", "output" };
        internal readonly object Catalog;
        internal ApiPrices(string file) { Catalog = Data.Parse(File.ReadAllText(file)); }
        internal static Dictionary<string, object> Amount(BigInteger min, BigInteger max) { return Data.Obj("minPicoUsd", min.ToString(CultureInfo.InvariantCulture), "maxPicoUsd", max.ToString(CultureInfo.InvariantCulture)); }
        internal static BigInteger? Rate(object value) {
            string text = value as string;
            if (text == null || !Regex.IsMatch(text, @"\A\d+(?:\.\d{1,6})?\z")) return null;
            var parts = text.Split('.');
            return BigInteger.Parse(parts[0], CultureInfo.InvariantCulture) * 1000000 + BigInteger.Parse(parts.Length > 1 ? parts[1].PadRight(6, '0') : "0", CultureInfo.InvariantCulture);
        }
        private static BigInteger? Charge(long count, object rate) { var n = Rate(rate); return count == 0 ? BigInteger.Zero : n.HasValue ? count * n : null; }
        internal object Price(object entry) {
            string model = Data.Text(entry, "model"), provider = Data.Text(entry, "provider"), serviceTier = Data.Text(entry, "serviceTier");
            Func<string, object> fail = reason => Data.Obj("amount", null, "reason", reason, "model", model);
            if (provider != "openai") return fail(string.IsNullOrEmpty(provider) ? "provider-unknown" : "custom-provider");
            string id = Data.Text(Data.Get(Catalog, "aliases"), model ?? "") ?? model;
            var item = Data.Get(Data.Get(Catalog, "models"), id ?? "");
            if (item == null) return fail(string.IsNullOrEmpty(model) ? "model-unknown" : "model-unpriced");
            object usage = Data.Get(entry, "usage");
            if (usage == null || UsageFields.Any(k => !Data.Num(usage, k).HasValue)) return fail("usage-incomplete");
            long input = Data.Num(usage, "input_tokens").Value, read = Data.Num(usage, "cached_input_tokens").Value,
                write = Data.Num(usage, "cache_write_input_tokens").Value, output = Data.Num(usage, "output_tokens").Value;
            if ((BigInteger)read + write > input || (Data.Get(usage, "reasoning_output_tokens") != null && (!Data.Num(usage, "reasoning_output_tokens").HasValue || Data.Num(usage, "reasoning_output_tokens") > output))
                || (Data.Get(usage, "total_tokens") != null && (!Data.Num(usage, "total_tokens").HasValue || Data.Num(usage, "total_tokens") != (BigInteger)input + output))) return fail("usage-invalid");
            bool assumed = serviceTier == null || serviceTier == "auto";
            string tier = assumed ? "standard" : serviceTier == "default" ? "standard" : serviceTier == "priority" ? "fast" : serviceTier;
            if (!new[] { "standard", "fast", "flex", "batch", "ultrafast" }.Contains(tier)) tier = null;
            object schedule = tier == null ? null : Data.Get(Data.Get(item, "tiers"), tier);
            if (schedule == null) return fail("tier-unpriced");
            long? threshold = Data.Num(schedule, "contextThreshold"); bool isLong = threshold.HasValue && input > threshold;
            object rates = Data.Get(schedule, isLong ? "long" : "short");
            if (Data.Get(rates, "input") == null || Data.Get(rates, "output") == null) return fail("context-unpriced");
            var a = Charge(input - read - write, Data.Get(rates, "input")); var b = Charge(read, Data.Get(rates, "cachedInput")); var c = Charge(output, Data.Get(rates, "output"));
            if (!a.HasValue || !b.HasValue || !c.HasValue) return fail("component-unpriced");
            BigInteger writeMin = 0, writeMax = 0; bool writeAssumed = false;
            if (write > 0) {
                object details = Data.Get(usage, "cache_write_input_tokens_details") ?? Data.Get(Data.Get(usage, "input_tokens_details"), "cache_write_tokens_details");
                if (details != null) {
                    var x = Data.Num(details, "ttl_30m_tokens"); var y = Data.Num(details, "ttl_12h_tokens");
                    if (!x.HasValue || !y.HasValue || (BigInteger)x.Value + y.Value != write) return fail("write-details-invalid");
                    var p = Charge(x.Value, Data.Get(rates, "cacheWrite30m")); var q = Charge(y.Value, Data.Get(rates, "cacheWrite12h"));
                    if (!p.HasValue || !q.HasValue) return fail("component-unpriced");
                    writeMin = writeMax = p.Value + q.Value;
                } else {
                    var p = Charge(write, Data.Get(rates, "cacheWrite30m")); var q = Charge(write, Data.Get(rates, "cacheWrite12h"));
                    if (!p.HasValue || !q.HasValue) return fail("component-unpriced");
                    writeMin = BigInteger.Min(p.Value, q.Value); writeMax = BigInteger.Max(p.Value, q.Value); writeAssumed = true;
                }
            }
            var assumptions = new List<string>(); if (assumed) assumptions.Add("tier-standard-assumed"); if (writeAssumed) assumptions.Add("write-ttl-unknown");
            BigInteger ordinary = a.Value + b.Value + c.Value;
            return Data.Obj("amount", Amount(ordinary + writeMin, ordinary + writeMax), "components", Data.Obj("input", Amount(a.Value, a.Value), "cacheRead", Amount(b.Value, b.Value), "cacheWrite", Amount(writeMin, writeMax), "output", Amount(c.Value, c.Value)),
                "model", id, "provider", provider, "tier", tier, "context", isLong ? "long" : threshold.HasValue ? "short" : "flat", "rates", rates, "assumptions", assumptions);
        }
        private static BigInteger Pico(object amount, string key) { return BigInteger.Parse(Data.Text(amount, key), CultureInfo.InvariantCulture); }
        internal object Summarize(IList<object> entries, object expected, string[] extra) {
            var observed = Data.Obj();
            foreach (string key in UsageFields) observed[key] = entries.All(e => Data.Num(Data.Get(e, "usage"), key).HasValue)
                ? entries.Aggregate(BigInteger.Zero, (sum, e) => sum + Data.Num(Data.Get(e, "usage"), key).Value).ToString(CultureInfo.InvariantCulture) : null;
            var reasons = new Dictionary<string, int>(); var reasonOrder = new List<string>();
            Action<string> add = key => { if (!reasons.ContainsKey(key)) { reasons.Add(key, 0); reasonOrder.Add(key); } reasons[key]++; };
            foreach (string reason in extra) add(reason);
            var componentMin = Components.ToDictionary(k => k, k => BigInteger.Zero); var componentMax = Components.ToDictionary(k => k, k => BigInteger.Zero);
            BigInteger min = 0, max = 0; int priced = 0; var models = new Dictionary<string, Dictionary<string, object>>(); var modelOrder = new List<string>(); var assumptions = new List<string>();
            foreach (object entry in entries) {
                string forced = Data.Text(entry, "forcedReason"); object result = forced != null ? Data.Obj("reason", forced) : Price(entry); object amount = Data.Get(result, "amount");
                if (amount == null) { add(Data.Text(result, "reason")); continue; }
                priced++; min += Pico(amount, "minPicoUsd"); max += Pico(amount, "maxPicoUsd");
                foreach (string key in Components) { var value = Data.Get(Data.Get(result, "components"), key); componentMin[key] += Pico(value, "minPicoUsd"); componentMax[key] += Pico(value, "maxPicoUsd"); }
                foreach (object value in Data.Array(Data.Get(result, "assumptions"))) if (!assumptions.Contains((string)value)) assumptions.Add((string)value);
                string groupKey = Data.Json(new object[] { Data.Get(result, "model"), Data.Get(result, "tier"), Data.Get(result, "context") });
                if (!models.ContainsKey(groupKey)) { modelOrder.Add(groupKey); models[groupKey] = Data.Obj("model", Data.Get(result, "model"), "tier", Data.Get(result, "tier"), "context", Data.Get(result, "context"), "rates", Data.Get(result, "rates"), "responses", 0, "amount", Amount(0, 0)); }
                var group = models[groupKey]; group["responses"] = (int)group["responses"] + 1;
                group["amount"] = Amount(Pico(group["amount"], "minPicoUsd") + Pico(amount, "minPicoUsd"), Pico(group["amount"], "maxPicoUsd") + Pico(amount, "maxPicoUsd"));
            }
            bool matched = entries.Count > 0 && UsageFields.All(k => Data.Num(expected, k).HasValue && Data.Text(observed, k) == Data.Num(expected, k).Value.ToString(CultureInfo.InvariantCulture));
            if (!matched) add(expected == null ? "total-unverified" : "history-incomplete");
            return Data.Obj("amount", priced > 0 ? Amount(min, max) : null, "pricedResponses", priced, "unpricedResponses", entries.Count - priced, "responseCount", entries.Count, "complete", matched && priced == entries.Count && extra.Length == 0,
                "components", priced > 0 ? Components.ToDictionary(k => k, k => (object)Amount(componentMin[k], componentMax[k])) : null,
                "models", modelOrder.Select(k => models[k]).ToArray(), "assumptions", assumptions.ToArray(), "reasons", reasonOrder.Select(k => Data.Obj("key", k, "count", reasons[k])).ToArray(),
                "coverage", Data.Obj("matched", matched, "observedUsage", observed, "expectedUsage", expected));
        }
    }

    internal sealed class CostAccumulator {
        private readonly ApiPrices prices;
        private string provider, current, last; private object expected, cached;
        private bool reset, inherited; private int revision, cachedRevision = -1;
        private readonly Dictionary<string, object> contexts = new Dictionary<string, object>(), responses = new Dictionary<string, object>(), turnExpected = new Dictionary<string, object>();
        private readonly List<string> responseOrder = new List<string>();
        internal CostAccumulator(ApiPrices value) { prices = value; }
        private static object Usage(object value) {
            if (!(value is Dictionary<string, object>)) return null;
            var result = Data.Obj();
            foreach (string key in ApiPrices.UsageFields.Concat(new[] { "total_tokens", "reasoning_output_tokens", "cache_write_input_tokens_details", "input_tokens_details" })) if (Data.Has(value, key)) result[key] = Data.Copy(Data.Get(value, key));
            return result;
        }
        internal void Consume(object record) {
            object p = Data.Get(record, "payload"); string type = Data.Text(record, "type");
            if (type == "session_meta") {
                provider = Data.Text(p, "model_provider"); inherited = Data.Get(p, "forked_from_id") != null || Data.Get(p, "forked_from") != null || Data.Get(p, "parent_thread_id") != null || Data.Text(p, "thread_source") == "fork"; revision++; return;
            }
            if (type == "turn_context") {
                string id = Data.Text(p, "turn_id");
                if (id != null) contexts[id] = Data.Obj("model", Data.Text(p, "model"), "provider", Data.Text(p, "model_provider") ?? provider, "serviceTier", Data.Get(p, "service_tier"));
                revision++; return;
            }
            string eventType = Data.Text(p, "type");
            if (type == "event_msg" && (eventType == "task_started" || eventType == "task_complete")) {
                string id = Data.Text(p, "turn_id") ?? Data.Text(p, "root_turn_id");
                if (eventType == "task_started") current = id; else { last = id ?? current; if (current == last) current = null; } revision++; return;
            }
            if (type != "token_usage_record") return;
            string turn = Data.Text(p, "turn_id"), response = Data.Text(p, "response_id");
            string key = !string.IsNullOrEmpty(response) ? response : Data.Json(new object[] { "unidentified", turn, Data.Get(p, "thread_token_usage"), Data.Get(p, "usage") });
            object previous; responses.TryGetValue(key, out previous);
            object next = Usage(Data.Get(p, "thread_token_usage"));
            if (previous == null && expected != null && next != null && ApiPrices.UsageFields.Any(k => Data.Num(expected, k).HasValue && Data.Num(next, k).HasValue && Data.Num(next, k) < Data.Num(expected, k))) {
                responses.Clear(); responseOrder.Clear(); turnExpected.Clear(); reset = true; previous = null;
            }
            if (next != null) expected = next;
            if (Data.Get(p, "turn_token_usage") != null && !string.IsNullOrEmpty(turn)) turnExpected[turn] = Usage(Data.Get(p, "turn_token_usage"));
            object context = previous; if (context == null && turn != null) contexts.TryGetValue(turn, out context);
            string forced = string.IsNullOrEmpty(response) ? "response-id-missing" : previous != null && Data.Text(previous, "turnId") != turn ? "response-conflict" : Data.Text(previous, "forcedReason");
            string model = Data.Text(p, "model"), ownProvider = Data.Text(p, "model_provider");
            if (previous != null && ((!string.IsNullOrEmpty(model) && !string.IsNullOrEmpty(Data.Text(previous, "model")) && model != Data.Text(previous, "model")) || (!string.IsNullOrEmpty(ownProvider) && !string.IsNullOrEmpty(Data.Text(previous, "provider")) && ownProvider != Data.Text(previous, "provider")))) forced = "response-conflict";
            if (!responses.ContainsKey(key)) responseOrder.Add(key);
            responses[key] = Data.Obj("model", model ?? Data.Text(context, "model"), "provider", ownProvider ?? Data.Text(context, "provider") ?? provider, "serviceTier", Data.Get(p, "service_tier") ?? Data.Get(context, "serviceTier"), "turnId", turn, "usage", Usage(Data.Get(p, "usage")), "forcedReason", forced);
            if (string.IsNullOrEmpty(current) && last != turn) current = turn;
            revision++;
        }
        internal object Snapshot() {
            if (cachedRevision == revision) return cached;
            var entries = responseOrder.Select(k => responses[k]).ToList(); var reasons = new List<string>(); if (reset) reasons.Add("counter-reset"); if (inherited) reasons.Add("inherited-history");
            Func<string, object> turn = id => {
                if (string.IsNullOrEmpty(id)) return null;
                object value; turnExpected.TryGetValue(id, out value);
                var result = (Dictionary<string, object>)prices.Summarize(entries.Where(e => Data.Text(e, "turnId") == id).ToList(), value, reasons.ToArray());
                return new[] { Data.Obj("turnId", id), result }.SelectMany(x => x).ToDictionary(x => x.Key, x => x.Value);
            };
            cached = Data.Obj("currency", "USD", "scale", 12, "priceVersion", Data.Get(prices.Catalog, "version"), "source", Data.Get(prices.Catalog, "source"), "sourceKind", "verified-response-records", "total", prices.Summarize(entries, expected, reasons.ToArray()), "currentTurn", turn(current), "lastTurn", turn(last));
            cachedRevision = revision; return cached;
        }
    }

    // 参照 dongyue-19/codex-statusbar 的 TpsTracker；许可见 desktop/licenses/codex-statusbar-MIT。
    internal sealed class GenerationRate {
        private readonly string turnId;
        private bool complete, held;
        private readonly List<long[]> intervals = new List<long[]>();
        private long output, duration, lastOutput = -1, lastDuration = -1;
        private double? value, rawValue, sampledAt;
        private int samples;
        internal GenerationRate(string id) { turnId = id; }
        internal void Begin() { if (complete) return; Invalidate(); complete = true; }
        internal void Invalidate() {
            complete = held = false; intervals.Clear(); output = duration = 0;
            lastOutput = lastDuration = -1; value = rawValue = sampledAt = null; samples = 0;
        }
        internal void Refresh(double? at) {
            if (!complete || output <= 0 || duration <= 0 || (output == lastOutput && duration == lastDuration)) return;
            double sample = 1000d * output / duration;
            if (double.IsNaN(sample) || double.IsInfinity(sample) || sample <= 0 || sample > 100000) return;
            lastOutput = output; lastDuration = duration; rawValue = sample;
            value = value.HasValue ? 0.35 * sample + 0.65 * value.Value : sample;
            sampledAt = at.HasValue && at >= 0 && at <= 9007199254740991d && Math.Truncate(at.Value) == at ? at : intervals.Count > 0 ? (double?)intervals[intervals.Count - 1][1] : null;
            samples++; held = false;
        }
        internal void ObserveItem(string type, long? start, long? end, double? at) {
            if (!string.Equals(type, "Reasoning", StringComparison.OrdinalIgnoreCase) && !string.Equals(type, "AgentMessage", StringComparison.OrdinalIgnoreCase)) { held = true; return; }
            if (!start.HasValue || !end.HasValue || end <= start || end - start > 600000) return;
            var sorted = intervals.Concat(new[] { new[] { start.Value, end.Value } }).OrderBy(window => window[0]).ToArray();
            intervals.Clear();
            foreach (var window in sorted) {
                var previous = intervals.Count > 0 ? intervals[intervals.Count - 1] : null;
                if (previous != null && window[0] <= previous[1]) previous[1] = Math.Max(previous[1], window[1]);
                else intervals.Add(new[] { window[0], window[1] });
            }
            duration = intervals.Sum(window => window[1] - window[0]); Refresh(at);
        }
        internal void Update(long? next, double? at) { if (next.HasValue) { output = next.Value; Refresh(at); } }
        internal object Snapshot(string status) {
            if (!value.HasValue) return null;
            return Data.Obj("value", value, "rawValue", rawValue, "unit", "t/s", "estimated", true, "live", false, "turnId", turnId,
                "outputTokens", lastOutput, "durationMs", lastDuration, "sampledAtMs", sampledAt, "sampleCount", samples,
                "smoothingAlpha", 0.35, "itemsComplete", complete, "status", status == "running" ? "sampled" : status == "aborted" ? "aborted" : "completed",
                "held", status == "running" && held, "basis", "official-output-including-reasoning/union-model-output-windows", "source", "codex-statusbar-model-output-window");
        }
    }

    internal sealed class UsageAccumulator {
        internal static readonly string[] Fields = { "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens" };
        private readonly CostAccumulator costs;
        private string threadId, currentId, lastId; private object total, latest, updatedAt, totalUpdatedAt;
        private bool sawMeta, modern;
        private readonly Dictionary<string, Turn> turns = new Dictionary<string, Turn>();
        private readonly Dictionary<string, string> aliases = new Dictionary<string, string>();
        private readonly Dictionary<string, object> timings = new Dictionary<string, object>();
        private readonly Dictionary<string, object> diagnostics = Data.Obj("malformedLines", 0, "duplicateUsageEvents", 0, "ignoredForeignThreadEvents", 0, "ignoredLegacyUsageEvents", 0);
        private sealed class Turn {
            internal string Id, Status = "running"; internal object Baseline, Official, Delta;
            internal double? Started, Completed, UsageUpdated; internal long? Duration, FirstToken;
            internal readonly Dictionary<string, object> Responses = new Dictionary<string, object>();
            internal readonly List<string> Order = new List<string>();
            internal GenerationRate Generation;
            internal long? GenerationBaselineOutput; internal long GenerationOfficialOutput;
        }
        internal UsageAccumulator(ApiPrices prices, string id = null) { costs = new CostAccumulator(prices); threadId = id; }
        internal static object Normalize(object value) {
            if (!(value is Dictionary<string, object>)) return null;
            var result = Fields.ToDictionary(k => k, k => (object)Data.Num(value, k));
            if (result["total_tokens"] == null && result["input_tokens"] != null && result["output_tokens"] != null) result["total_tokens"] = (long)result["input_tokens"] + (long)result["output_tokens"];
            return result["input_tokens"] == null && result["output_tokens"] == null ? null : result;
        }
        private static string UsageKey(object usage) { return usage == null ? null : string.Join(":", Fields.Select(k => Convert.ToString(Data.Get(usage, k), CultureInfo.InvariantCulture) ?? "?").Select(x => x == "" ? "?" : x)); }
        private static object Subtract(object a, object b) {
            if (a == null || b == null) return null;
            var result = Fields.ToDictionary(k => k, k => Data.Num(a, k).HasValue && Data.Num(b, k).HasValue && Data.Num(a, k) >= Data.Num(b, k) ? (object)(Data.Num(a, k) - Data.Num(b, k)) : null);
            return result["input_tokens"] == null || result["output_tokens"] == null ? null : result;
        }
        private static object TurnUsage(Turn turn) {
            if (turn.Official != null) return turn.Official; if (turn.Delta != null) return turn.Delta; if (turn.Responses.Count == 0) return null;
            return Fields.ToDictionary(k => k, k => turn.Responses.Values.All(r => Data.Num(Data.Get(r, "usage"), k).HasValue) ? (object)turn.Responses.Values.Sum(r => Data.Num(Data.Get(r, "usage"), k).Value) : null);
        }
        private Turn GetTurn(string id) { if (string.IsNullOrEmpty(id)) return null; if (!turns.ContainsKey(id)) turns[id] = new Turn { Id = id, Generation = new GenerationRate(id) }; return turns[id]; }
        private void Increment(string name) { diagnostics[name] = (int)diagnostics[name] + 1; }
        internal void Consume(string line) { try { Consume(Data.Parse(line)); } catch (ArgumentException) { Increment("malformedLines"); } catch (InvalidOperationException) { Increment("malformedLines"); } }
        internal void Consume(object record) {
            object p = Data.Get(record, "payload"); string type = Data.Text(record, "type");
            if (type == "session_meta") {
                string id = Data.Text(p, "id"); if (!string.IsNullOrEmpty(threadId) && !string.IsNullOrEmpty(id) && id != threadId) { Increment("ignoredForeignThreadEvents"); return; }
                if (threadId == null) threadId = id; sawMeta = true; costs.Consume(record); return;
            }
            string foreign = Data.Text(p, "thread_id"); if (!string.IsNullOrEmpty(threadId) && !string.IsNullOrEmpty(foreign) && foreign != threadId) { Increment("ignoredForeignThreadEvents"); return; }
            costs.Consume(record);
            string eventType = Data.Text(p, "type");
            if (type == "event_msg" && eventType == "task_started") {
                currentId = Data.Text(p, "turn_id") ?? Data.Text(p, "root_turn_id"); var turn = GetTurn(currentId); if (turn == null) return;
                if (!turn.Started.HasValue) { turn.Started = Data.Time(Data.Get(p, "started_at"), "seconds") ?? Data.Time(Data.Get(record, "timestamp")); turn.Baseline = total ?? (sawMeta ? Fields.ToDictionary(k => k, k => (object)0L) : null); turn.GenerationBaselineOutput = Data.Num(total, "output_tokens"); turn.Generation.Begin(); }
                updatedAt = Data.Get(record, "timestamp") ?? updatedAt; return;
            }
            if (type == "event_msg" && (eventType == "task_complete" || eventType == "turn_aborted")) {
                string id = Data.Text(p, "turn_id") ?? Data.Text(p, "root_turn_id") ?? currentId; var turn = GetTurn(id); if (turn == null) return;
                turn.Status = eventType == "turn_aborted" ? "aborted" : "completed"; turn.Completed = Data.Time(Data.Get(p, "completed_at"), "seconds") ?? Data.Time(Data.Get(record, "timestamp"));
                turn.Started = turn.Started ?? Data.Time(Data.Get(p, "started_at"), "seconds"); turn.Duration = Data.Num(p, "duration_ms"); turn.FirstToken = Data.Num(p, "time_to_first_token_ms");
                turn.Generation.Refresh(Data.Time(Data.Get(record, "timestamp")));
                lastId = id; if (currentId == id) currentId = null; updatedAt = Data.Get(record, "timestamp") ?? updatedAt; return;
            }
            if (type == "event_msg" && eventType == "item_completed") {
                var turn = GetTurn(Data.Text(p, "turn_id") ?? currentId); if (turn == null) return;
                turn.Generation.ObserveItem(Data.Text(Data.Get(p, "item"), "type"), Data.Num(p, "started_at_ms"), Data.Num(p, "completed_at_ms"), Data.Time(Data.Get(record, "timestamp")));
                updatedAt = Data.Get(record, "timestamp") ?? updatedAt; return;
            }
            if (type == "response_timing" && Data.Text(p, "response_id") != null) {
                var a = Data.Time(Data.Get(p, "started_at_ms"), "milliseconds"); var b = Data.Time(Data.Get(p, "completed_at_ms"), "milliseconds");
                if (a.HasValue && b > a) timings[Data.Text(p, "response_id")] = Data.Obj("startedAtMs", a, "completedAtMs", b); return;
            }
            bool isModern = type == "token_usage_record", legacy = type == "event_msg" && eventType == "token_count";
            if (!isModern && !legacy) return;
            object next = Normalize(isModern ? Data.Get(p, "thread_token_usage") : Data.Get(Data.Get(p, "info"), "total_token_usage"));
            object responseUsage = Normalize(isModern ? Data.Get(p, "usage") : Data.Get(Data.Get(p, "info"), "last_token_usage"));
            if (legacy && modern) { Increment(next != null && UsageKey(next) == UsageKey(total) ? "duplicateUsageEvents" : "ignoredLegacyUsageEvents"); return; }
            if (isModern && next != null) { if (!modern) foreach (var turn in turns.Values) turn.GenerationBaselineOutput = null; modern = true; }
            object previous = total;
            if (next != null && previous != null && Data.Num(next, "output_tokens").HasValue && Data.Num(previous, "output_tokens").HasValue && Data.Num(next, "output_tokens") < Data.Num(previous, "output_tokens")) foreach (var turn in turns.Values) turn.Generation.Invalidate();
            if (next != null) { total = next; if (UsageKey(next) != UsageKey(previous)) totalUpdatedAt = Data.Get(record, "timestamp"); }
            string turnId = Data.Text(p, "turn_id") ?? currentId; var ownTurn = GetTurn(turnId); string previousTurn = ownTurn == null ? null : UsageKey(TurnUsage(ownTurn));
            if (!string.IsNullOrEmpty(turnId) && currentId == null && ownTurn.Status == "running") currentId = turnId;
            if (ownTurn != null) {
                ownTurn.Delta = Subtract(total, ownTurn.Baseline); object official = isModern ? Normalize(Data.Get(p, "turn_token_usage")) : null;
                if (!ownTurn.GenerationBaselineOutput.HasValue && Data.Num(next, "output_tokens").HasValue) ownTurn.GenerationBaselineOutput = Data.Num(next, "output_tokens");
                if (official != null && next != null && UsageKey(official) != UsageKey(next)) ownTurn.GenerationOfficialOutput = Math.Max(ownTurn.GenerationOfficialOutput, Data.Num(official, "output_tokens") ?? 0);
                if (!isModern && UsageKey(next) != UsageKey(previous)) ownTurn.Official = null;
                if (official != null && !(UsageKey(official) == UsageKey(next) && Data.Num(ownTurn.Baseline, "total_tokens") > 0)) ownTurn.Official = official;
            }
            if (responseUsage != null && ownTurn != null) {
                string alias = next == null ? null : turnId + "|" + UsageKey(next), responseId = Data.Text(p, "response_id");
                string explicitKey = string.IsNullOrEmpty(responseId) ? null : turnId + "|" + responseId, known = null;
                if (explicitKey != null && ownTurn.Responses.ContainsKey(explicitKey)) known = explicitKey; else if (alias != null) aliases.TryGetValue(alias, out known);
                string key = known ?? explicitKey ?? alias;
                if (key != null) {
                    object previousResponse; ownTurn.Responses.TryGetValue(key, out previousResponse);
                    if (previousResponse != null) Increment("duplicateUsageEvents"); else ownTurn.Order.Add(key);
                    var response = Data.Obj("id", responseId ?? Data.Text(previousResponse, "id"), "turnId", turnId, "usage", responseUsage, "timestamp", Data.Get(record, "timestamp"));
                    ownTurn.Responses[key] = response; if (alias != null) aliases[alias] = key; latest = response;
                }
            }
            if (ownTurn != null && UsageKey(TurnUsage(ownTurn)) != previousTurn) ownTurn.UsageUpdated = Data.Time(Data.Get(record, "timestamp"));
            if (ownTurn != null) {
                long responseOutput = ownTurn.Responses.Values.Sum(r => Data.Num(Data.Get(r, "usage"), "output_tokens") ?? 0);
                long delta = Data.Num(total, "output_tokens").HasValue && ownTurn.GenerationBaselineOutput.HasValue ? Math.Max(0, Data.Num(total, "output_tokens").Value - ownTurn.GenerationBaselineOutput.Value) : 0;
                long exact = Math.Max(responseOutput, delta);
                ownTurn.Generation.Update(exact > 0 ? exact : ownTurn.GenerationOfficialOutput, Data.Time(Data.Get(record, "timestamp")));
            }
            if (next != null || responseUsage != null) updatedAt = Data.Get(record, "timestamp") ?? updatedAt;
        }
        private static double? CacheRate(object usage) { var input = Data.Num(usage, "input_tokens"); var cached = Data.Num(usage, "cached_input_tokens"); return input > 0 && cached.HasValue ? cached.Value / (double)input.Value * 100 : (double?)null; }
        private object PublicTurn(string id) {
            Turn turn; if (id == null || !turns.TryGetValue(id, out turn)) return null; object usage = TurnUsage(turn);
            return Data.Obj("id", turn.Id, "usage", usage, "cacheHitRate", CacheRate(usage), "responseCount", turn.Responses.Count, "status", turn.Status, "startedAtMs", turn.Started, "completedAtMs", turn.Completed, "durationMs", turn.Duration,
                "timeToFirstTokenMs", turn.FirstToken, "usageUpdatedAtMs", turn.UsageUpdated, "coverage", turn.Official != null || turn.Delta != null ? "complete" : "observed-responses-only", "generationSpeed", turn.Generation.Snapshot(turn.Status));
        }
        internal object Snapshot() {
            object current = PublicTurn(currentId), last = PublicTurn(lastId), speed = null, timing;
            string responseId = Data.Text(latest, "id");
            if (responseId != null && timings.TryGetValue(responseId, out timing)) {
                double duration = Convert.ToDouble(Data.Get(timing, "completedAtMs")) - Convert.ToDouble(Data.Get(timing, "startedAtMs")); var output = Data.Num(Data.Get(latest, "usage"), "output_tokens");
                if (output.HasValue && duration > 0) speed = Data.Obj("value", output.Value / (duration / 1000), "unit", "t/s", "basis", "response-output-including-reasoning", "source", "explicit-response-timing", "estimated", false, "live", false, "responseId", responseId, "durationMs", duration);
            }
            var lastOutput = Data.Num(Data.Get(last, "usage"), "output_tokens"); var lastDuration = Data.Num(last, "durationMs");
            return Data.Obj("threadId", threadId, "total", total, "cacheHitRate", CacheRate(total), "currentTurn", current, "lastTurn", last, "cost", costs.Snapshot(), "latestResponse", latest, "speed", speed,
                "endToEndSpeed", lastOutput.HasValue && lastDuration > 0 ? Data.Obj("value", lastOutput.Value / (lastDuration.Value / 1000d), "unit", "t/s", "basis", "whole-turn-including-waiting-and-tools", "source", "task_complete.duration_ms", "estimated", false, "live", false) : null,
                "updatedAt", updatedAt, "totalUpdatedAt", totalUpdatedAt, "diagnostics", new Dictionary<string, object>(diagnostics));
        }
    }
}
