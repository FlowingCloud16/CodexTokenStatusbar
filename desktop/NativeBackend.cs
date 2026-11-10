using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace CodexTokenStatusbar {
    internal sealed class NativePipe {
        internal readonly Dictionary<string, object> Descriptor;
        internal NativePipe(object value) {
            Descriptor = value as Dictionary<string, object>;
            if (Data.Num(value, "schemaVersion") != 1 || !(Data.Num(value, "pid") > 0)
                || !Regex.IsMatch(Data.Text(value, "pipeName") ?? "", @"\A\\\\\.\\pipe\\codex-token-statusbar-native-[a-f0-9-]{36}\z")
                || !Regex.IsMatch(Data.Text(value, "token") ?? "", @"\A[a-f0-9]{64}\z")) throw new IOException("The local connection is invalid.");
        }
        internal object Request(params object[] fields) { return RequestAsync(Data.Obj(fields)).GetAwaiter().GetResult(); }
        private async Task<object> RequestAsync(Dictionary<string, object> body) {
            string name = Data.Text(Descriptor, "pipeName").Substring(9);
            using (var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous)) {
                try {
                    pipe.Connect(1200); body["token"] = Descriptor["token"];
                    byte[] request = Encoding.UTF8.GetBytes(Data.Json(body) + "\n");
                    Task<object> operation = Exchange(pipe, request);
                    if (await Task.WhenAny(operation, Task.Delay(6000)).ConfigureAwait(false) != operation) {
                        pipe.Dispose(); ObserveFailure(operation);
                        throw new TimeoutException("The local connection did not respond in time.");
                    }
                    return await operation.ConfigureAwait(false);
                } catch (TimeoutException) { throw; }
                catch { throw new IOException("The local connection is unavailable."); }
            }
        }
        private static void ObserveFailure(Task operation) { operation.ContinueWith(t => { var ignored = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted); }
        private static async Task<object> Exchange(NamedPipeClientStream pipe, byte[] request) {
            await pipe.WriteAsync(request, 0, request.Length).ConfigureAwait(false);
            var buffer = new byte[8192];
            using (var message = new MemoryStream()) {
                while (message.Length <= 1024 * 1024) {
                    int count = await pipe.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
                    if (count == 0) throw new IOException("The local connection closed.");
                    message.Write(buffer, 0, count);
                    if (System.Array.IndexOf(buffer, (byte)10, 0, count) < 0) continue;
                    if (message.Length > 1024 * 1024) break;
                    object response = Data.Parse(Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length));
                    if (!Data.Bool(Data.Get(response, "ok"))) throw new IOException("The local request failed.");
                    return Data.Get(response, "value");
                }
                throw new IOException("The local response is too large.");
            }
        }
        internal object Evaluate(string page, string expression) { return Request("action", "evaluate", "targetId", page, "expression", expression); }
    }

    internal static class NativeBackend {
        private static readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
        private static NativeManager manager;
        internal static async Task<string> Command(string action) {
            await gate.WaitAsync().ConfigureAwait(false);
            try {
                if (action == "start") {
                    if (manager == null || manager.Stopped) {
                        if (manager != null) await manager.Stop().ConfigureAwait(false);
                        manager = await Task.Run(() => new NativeManager()).ConfigureAwait(false);
                    }
                    return Data.Json(await manager.Ready().ConfigureAwait(false));
                }
                if (action == "stop") {
                    if (manager != null) { await manager.Stop().ConfigureAwait(false); return Data.Json(manager.Inspect()); }
                    return Data.Json(Data.Obj("phase", "stopped", "cleanupPending", 0));
                }
                if (action == "status") return Data.Json(State() ?? Data.Obj("phase", "not-running"));
                throw new ArgumentException("Unknown argument.");
            } catch { if (action == "start" && manager != null && !manager.ReadySeen) manager.Stop().GetAwaiter().GetResult(); throw; }
            finally { gate.Release(); }
        }
        internal static Dictionary<string, object> State() { return manager == null || manager.Stopped ? null : manager.Inspect(); }
        internal static object VerifyArtifacts() {
            var manifest = Data.Parse(File.ReadAllText(Path.Combine(Program.PayloadRoot, "dist", "manifest.json")));
            if (Data.Text(manifest, "version") != BuildInfo.Version || Data.Text(manifest, "buildId") != BuildInfo.BundleBuildId || Program.HashFile(Path.Combine(Program.PayloadRoot, "dist", "statusbar.bundle.js")) != Data.Text(manifest, "bundleSha256")) throw new IOException("The embedded package failed its integrity check.");
            return manifest;
        }
        internal static void WriteJson(string path, object value) {
            Directory.CreateDirectory(Path.GetDirectoryName(path)); string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try { File.WriteAllText(temp, Data.Json(value), new UTF8Encoding(false)); if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path); }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
    }

    internal sealed class NativeManager {
        private readonly string runRoot = Program.RunRoot, owner = Guid.NewGuid().ToString(), bundle;
        private readonly SnapshotSource snapshots;
        private readonly CancellationTokenSource stop = new CancellationTokenSource();
        private readonly Task loop;
        private readonly object stateLock = new object();
        private Dictionary<string, object> state;
        private readonly Dictionary<string, Page> pages = new Dictionary<string, Page>();
        private NativePipe pipe; private int targetPid, ticks, discoveryFailures, cleanupPending;
        private DateTime targetStarted;
        private string targetExecutable;
        private bool taskbarRepaired;
        private long nextDiscovery, nextAttach;
        private string phase = "starting", layout = "adaptive";
        internal bool ReadySeen, Stopped;
        private sealed class Page {
            internal string Id, State = "discovered"; internal object Report; internal bool Owned, EverOwned; internal int Failures; internal long RetryAt;
        }
        internal NativeManager() {
            NativeBackend.VerifyArtifacts();
            bundle = File.ReadAllText(Path.Combine(Program.PayloadRoot, "dist", "statusbar.bundle.js"));
            snapshots = new SnapshotSource(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex"), new ApiPrices(Path.Combine(Program.PayloadRoot, "src", "api-prices.json")));
            Directory.CreateDirectory(runRoot); StopPrevious();
            string settings = Path.Combine(runRoot, "settings.json"), old = Path.Combine(Program.DataRoot, "run", "settings.json");
            if (!File.Exists(settings) && File.Exists(old)) File.Copy(old, settings);
            layout = Program.ReadLayout(settings);
            string stopFile = Path.Combine(runRoot, "stop.request"); if (File.Exists(stopFile)) File.Delete(stopFile);
            try { Attach(); } catch { snapshots.Dispose(); throw; }
            Persist(); loop = Task.Run((Action)Run);
        }
        private static object ReadJson(string path, int maxBytes) {
            try { return File.Exists(path) && new FileInfo(path).Length <= maxBytes ? Data.Parse(File.ReadAllText(path)) : null; } catch { return null; }
        }
        private void StopPrevious() {
            string stateFile = Path.Combine(runRoot, "status.json"); object old = ReadJson(stateFile, 1024 * 1024);
            long? pid = Data.Num(old, "pid"); bool live = false;
            if (pid.HasValue && pid != Process.GetCurrentProcess().Id) try { using (var process = Process.GetProcessById((int)pid)) live = !process.HasExited; } catch { }
            if (live && Data.Text(old, "phase") != "stopped") {
                File.WriteAllText(Path.Combine(runRoot, "stop.request"), "stop\n");
                for (int i = 0; i < 60; i++) {
                    Thread.Sleep(200); old = ReadJson(stateFile, 1024 * 1024); if (Data.Text(old, "phase") == "stopped") { live = false; break; }
                    try { using (var process = Process.GetProcessById((int)pid)) if (process.HasExited) { live = false; break; } } catch { live = false; break; }
                }
                if (live) throw new IOException("The previous loader is still stopping. Retry shortly.");
            }
            object previousBridge = ReadJson(Path.Combine(runRoot, "bridge.json"), 4096);
            if (previousBridge != null) try { new NativePipe(previousBridge).Request("action", "close"); } catch { }
            // 旧版 CDP 管理器只通过自己的控制接口正常卸载，不结束客户端。
            object descriptor = ReadJson(Path.Combine(Program.DataRoot, "run", "manager.json"), 4096);
            string token = Data.Text(descriptor, "token"); long? port = Data.Num(descriptor, "controlPort");
            if (Data.Text(descriptor, "controlHost") == "127.0.0.1" && port >= 1024 && port <= 65535 && Regex.IsMatch(token ?? "", @"\A[a-f0-9]{64}\z")) {
                try {
                    string url = "http://127.0.0.1:" + port;
                    var oldState = Program.ReadJson(url + "/status", token, 1500).GetAwaiter().GetResult();
                    if (Data.Text(oldState, "instanceId") == Data.Text(descriptor, "instanceId")) {
                        var request = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url + "/stop"); request.Proxy = null; request.Method = "POST"; request.ContentLength = 0; request.Timeout = 3000; request.Headers[System.Net.HttpRequestHeader.Authorization] = "Bearer " + token;
                        using (var response = request.GetResponse()) { }
                    }
                } catch { }
            }
        }
        private void Attach() {
            var client = Client.Find(); if (client == null || client.NormalProcesses.Count != 1) throw new IOException("Open Codex, then click Reconnect.");
            var target = client.NormalProcesses[0]; targetPid = target.Id;
            targetExecutable = client.Executable; taskbarRepaired = false;
            TryRepairTaskbar();
            using (var process = Process.GetProcessById(targetPid)) targetStarted = process.StartTime;
            string descriptorFile = Path.Combine(runRoot, "bridge.json"); object existing = ReadJson(descriptorFile, 4096);
            if (Data.Num(existing, "pid") == target.Id && Data.Text(existing, "creation") == target.CreationDate) {
                try { var reuse = new NativePipe(existing); if (Data.Text(reuse.Request("action", "ping"), "phase") == "ready") { pipe = reuse; return; } } catch { }
            }
            byte[] random = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
            var descriptor = Data.Obj("schemaVersion", 1, "pid", target.Id, "creation", target.CreationDate, "pipeName", @"\\.\pipe\codex-token-statusbar-native-" + Guid.NewGuid(), "token", BitConverter.ToString(random).Replace("-", "").ToLowerInvariant());
            string bridgeFile = Path.Combine(Program.PayloadRoot, "native", "main-bridge.cjs");
            string source = "const p=globalThis.process;const req=p.mainModule?.require?.bind(p.mainModule)??p.getBuiltinModule('module').createRequire(p.execPath);return req(" + Data.Json(bridgeFile) + ").start({pipeName:" + Data.Json(descriptor["pipeName"]) + ",token:" + Data.Json(descriptor["token"]) + ",electron:req('electron')});";
            string scriptFile = Path.Combine(runRoot, "bootstrap.js"); File.WriteAllText(scriptFile, source, new UTF8Encoding(false));
            NativeBackend.WriteJson(descriptorFile, descriptor);
            string helper = Path.Combine(Program.PayloadRoot, "native", "bin", "native-probe.exe");
            var info = new ProcessStartInfo(helper, "--pid " + target.Id + " --script " + Program.Quote(scriptFile)) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8, WorkingDirectory = Path.GetDirectoryName(helper) };
            object result;
            using (var process = Process.Start(info)) {
                Task<string> stdout = process.StandardOutput.ReadToEndAsync(), stderr = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(8000)) throw new TimeoutException("The local helper timed out. Try reconnecting.");
                string output = stdout.GetAwaiter().GetResult(); stderr.GetAwaiter().GetResult(); result = Data.Parse(output);
                if (process.ExitCode != 0 || !Data.Bool(Data.Get(result, "ok")) || !Data.Bool(Data.Get(result, "hookRemoved")) || !Data.Bool(Data.Get(result, "executedJavaScript")) || !Data.Bool(Data.Get(Data.Get(result, "scriptResult"), "ok"))) {
                    if (Data.Num(result, "scriptStage") == 10) throw new IOException("This version of Codex needs an updated status bar.");
                    throw new IOException("Could not connect to Codex. Try Reconnect.");
                }
            }
            NativeBackend.WriteJson(Path.Combine(runRoot, "probe-result.json"), result); pipe = new NativePipe(descriptor);
            for (int i = 0; i < 10; i++) { try { if (Data.Text(pipe.Request("action", "ping"), "phase") == "ready") return; } catch { } Thread.Sleep(100); }
            throw new IOException("Could not connect to Codex. Try Reconnect.");
        }
        internal async Task<Dictionary<string, object>> Ready() {
            for (int i = 0; i < 80; i++) {
                var current = Inspect();
                if (Data.Text(current, "phase") == "running" && Data.Array(Data.Get(current, "pages")).Any(p => Data.Bool(Data.Get(p, "mounted")))) { ReadySeen = true; return current; }
                if (Stopped) break; await Task.Delay(200).ConfigureAwait(false);
            }
            throw new IOException("The status bar is not ready. Open a chat and retry.");
        }
        private string CleanupExpression() { return "(()=>{const r=window.__codexTokenStatusbarRuntime;if(r?.version===" + Data.Json(BuildInfo.Version) + "&&r.inspect().bridge?.ownerId===" + Data.Json(owner) + "){r.dispose();return true;}return false;})()"; }
        private void Cleanup(Page page) {
            if (page.EverOwned) try { pipe.Evaluate(page.Id, CleanupExpression()); } catch { cleanupPending++; }
            page.Owned = false; page.Report = null;
        }
        private object Eval(Page page, string expression) { return pipe.Evaluate(page.Id, expression); }
        private void Step(Page page) {
            string version = Data.Json(BuildInfo.Version), ownerJson = Data.Json(owner);
            object probe = Eval(page, "(()=>{const r=window.__codexTokenStatusbarRuntime;return {isCodex:window.codexWindowType==='electron'&&window.electronBridge?.windowType==='electron',runtime:r?.version===" + version + "?r.inspect():null,existingVersion:r?.version??null,uiOnly:!r&&!!window.__codexTokenStatusbar};})()");
            if (!Data.Bool(Data.Get(probe, "isCodex"))) { Cleanup(page); page.State = "not-codex-page"; return; }
            object runtime = Data.Get(probe, "runtime");
            if (runtime != null && Data.Text(runtime, "buildId") != BuildInfo.BundleBuildId) {
                object bridge = Data.Get(runtime, "bridge");
                if (!string.IsNullOrEmpty(Data.Text(bridge, "ownerId")) && !Data.Bool(Data.Get(bridge, "connected"))) {
                    Eval(page, "(()=>{const r=window.__codexTokenStatusbarRuntime;const s=r?.inspect();if(s?.version===" + version + "&&s.bridge?.ownerId&&!s.bridge.connected)r.dispose();})()"); runtime = null;
                } else { page.State = "different-build-present"; page.Report = null; page.Owned = false; return; }
            }
            if (Data.Bool(Data.Get(probe, "uiOnly")) || (Data.Get(probe, "existingVersion") != null && Data.Get(probe, "runtime") == null)) { page.State = "other-component-present"; page.Report = null; page.Owned = false; return; }
            string claim = "window.__codexTokenStatusbarRuntime?.claimBridge(" + ownerJson + ",10000)??false";
            bool claimed = Data.Bool(Eval(page, runtime == null ? "(()=>{" + bundle + ";return " + claim + ";})()" : claim));
            if (!claimed) { page.State = "owned-by-another-manager"; page.Report = null; page.Owned = false; return; }
            page.Owned = page.EverOwned = true;
            object report = Eval(page, "window.__codexTokenStatusbarRuntime?.inspect()??null"); if (report == null) throw new IOException();
            object request = Data.Get(Data.Get(report, "ui"), "settingsChange"); string acknowledged = null;
            try {
                string requestId = Data.Text(request, "id"), requested = Data.Text(request, "layout");
                if (requestId != null && requestId.Length <= 100 && Program.Layouts.Contains(requested)) { Program.SaveLayout(Path.Combine(runRoot, "settings.json"), requested); layout = requested; acknowledged = requestId; }
                else layout = Program.ReadLayout(Path.Combine(runRoot, "settings.json"));
                Eval(page, "window.__codexTokenStatusbarRuntime?.setSettings(" + Data.Json(Data.Obj("schemaVersion", 1, "layout", layout)) + "," + Data.Json(acknowledged) + "," + ownerJson + ")");
            } catch { if (request != null) Eval(page, "window.__codexTokenStatusbarRuntime?.settingsError(" + Data.Json(Data.Get(request, "id")) + "," + ownerJson + ")"); }
            object identity = Data.Get(report, "identity");
            if (Data.Text(identity, "status") == "resolved") {
                object snapshot = snapshots.Read(identity);
                if (snapshot != null) Eval(page, "window.__codexTokenStatusbarRuntime?.setLogSnapshot(" + Data.Json(identity) + "," + Data.Json(snapshot) + "," + ownerJson + ")");
            }
            if (!Data.Bool(Eval(page, "window.__codexTokenStatusbarRuntime?.refreshBridge(" + ownerJson + ")??false"))) throw new IOException();
            report = Eval(page, "window.__codexTokenStatusbarRuntime?.inspect()??null"); if (report == null) throw new IOException();
            page.Report = report; page.Failures = 0;
            page.State = !Data.Bool(Data.Get(Data.Get(report, "ui"), "mounted")) ? "waiting-for-composer" : Data.Text(report, "phase") == "adapter-unavailable" ? "adapter-unavailable" : Data.Bool(Data.Get(report, "hasUsage")) ? "ready" : "waiting-for-usage";
        }
        private void Tick() {
            ticks++;
            if (Data.Now >= nextDiscovery) {
                TryRepairTaskbar();
                try {
                    object[] targets = Data.Array(pipe.Request("action", "list")).Take(16).ToArray(); var ids = new HashSet<string>(targets.Select(p => Data.Text(p, "id")));
                    foreach (string id in pages.Keys.Where(id => !ids.Contains(id)).ToArray()) { Cleanup(pages[id]); pages.Remove(id); }
                    foreach (string id in ids) if (id != null && !pages.ContainsKey(id)) pages.Add(id, new Page { Id = id });
                    discoveryFailures = 0; nextDiscovery = Data.Now + 2000; phase = targets.Length > 0 ? "running" : "waiting-for-page";
                } catch {
                    discoveryFailures++; nextDiscovery = Data.Now + Math.Min(10000, 500 * (1 << Math.Min(discoveryFailures, 5))); phase = "waiting-for-endpoint";
                    if (Data.Now >= nextAttach && !TargetAlive()) { nextAttach = Data.Now + 5000; foreach (var page in pages.Values) page.Report = null; pages.Clear(); try { Attach(); nextDiscovery = 0; } catch { } }
                }
            }
            foreach (var page in pages.Values) {
                if (stop.IsCancellationRequested || phase == "waiting-for-endpoint") break;
                if (Data.Now < page.RetryAt) continue;
                try { Step(page); } catch { page.Report = null; page.Owned = false; page.Failures++; page.RetryAt = Data.Now + Math.Min(10000, 500 * (1 << Math.Min(page.Failures - 1, 5))); page.State = "reconnecting"; }
            }
        }
        private void TryRepairTaskbar() {
            if (taskbarRepaired || string.IsNullOrEmpty(targetExecutable)) return;
            try { taskbarRepaired = DesktopIdentity.RepairWindow(targetExecutable, targetPid); } catch { }
        }
        private bool TargetAlive() { try { using (var process = Process.GetProcessById(targetPid)) return !process.HasExited && process.StartTime == targetStarted; } catch { return false; } }
        private void Run() {
            try { while (!stop.IsCancellationRequested && !File.Exists(Path.Combine(runRoot, "stop.request"))) { try { Tick(); } catch (Exception ex) { Program.LogError(ex); phase = "waiting-for-endpoint"; } Persist(); stop.Token.WaitHandle.WaitOne(500); } }
            finally {
                phase = "stopping"; foreach (var page in pages.Values) Cleanup(page); snapshots.Dispose();
                try { pipe.Request("action", "close"); } catch { }
                phase = "stopped"; Stopped = true; Persist();
            }
        }
        private void Persist() {
            var mounted = pages.Values.Where(p => p.Owned && Data.Bool(Data.Get(Data.Get(p.Report, "ui"), "mounted")) && Data.Get(p.Report, "desktop") != null).ToArray();
            var active = mounted.Where(p => Data.Bool(Data.Get(Data.Get(p.Report, "desktop"), "focused"))).OrderByDescending(p => Data.Num(Data.Get(p.Report, "desktop"), "focusedAt") ?? 0).FirstOrDefault()
                ?? mounted.Where(p => Data.Num(Data.Get(p.Report, "desktop"), "focusedAt") > 0).OrderByDescending(p => Data.Num(Data.Get(p.Report, "desktop"), "focusedAt") ?? 0).FirstOrDefault() ?? (mounted.Length == 1 ? mounted[0] : null);
            string language = active == null ? pages.Values.Select(p => Data.Get(p.Report, "ui")).Where(p => Data.Bool(Data.Get(p, "mounted"))).Select(p => Data.Text(p, "language")).FirstOrDefault() : Data.Text(Data.Get(active.Report, "ui"), "language");
            var result = Data.Obj("phase", phase, "endpoint", "native://" + targetPid, "ownerId", owner, "ticks", ticks, "fatal", false, "cleanupPending", cleanupPending, "layout", layout, "language", language,
                "desktop", phase == "running" && active != null ? Data.Get(active.Report, "desktop") : null,
                "pages", pages.Values.Select(p => Data.Obj("id", p.Id, "state", p.State, "mounted", Data.Bool(Data.Get(Data.Get(p.Report, "ui"), "mounted")), "language", Data.Get(Data.Get(p.Report, "ui"), "language"), "layout", Data.Get(Data.Get(p.Report, "ui"), "layout"), "presentation", Data.Get(Data.Get(p.Report, "ui"), "presentation"), "hasUsage", Data.Bool(Data.Get(p.Report, "hasUsage")), "hasCost", Data.Bool(Data.Get(p.Report, "hasCost")), "costComplete", Data.Bool(Data.Get(p.Report, "costComplete")), "priceVersion", Data.Get(p.Report, "priceVersion"), "identity", Data.Get(p.Report, "identity"), "failures", p.Failures)).ToArray(),
                "events", new object[0], "pid", Process.GetCurrentProcess().Id, "targetPid", targetPid, "version", BuildInfo.Version, "buildId", BuildInfo.BundleBuildId, "transport", "native-pipe", "backend", "dotnet-framework", "requiresNode", false, "debugging", false, "updatedAt", DateTime.UtcNow.ToString("o"));
            lock (stateLock) state = result;
            try { NativeBackend.WriteJson(Path.Combine(runRoot, "status.json"), result); } catch (Exception ex) { Program.LogError(ex); }
        }
        internal Dictionary<string, object> Inspect() { lock (stateLock) return state; }
        internal async Task Stop() {
            stop.Cancel(); if (await Task.WhenAny(loop, Task.Delay(15000)).ConfigureAwait(false) != loop) throw new IOException("The helper has not confirmed it stopped. Retry Unload.");
            await loop.ConfigureAwait(false);
        }
    }
}
