using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CodexTokenStatusbar {
    internal static class Program {
        internal static readonly string DataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexTokenStatusbar");
#if NATIVE_EXPERIMENT
        internal static readonly string RunRoot = Path.Combine(DataRoot, "native-experiment");
#else
        internal static readonly string RunRoot = Path.Combine(DataRoot, "run");
#endif
        internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024 };
        internal static string PayloadRoot;
#if !NO_NODE
        private static string nodeExecutable;
        private static readonly SemaphoreSlim NodeGate = new SemaphoreSlim(1, 1);
#endif
        internal static EventWaitHandle ActivateEvent;
        [STAThread]
        private static int Main(string[] args) {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
#if NO_NODE
                DesktopIdentity.InitializeLoader();
#endif
                if (args.Length == 2 && args[0] == "--self-test") return SelfTest(args[1]);
                if (args.Length != 0) throw new InvalidOperationException("Unknown argument.");
                bool created;
                string suffix = Hash(Encoding.UTF8.GetBytes(Environment.UserName)).Substring(0, 16);
#if NATIVE_EXPERIMENT
                suffix += "-native-preview";
#endif
                using (var mutex = new Mutex(true, "Local\\CodexTokenStatusbar-" + suffix, out created)) {
                    ActivateEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\CodexTokenStatusbar-activate-" + suffix);
                    if (!created) { ActivateEvent.Set(); return 0; }
                    try { PayloadRoot = ExtractPayload(); Application.Run(new Dashboard()); }
                    finally { ActivateEvent.Dispose(); mutex.ReleaseMutex(); }
                }
                return 0;
            } catch (Exception ex) {
                LogError(ex);
                MessageBox.Show(Localizer.Error(ex.Message), Localizer.Text("Codex Token Statusbar"), MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
        internal static string Hash(byte[] data) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").ToLowerInvariant(); }
        internal static string HashFile(string file) { using (var sha = SHA256.Create()) using (var stream = File.OpenRead(file)) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
        private static string ExtractPayload() {
            string root = Path.Combine(DataRoot, "versions", BuildInfo.Version + "-" + BuildInfo.PayloadHash.Substring(0, 12));
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("statusbar.payload")) {
                if (stream == null) throw new InvalidDataException("The embedded package is missing.");
                using (var memory = new MemoryStream()) {
                    stream.CopyTo(memory);
                    byte[] bytes = memory.ToArray();
                    if (Hash(bytes) != BuildInfo.PayloadHash) throw new InvalidDataException("The embedded package failed its integrity check.");
                    using (var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read)) {
                        if (archive.Entries.Count > 128 || archive.Entries.Sum(e => e.Length) > 256L * 1024 * 1024) throw new InvalidDataException("The embedded package is too large.");
                        foreach (var entry in archive.Entries) {
                            string file = Path.GetFullPath(Path.Combine(root, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                            if (!file.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || entry.FullName.Contains(":")) throw new InvalidDataException("The embedded package contains an invalid path.");
                            if (entry.FullName.EndsWith("/")) continue;
                            byte[] content;
                            using (var input = entry.Open()) using (var output = new MemoryStream()) { input.CopyTo(output); content = output.ToArray(); }
                            if (File.Exists(file) && HashFile(file) == Hash(content)) continue;
                            Directory.CreateDirectory(Path.GetDirectoryName(file));
                            // 缓存仅存放本程序的资源，不覆盖 Codex 安装目录或用户配置。
                            string temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
                            File.WriteAllBytes(temporary, content);
                            try { if (File.Exists(file)) File.Replace(temporary, file, null); else File.Move(temporary, file); }
                            finally { if (File.Exists(temporary)) File.Delete(temporary); }
                        }
                    }
                }
            }
            return root;
        }
        private static int SelfTest(string report) {
            PayloadRoot = ExtractPayload();
#if NO_NODE
            NativeBackend.VerifyArtifacts();
            var client = Client.Find();
            var result = new Dictionary<string, object> {
                { "version", BuildInfo.Version }, { "embeddedPackageVerified", true },
                { "runtime", "dotnet-framework" }, { "requiresNode", false }, { "nodeRuntime", "none" },
                { "sqliteVersion", Marshal.PtrToStringAnsi(SystemSqlite.sqlite3_libversion()) },
                { "installedClientFound", client != null }, { "normalProcesses", client == null ? 0 : client.NormalProcesses.Count },
                { "launchArguments", "" }, { "backend", "native-pipe" }, { "opensDebugPort", false },
                { "changesClientPackage", false }, { "overridesUserProfile", false },
                { "launchesClientDuringSelfTest", false }, { "payloadDirectory", PayloadRoot }, { "managerArtifactsChecked", true }
            };
            File.WriteAllText(Path.GetFullPath(report), Data.Json(result), new UTF8Encoding(false));
            return 0;
#else
            var node = RunNode(new[] { "--version" }, 10000).GetAwaiter().GetResult();
            var client = Client.Find();
            var result = new Dictionary<string, object> {
                { "version", BuildInfo.Version }, { "embeddedPackageVerified", true },
                { "nodeVersion", node.Trim() }, { "nodeRuntime", BuildInfo.BundlesNode ? "bundled" : "local" },
                { "nodeExecutable", ResolveNodeAsync().GetAwaiter().GetResult() }, { "installedClientFound", client != null },
                { "normalProcesses", client == null ? 0 : client.NormalProcesses.Count },
#if NATIVE_EXPERIMENT
                { "launchArguments", "" }, { "backend", "native-pipe" }, { "opensDebugPort", false },
#else
                { "launchArguments", Client.LaunchArguments(19225) },
#endif
                { "changesClientPackage", false }, { "overridesUserProfile", false },
                { "launchesClientDuringSelfTest", false }, { "payloadDirectory", PayloadRoot }
            };
            var commandSamples = new Dictionary<string, string> {
                { "quoted space", "a b" }, { "quote", "a\"b" }, { "trailing slash", "a b\\" }, { "empty", "" }
            };
            foreach (var sample in commandSamples) {
                var quoted = Quote(sample.Value);
                if (!quoted.StartsWith("\"") || !quoted.EndsWith("\"")) throw new InvalidDataException("Argument quoting failed.");
            }
            string echo = RunNode(new[] { "-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", "--" }.Concat(commandSamples.Values), 10000).GetAwaiter().GetResult();
            string[] actualArguments = Json.Deserialize<string[]>(echo);
            if (!actualArguments.SequenceEqual(commandSamples.Values)) throw new InvalidDataException("Argument round-trip failed.");
            result["argumentQuotingChecked"] = commandSamples.Count;
            RunNode(new[] { "--input-type=module", "-e", "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(':memory:'); db.close(); if (typeof WebSocket !== 'function') process.exit(1);" }, 10000).GetAwaiter().GetResult();
            result["runtimeCapabilitiesChecked"] = true;
            if (client != null) {
                string buildId = RunNode(new[] { "--input-type=module", "-e", "import { loadManagerArtifacts } from './tools/manager-artifacts.mjs'; const artifacts = await loadManagerArtifacts(); process.stdout.write(artifacts.manifest.buildId);" }, 30000).GetAwaiter().GetResult();
                if (buildId.Trim() != BuildInfo.BundleBuildId) throw new InvalidDataException("The embedded package failed its integrity check.");
                result["managerArtifactsChecked"] = true;
            }
            // 自检只运行所选 Node，不启动、关闭或操作 Codex。
            File.WriteAllText(Path.GetFullPath(report), Json.Serialize(result), new UTF8Encoding(false));
            return 0;
#endif
        }
        internal static string Quote(string value) {
            var output = new StringBuilder("\""); int slashes = 0;
            foreach (char c in value) {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') { output.Append('\\', slashes * 2 + 1).Append(c); slashes = 0; continue; }
                output.Append('\\', slashes).Append(c); slashes = 0;
            }
            return output.Append('\\', slashes * 2).Append('"').ToString();
        }
        internal static bool SupportsNode(string version) {
            var match = Regex.Match(version.Trim(), @"\Av(\d+)\.\d+\.\d+\z");
            int major;
            return match.Success && int.TryParse(match.Groups[1].Value, out major) && major >= 24;
        }
        internal static string[] NodeCandidates(IEnumerable<string> directories) {
            var candidates = new List<string>();
            foreach (string directory in directories) {
                if (string.IsNullOrWhiteSpace(directory)) continue;
                string expanded = Environment.ExpandEnvironmentVariables(directory.Trim().Trim('"'));
                // 仅从明确的本机绝对路径查找，不从工作目录执行同名文件。
                if (!Regex.IsMatch(expanded, @"\A[A-Za-z]:[\\/]")) continue;
                try {
                    string candidate = Path.GetFullPath(Path.Combine(expanded, "node.exe"));
                    if (!candidates.Contains(candidate, StringComparer.OrdinalIgnoreCase)) candidates.Add(candidate);
                } catch (ArgumentException) { } catch (NotSupportedException) { } catch (PathTooLongException) { }
            }
            return candidates.ToArray();
        }
#if !NO_NODE
        internal static async Task<string> ResolveNodeAsync() {
            await NodeGate.WaitAsync().ConfigureAwait(false);
            try {
                if (nodeExecutable != null) return nodeExecutable;
                if (BuildInfo.BundlesNode) {
                    string embedded = Path.Combine(PayloadRoot, "runtime", "node.exe");
                    if (!File.Exists(embedded)) throw new InvalidDataException("The embedded Node.js runtime is missing.");
                    nodeExecutable = embedded; return nodeExecutable;
                }
                var directories = new List<string> {
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs")
                };
                directories.AddRange((Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator));
                foreach (string candidate in NodeCandidates(directories)) {
                    if (!File.Exists(candidate)) continue;
                    try {
                        string version = await RunNodeAt(candidate, new[] { "--version" }, 5000).ConfigureAwait(false);
                        if (SupportsNode(version)) { nodeExecutable = candidate; return nodeExecutable; }
                    } catch (Exception ex) {
                        if (!(ex is System.ComponentModel.Win32Exception || ex is InvalidOperationException || ex is TimeoutException || ex is IOException || ex is UnauthorizedAccessException)) throw;
                    }
                }
                throw new InvalidOperationException("This lightweight build needs Node.js 24 or newer. Install Node.js or use the standalone build.");
            } finally { NodeGate.Release(); }
        }
        internal static async Task<string> RunNode(IEnumerable<string> args, int timeout) {
            string executable = await ResolveNodeAsync().ConfigureAwait(false);
            return await RunNodeAt(executable, args, timeout).ConfigureAwait(false);
        }
        private static async Task<string> RunNodeAt(string executable, IEnumerable<string> args, int timeout) {
            var info = new ProcessStartInfo(executable, string.Join(" ", args.Select(Quote))) {
                WorkingDirectory = PayloadRoot, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            };
            using (var child = Process.Start(info)) {
                Task<string> stdout = child.StandardOutput.ReadToEndAsync(), stderr = child.StandardError.ReadToEndAsync();
                // 后台助手不依赖窗口同步上下文，首次检测与超时均让出窗口线程。
                bool done = await Task.Run(() => child.WaitForExit(timeout)).ConfigureAwait(false);
                // 只可终止本次创建的命令行子进程，不按名称杀掉 Codex 或其他 Node。
                if (!done) { try { child.Kill(); } catch { } throw new TimeoutException("The local helper timed out. Try reconnecting."); }
                string output = await stdout.ConfigureAwait(false), error = await stderr.ConfigureAwait(false);
                if (child.ExitCode != 0) throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? "The local helper failed." : error.Trim());
                return output;
            }
        }
#endif
        internal static Task<string> Manager(string action, string endpoint, string asar, int controlPort) {
#if NO_NODE
            return NativeBackend.Command(action);
#elif NATIVE_EXPERIMENT
            return RunNode(new[] { Path.Combine(PayloadRoot, "tools", "native-loader.mjs"), action }, 30000);
#else
            return RunNode(new[] { Path.Combine(PayloadRoot, "tools", "statusbar-manager.mjs"), action, "--json", "--run-directory", RunRoot,
                "--endpoint", endpoint, "--control-port", controlPort.ToString(), "--asar", asar }, 30000);
#endif
        }
        internal static Dictionary<string, object> Parse(string text) { return Json.Deserialize<Dictionary<string, object>>(text); }
        internal static string Value(Dictionary<string, object> data, string key) { return data != null && data.ContainsKey(key) && data[key] != null ? Convert.ToString(data[key]) : ""; }
        internal static readonly string[] Layouts = { "adaptive", "separate", "icon" };
        internal static string ReadLayout(string filename) {
            try {
                if (!File.Exists(filename) || new FileInfo(filename).Length > 4096) return "adaptive";
                string value = Value(Parse(File.ReadAllText(filename)), "layout");
                return Layouts.Contains(value) ? value : "adaptive";
            } catch { return "adaptive"; }
        }
        internal static void SaveLayout(string filename, string layout) {
            if (!Layouts.Contains(layout)) throw new ArgumentOutOfRangeException("layout");
            Directory.CreateDirectory(Path.GetDirectoryName(filename));
            string temporary = filename + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try {
                File.WriteAllText(temporary, Json.Serialize(new Dictionary<string, object> { { "schemaVersion", 1 }, { "layout", layout } }), new UTF8Encoding(false));
                if (File.Exists(filename)) File.Replace(temporary, filename, null); else File.Move(temporary, filename);
            } finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        internal static void LogError(Exception error) {
            try {
                Directory.CreateDirectory(DataRoot); string file = Path.Combine(DataRoot, "launcher.log");
                if (File.Exists(file) && new FileInfo(file).Length > 1024 * 1024) File.WriteAllText(file, "");
                File.AppendAllText(file, DateTimeOffset.Now.ToString("o") + " " + error.GetType().Name + ": " + error.Message + Environment.NewLine, new UTF8Encoding(false));
            } catch { }
        }
        internal static async Task<Dictionary<string, object>> ReadJson(string url, string token, int timeout) {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Proxy = null; request.Timeout = timeout; request.ReadWriteTimeout = timeout;
            if (token != null) request.Headers[HttpRequestHeader.Authorization] = "Bearer " + token;
            Task<Dictionary<string, object>> operation = ReadJsonBody(request);
            if (await Task.WhenAny(operation, Task.Delay(timeout)) != operation) {
                request.Abort();
                try { await operation; } catch { }
                throw new TimeoutException("The local connection did not respond in time.");
            }
            return await operation;
        }
        private static async Task<Dictionary<string, object>> ReadJsonBody(HttpWebRequest request) {
            using (var response = await request.GetResponseAsync()) using (var reader = new StreamReader(response.GetResponseStream())) {
                var text = new StringBuilder(); var buffer = new char[4096]; int count;
                while ((count = await reader.ReadAsync(buffer, 0, buffer.Length)) > 0) {
                    text.Append(buffer, 0, count);
                    if (text.Length > 1024 * 1024) throw new InvalidDataException("The local response is too large.");
                }
                return Parse(text.ToString());
            }
        }
        internal static async Task<Dictionary<string, object>> ReadStatus() {
            try {
#if NO_NODE
                return await Task.FromResult(NativeBackend.State());
#elif NATIVE_EXPERIMENT
                return await Task.Run(() => {
                    string stateFile = Path.Combine(RunRoot, "status.json");
                    if (!File.Exists(stateFile) || new FileInfo(stateFile).Length > 1024 * 1024
                        || DateTime.UtcNow - File.GetLastWriteTimeUtc(stateFile) > TimeSpan.FromSeconds(15)) return null;
                    var state = Parse(File.ReadAllText(stateFile));
                    int pid;
                    if (Value(state, "phase") == "stopped" || Value(state, "transport") != "native-pipe"
                        || !int.TryParse(Value(state, "pid"), out pid)) return null;
                    using (var process = Process.GetProcessById(pid)) { if (process.HasExited) return null; }
                    return state;
                });
#else
                string descriptorFile = Path.Combine(RunRoot, "manager.json");
                if (!File.Exists(descriptorFile)) return null;
                var descriptor = Parse(File.ReadAllText(descriptorFile));
                int port;
                if (Value(descriptor, "controlHost") != "127.0.0.1" || !int.TryParse(Value(descriptor, "controlPort"), out port) || port < 1024 || port > 65535 || !Regex.IsMatch(Value(descriptor, "token"), "\\A[a-f0-9]{64}\\z")) return null;
                var status = await ReadJson("http://127.0.0.1:" + port + "/status", Value(descriptor, "token"), 1500);
                return Value(status, "instanceId") == Value(descriptor, "instanceId") ? status : null;
#endif
            } catch { return null; }
        }
        internal static int FreePort() { var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); int port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port; }
    }
    internal sealed class ClientProcess {
        internal int Id;
        internal string CommandLine;
        internal string CreationDate;
        internal int DebugPort {
            get {
                var match = Regex.Match(CommandLine ?? "", @"(?:^|\s)--remote-debugging-port=(\d+)(?:\s|$)"); int port;
                return match.Success && int.TryParse(match.Groups[1].Value, out port) && port > 0 && port <= 65535 ? port : 0;
            }
        }
    }
    internal sealed class Client {
        internal string Executable;
        internal List<ClientProcess> NormalProcesses = new List<ClientProcess>();
        internal string Asar { get { return Path.Combine(Path.GetDirectoryName(Executable), "resources", "app.asar"); } }
        internal static string LaunchArguments(int port) {
            if (port < 1024 || port > 65535) throw new ArgumentOutOfRangeException("port");
            return "--remote-debugging-address=127.0.0.1 --remote-debugging-port=" + port;
        }
        internal static Client Find() {
#if NO_NODE
            string preferredExecutable = null;
#else
            var profile = Program.Parse(File.ReadAllText(Path.Combine(Program.PayloadRoot, "client-profile.json")));
            string preferred = Convert.ToString(profile["defaultAsarPath"]).Replace('/', Path.DirectorySeparatorChar);
            string preferredExecutable = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(preferred)), "ChatGPT.exe");
#endif
            var processes = new List<Tuple<string, ClientProcess>>();
            using (var searcher = new ManagementObjectSearcher("SELECT ProcessId, ExecutablePath, CommandLine, CreationDate FROM Win32_Process WHERE Name='ChatGPT.exe'")) {
                foreach (ManagementObject item in searcher.Get()) {
                    string file = Convert.ToString(item["ExecutablePath"]), command = Convert.ToString(item["CommandLine"]);
                    if (!IsCodexExecutable(file) || string.IsNullOrWhiteSpace(command)) continue;
                    if (Regex.IsMatch(command, @"(?:^|\s)--type(?:=|\s)") || Regex.IsMatch(command, @"(?:^|\s)--user-data-dir(?:=|\s)")) continue;
                    processes.Add(Tuple.Create(file, new ClientProcess { Id = Convert.ToInt32(item["ProcessId"]), CommandLine = command, CreationDate = Convert.ToString(item["CreationDate"]) }));
                }
            }
            // 运行中的正常实例优先；未运行时读取当前用户注册的安装，不锁定旧版目录。
            string executable = SelectExecutable(processes.Select(item => item.Item1).ToArray(), null, null, File.Exists);
            if (executable == null) executable = SelectExecutable(new string[0], RegisteredExecutable(), preferredExecutable, File.Exists);
            if (executable == null) return null;
            var client = new Client { Executable = executable };
            client.NormalProcesses.AddRange(processes.Where(item => string.Equals(item.Item1, executable, StringComparison.OrdinalIgnoreCase)).Select(item => item.Item2));
            return client;
        }
        private static bool IsCodexExecutable(string filename) {
            try {
                if (string.IsNullOrWhiteSpace(filename) || !Path.IsPathRooted(filename) || !string.Equals(Path.GetFileName(filename), "ChatGPT.exe", StringComparison.OrdinalIgnoreCase)) return false;
                string appDirectory = Path.GetDirectoryName(filename);
                return string.Equals(Path.GetFileName(appDirectory), "app", StringComparison.OrdinalIgnoreCase)
                    && Path.GetFileName(Path.GetDirectoryName(appDirectory)).StartsWith("OpenAI.Codex_", StringComparison.OrdinalIgnoreCase);
            } catch { return false; }
        }
        internal static string SelectExecutable(string[] running, string registered, string preferred, Func<string, bool> exists) {
            return running.Concat(new[] { registered, preferred }).FirstOrDefault(file => IsCodexExecutable(file) && exists(file));
        }
        private static string RegisteredExecutable() {
            try {
                string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
                var info = new ProcessStartInfo(powershell, "-NoProfile -NonInteractive -Command \"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1 -ExpandProperty InstallLocation\"") {
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8
                };
                using (var process = Process.Start(info)) {
                    var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
                    if (!process.WaitForExit(8000) || process.ExitCode != 0) return null;
                    string directory = output.GetAwaiter().GetResult().Trim();
                    return directory.Length == 0 ? null : Path.Combine(directory, "app", "ChatGPT.exe");
                }
            } catch { return null; }
        }
        internal async Task QuitNormally() {
            foreach (var item in NormalProcesses) {
                var current = Find();
                if (current == null || !current.NormalProcesses.Any(p => p.Id == item.Id && p.CreationDate == item.CreationDate))
                    throw new InvalidOperationException("The Codex process changed. Retry Load so the current process can be checked.");
                using (var process = Process.GetProcessById(item.Id)) {
                    process.Refresh(); IntPtr window = process.MainWindowHandle;
                    if (window == IntPtr.Zero) throw new InvalidOperationException("Use Codex's Quit command, then click Load again. No process was terminated.");
                    Native.ShowWindowAsync(window, 9);
                    Native.SetForegroundWindow(window);
                    await Task.Delay(150);
                    uint foregroundPid; Native.GetWindowThreadProcessId(Native.GetForegroundWindow(), out foregroundPid);
                    if (foregroundPid != item.Id) throw new InvalidOperationException("Codex could not be focused. Use its Quit command, then click Load again.");
                    // 使用 Codex 的正常退出快捷键，只向已核对的前台进程发送，超时不强行结束。
                    Native.SendQuitShortcut();
                }
            }
            for (int i = 0; i < 150; i++) {
                await Task.Delay(200);
                if (Find().NormalProcesses.Count == 0) return;
            }
            throw new InvalidOperationException("Codex is still running. Finish any close prompt or choose Quit, then click Load again. The loader will not force-terminate it.");
        }
        internal void Start(int port) {
            if (Find().NormalProcesses.Count != 0) throw new InvalidOperationException("Codex is already running. Retry Load after it has fully exited.");
            var info = new ProcessStartInfo(Executable, LaunchArguments(port)) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(Executable) };
            // 保留正常用户目录及原环境，不设置 user-data-dir、CODEX_HOME 或修改官方快捷方式。
            using (var process = Process.Start(info)) { }
        }
#if NATIVE_EXPERIMENT
        internal void StartNormally() {
            if (Find().NormalProcesses.Count != 0) return;
#if NO_NODE
            DesktopIdentity.Launch(Executable);
#else
            var info = new ProcessStartInfo(Executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(Executable) };
            using (var process = Process.Start(info)) { }
#endif
        }
#endif
    }
    internal static class Native {
        [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("user32.dll")] internal static extern bool ShowWindowAsync(IntPtr window, int command);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
        [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] input, int size);
        [StructLayout(LayoutKind.Sequential)] private struct INPUT { internal uint type; internal INPUTUNION data; }
        [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION { [FieldOffset(0)] internal KEYBDINPUT key; [FieldOffset(0)] internal MOUSEINPUT mouse; }
        [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT { internal ushort vk; internal ushort scan; internal uint flags; internal uint time; internal UIntPtr extra; }
        [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT { internal int dx; internal int dy; internal uint mouseData; internal uint flags; internal uint time; internal UIntPtr extra; }
        internal static void SendQuitShortcut() {
            var inputs = new INPUT[4];
            ushort[] keys = { 0x11, 0x51, 0x51, 0x11 };
            for (int i = 0; i < 4; i++) { inputs[i].type = 1; inputs[i].data.key.vk = keys[i]; inputs[i].data.key.flags = i >= 2 ? 2u : 0u; }
            if (SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT))) != 4) throw new InvalidOperationException("The quit shortcut could not be sent. Quit Codex manually and retry Load.");
        }
    }
    internal static class Localizer {
        internal static string Language = "en";
        private static readonly Dictionary<string, string> Chinese = new Dictionary<string, string> {
            { "Codex Statusbar", "Codex 状态栏" }, { "Reconnect", "重新连接" },
            { "Codex Statusbar · Native preview", "Codex 状态栏 · 原生注入实验版" },
            { "Open Codex, then click Reconnect.", "请打开 Codex，再点击“重新连接”。" },
            { "Open Codex from the Start menu, then reconnect.", "请从开始菜单打开 Codex，再重新连接。" },
            { "This version of Codex needs an updated status bar.", "请更新状态栏以支持当前 Codex。" },
            { "Could not connect to Codex. Try Reconnect.", "连接失败，请重新连接。" },
            { "The status bar is not ready. Open a chat and retry.", "请打开对话后重试。" },
            { "The previous loader is still stopping. Retry shortly.", "旧版仍在退出，请稍后重试。" },
            { "Open Codex normally, then click Reconnect.", "请正常打开 Codex，然后点击“重新连接”。" },
            { "This runtime needs a native ABI update. Codex has not been restarted.", "当前运行时需要适配原生接口，Codex 未被重启。" },
            { "Follows the current chat. Connected to Codex.", "跟随当前对话，已连接 Codex。" },
            { "Overview", "概览" }, { "Appearance", "外观" }, { "Cost", "计费" }, { "Selected", "已选中" },
            { "Speed", "速度" }, { "Cache hit", "缓存命中" }, { "Token usage", "Token 用量" }, { "API estimate", "API 估算费用" },
            { "Current conversation", "当前对话" }, { "Open Codex", "打开 Codex" },
            { "Close this window to keep running in the tray.", "关闭窗口后继续在托盘运行" },
            { "Prioritizes speed and cache; adds cost, then token usage as space allows.", "优先速度与缓存，有空间再显示费用和用量。" },
            { "Shows all four metrics below the native toolbar.", "四项统计显示在原生工具栏下方。" },
            { "Open one compact button to see all statistics.", "点击一个紧凑的统计按钮，查看完整用量和费用。" },
            { "Conversation · API estimate", "当前对话 · API 估算" },
            { "Open a connected chat to see usage and cost details.", "连接并打开对话后，显示用量和费用详情。" },
            { "Unit prices and calculation", "单价与计算口径" }, { "Hide unit prices and calculation", "收起单价与计算口径" },
            { "Expanded", "已展开" }, { "Collapsed", "已收起" },
            { "Prices are USD per 1M tokens. Cached input is included in input; reasoning is included in output. Each response uses its own model and price tier.", "单价单位为美元／百万 token。缓存已包含在输入，推理已包含在输出；每个响应按对应模型与价格档位计费。" },
            { "API estimates do not represent subscription charges or your actual bill.", "API 估算不代表订阅扣款或实际账单。" },
            { "Codex Token Statusbar", "Codex Token 状态栏" },
            { "Your Codex. Your chats. One native-style status bar.", "为当前 Codex 对话显示原生风格的用量状态栏。" },
            { "Preparing…", "正在准备…" }, { "Load status bar", "加载状态栏" }, { "Restart Codex & load", "重启 Codex 并加载" },
            { "Unload", "卸载" }, { "Open", "打开" },
            { "Unload status bar", "卸载状态栏" }, { "Quit loader", "退出加载器" },
            { "The loader is available in the system tray.", "加载器已收进系统托盘。" },
            { "Updating the local helper…", "正在更新本地助手…" }, { "Unloading the previous build before loading this one.", "正在卸载旧组件，随后加载新版本。" },
            { "The interface is loaded. Usage data is unavailable while the runtime adapter reconnects.", "界面已加载，正在重新连接运行时适配器，暂时无法获取用量。" },
            { "Checking Codex…", "正在检查 Codex…" }, { "Connecting to your installed Codex. Unrecognized versions are loaded automatically.", "正在连接已安装的 Codex，未知版本也会自动尝试加载。" },
            { "One restart is needed", "首次加载需要重启" },
            { "Finish any running chats, then choose Restart Codex & load. Your existing account and chat directory will be used.", "请先结束正在运行的对话，再点击“重启 Codex 并加载”。将使用现有账号与对话目录。" },
            { "The loader manages a local connection on this computer.", "加载器会自动管理本机连接。" },
            { "Waiting for Codex to quit…", "正在等待 Codex 退出…" }, { "Using Codex's normal Quit command. Resolve any confirmation in Codex to continue.", "正在使用 Codex 的正常退出命令。如有退出确认，请在 Codex 中处理。" },
            { "Opening Codex…", "正在打开 Codex…" }, { "Starting your installed client with its existing account and chats.", "正在打开已安装的客户端，使用现有账号和对话。" },
            { "Connecting…", "正在连接…" }, { "Waiting for Codex to prepare its local interface.", "正在等待 Codex 准备本地连接。" },
            { "Could not load", "加载失败" }, { "Unloaded", "已卸载" }, { "The status bar and local helper have stopped. Codex stays open.", "状态栏和本地助手已停止，Codex 保持打开。" },
            { "Unload needs attention", "卸载需要处理" }, { "Not connected", "尚未连接" }, { "Click Load status bar to try again.", "点击“加载状态栏”重试。" },
            { "Status bar loaded", "状态栏已加载" }, { "The status bar follows the current chat. Close this window to keep it running in the tray.", "状态栏会跟随当前对话。关闭此窗口后，加载器继续在托盘中运行。" },
            { "Waiting for Codex", "正在等待 Codex" }, { "If Codex was opened from its original shortcut, use Load to reconnect. A restart may be needed.", "如果从官方快捷方式打开了 Codex，请点击“加载状态栏”重新连接，可能需要重启。" },
            { "Waiting for a chat", "正在等待对话" }, { "Open a local chat in Codex. The status bar loads when its composer becomes available.", "请在 Codex 中打开一个本地对话，输入区就绪后会加载状态栏。" },
            { "Local connection · {0} page(s) loaded · v{1}", "本地连接 · 已加载 {0} 个页面 · v{1}" },
            { "Status bar layout", "状态栏布局" }, { "Model-first adaptive", "模型优先自适应" },
            { "Separate statistics row", "统计独立一行" }, { "Single icon", "单图标入口" },
            { "Changes apply to all chats and are saved automatically.", "切换后立即应用于所有对话，并自动保存。" },
            { "Could not save the layout. The action could not be completed. The error was saved to the local log.", "布局保存失败，操作未能完成，错误已记录到本地日志。" },
            { "Created 'Codex with Token Statusbar' in the Start menu. Keep this EXE in its current location.", "已在开始菜单创建“Codex with Token Statusbar”。请保留此 EXE 的当前位置。" },
            { "Unknown argument.", "无法识别启动参数。" }, { "The embedded package is missing.", "随附资源包缺失。" },
            { "The embedded package failed its integrity check.", "随附资源包未通过完整性校验。" }, { "The embedded package is too large.", "随附资源包超出大小限制。" },
            { "The embedded package contains an invalid path.", "随附资源包包含无效路径。" },
            { "The embedded Node.js runtime is missing.", "随附的 Node.js 运行时缺失。" },
            { "This lightweight build needs Node.js 24 or newer. Install Node.js or use the standalone build.", "轻量版需要本机安装 Node.js 24 或更新版本。请安装 Node.js，或使用自带运行时的独立版。" },
            { "The local helper timed out. Try reconnecting.", "本地助手响应超时，请重新连接后重试。" }, { "The local helper failed.", "本地助手运行失败。" },
            { "The local connection did not respond in time.", "本地连接响应超时。" }, { "The local response is too large.", "本地响应超出大小限制。" },
            { "The Codex process changed. Retry Load so the current process can be checked.", "Codex 进程已变化，请重新点击“加载状态栏”核验当前进程。" },
            { "Use Codex's Quit command, then click Load again. No process was terminated.", "请使用 Codex 的退出命令，再点击“加载状态栏”。未终止任何进程。" },
            { "Codex could not be focused. Use its Quit command, then click Load again.", "无法将 Codex 切到前台，请手动退出后再点击“加载状态栏”。" },
            { "Codex is still running. Finish any close prompt or choose Quit, then click Load again. The loader will not force-terminate it.", "Codex 仍在运行，请处理退出确认或手动退出，再点击“加载状态栏”。加载器不会强制终止它。" },
            { "Codex is already running. Retry Load after it has fully exited.", "Codex 已在运行，请等待完全退出后重试加载。" },
            { "The quit shortcut could not be sent. Quit Codex manually and retry Load.", "无法发送退出快捷键，请手动退出 Codex 后重试加载。" },
            { "An older loader is running. Unload it before starting this version.", "旧版加载器仍在运行，请先退出旧版再启动此版本。" },
            { "Codex installation was not found. Install or open Codex, then retry.", "未找到 Codex 安装，请安装或打开 Codex 后重试。" },
            { "More than one normal Codex instance was found. Quit the extra instance and retry.", "发现多个普通 Codex 实例，请退出多余实例后重试。" },
            { "Codex did not expose its local interface. Open Codex, then reconnect. A restart may be needed.", "未能连接 Codex 的本地接口。请打开 Codex 后重新连接，可能需要重启。" },
            { "The helper has not confirmed it stopped. Retry Unload.", "本地助手尚未确认停止，请重试卸载。" },
            { "The helper is not responding, so unload cannot be confirmed. Reconnect and retry Unload. No process was force-terminated.", "本地助手没有响应，暂时无法确认卸载。请重新连接后重试卸载。未强制终止任何进程。" },
            { "The action could not be completed. The error was saved to the local log.", "操作未能完成，错误已记录到本地日志。" },
        };
        internal static bool SetLanguage(string locale) {
            if (string.IsNullOrWhiteSpace(locale)) return false;
            string next = Regex.IsMatch(locale.Trim(), @"\Azh(?:[-_]|$)", RegexOptions.IgnoreCase) ? "zh" : "en";
            if (Language == next) return false;
            Language = next; return true;
        }
        internal static string Text(string english) {
            string translated;
            return Language == "zh" && Chinese.TryGetValue(english, out translated) ? translated : english;
        }
        internal static string Format(string english, params object[] values) { return string.Format(CultureInfo.InvariantCulture, Text(english), values); }
        internal static string Error(string message) {
            if (Chinese.ContainsKey(message)) return Text(message);
            // 原始诊断保留在日志中，未知错误不把另一种语言的日志直接放进界面。
            return Text("The action could not be completed. The error was saved to the local log.");
        }
    }
    internal sealed partial class Dashboard : Form {
        private readonly Label title = new NativeLabel();
        private readonly Label heading = new NativeLabel(), detail = new NativeLabel(), connection = new NativeLabel();
        private readonly Button load = new NativeButton(), stop = new NativeButton(), reconnect = new NativeButton();
        private readonly NotifyIcon tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private bool busy, restarting, exiting, polling, monitorStatus;
        private Client client;
        private string endpoint = "http://127.0.0.1:19225";
#if !NATIVE_EXPERIMENT
        private int controlPort = 19224;
#endif
        private string headingSource = "Preparing…", detailSource = "", connectionSource = "";
        private bool detailIsError;
        private int mountedPages = -1;
        internal Dashboard() : this(false) { }
        internal Dashboard(bool previewOnly) {
            InitializeView();
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open", null, (s, e) => Restore());
            menu.Items.Add("Unload status bar", null, async (s, e) => await StopAsync());
            menu.Items.Add("Quit loader", null, async (s, e) => { if (await StopAsync()) { exiting = true; Close(); } else Restore(); });
            tray.Icon = Icon; tray.Text = "Codex Token Statusbar"; tray.ContextMenuStrip = menu; tray.Visible = !previewOnly;
            tray.DoubleClick += (s, e) => Restore();
            timer.Interval = 2000; timer.Tick += async (s, e) => {
                if (Program.ActivateEvent != null && Program.ActivateEvent.WaitOne(0)) {
                    Restore();
                    // 再次双击入口时恢复启动流程，避免 Codex 退出后只能打开一个空闲的托盘窗口。
                    if (!busy && !restarting) await LoadAsync(false);
                }
                await RefreshAsync();
            }; if (!previewOnly) timer.Start();
            FormClosing += (s, e) => { if (!exiting && !previewOnly) { e.Cancel = true; Hide(); tray.ShowBalloonTip(2000, Localizer.Text("Codex Token Statusbar"), Localizer.Text("The loader is available in the system tray."), ToolTipIcon.Info); } };
            FormClosed += (s, e) => { timer.Dispose(); tray.Dispose(); };
            if (!previewOnly) Shown += async (s, e) => await LoadAsync(false);
            ApplyLanguage(null);
        }
        private void Restore() { Show(); WindowState = FormWindowState.Normal; Activate(); }
        private void ApplyLanguage(string locale) {
            Localizer.SetLanguage(locale);
            Text = tray.Text = Localizer.Text("Codex Statusbar");
#if NATIVE_EXPERIMENT && !NO_NODE
            Text = tray.Text = Localizer.Text("Codex Statusbar · Native preview");
#endif
            RefreshViewLanguage();
            tray.ContextMenuStrip.Items[0].Text = Localizer.Text("Open");
            tray.ContextMenuStrip.Items[1].Text = Localizer.Text("Unload status bar");
            tray.ContextMenuStrip.Items[2].Text = Localizer.Text("Quit loader");
            SetState(headingSource, detailSource, detailIsError);
            connection.Text = mountedPages >= 0 ? Localizer.Format("Local connection · {0} page(s) loaded · v{1}", mountedPages, BuildInfo.Version) : Localizer.Text(connectionSource);
        }
        private void SetState(string title, string text, bool error = false) {
            headingSource = title; detailSource = text; detailIsError = error;
            heading.Text = Localizer.Text(title); detail.Text = error ? Localizer.Error(text) : Localizer.Text(text);
            detail.Visible = !string.IsNullOrWhiteSpace(detail.Text);
            UpdateViewState();
        }
        private void SetConnection(string text) { mountedPages = -1; connectionSource = text; connection.Text = Localizer.Text(text); }
        private void SetBusy(bool value) {
            busy = value; load.Enabled = stop.Enabled = reconnect.Enabled = !value;
        }
        private async Task LoadAsync(bool allowRestart) {
            if (busy) return;
            SetBusy(true);
            try {
#if NATIVE_EXPERIMENT
                client = await Task.Run(() => Client.Find());
                if (client == null) throw new InvalidOperationException("Codex installation was not found. Install or open Codex, then retry.");
                if (client.NormalProcesses.Count > 1) throw new InvalidOperationException("More than one normal Codex instance was found. Quit the extra instance and retry.");
                SetState("Connecting…", "");
                if (client.NormalProcesses.Count == 0) {
                    await Task.Run(() => client.StartNormally());
                    for (int attempt = 0; attempt < 50; attempt++) {
                        await Task.Delay(200);
                        client = await Task.Run(() => Client.Find());
                        if (client != null && client.NormalProcesses.Count == 1) break;
                    }
                }
                var nativeStatus = Program.Parse(await Program.Manager("start", "", "", 0));
                monitorStatus = true; restarting = false;
                await RenderStatus(nativeStatus);
#else
                var existing = await Program.ReadStatus();
                if (existing != null) ApplyLanguage(Program.Value(existing, "language"));
                if (existing != null) monitorStatus = true;
                if (existing != null && Program.Value(existing, "version") != BuildInfo.Version) throw new InvalidOperationException("An older loader is running. Unload it before starting this version.");
                client = await Task.Run(() => Client.Find());
                if (client == null) throw new InvalidOperationException("Codex installation was not found. Install or open Codex, then retry.");
                if (existing != null && Program.Value(existing, "buildId") != BuildInfo.BundleBuildId) {
                    SetState("Updating the local helper…", "Unloading the previous build before loading this one.");
                    await Program.Manager("stop", endpoint, client.Asar, controlPort); existing = null;
                }
                SetState("Checking Codex…", "Connecting to your installed Codex. Unrecognized versions are loaded automatically.");
                if (client.NormalProcesses.Count > 1) throw new InvalidOperationException("More than one normal Codex instance was found. Quit the extra instance and retry.");
                var normal = client.NormalProcesses.FirstOrDefault();
                if (normal != null && normal.DebugPort == 0) {
                    if (!allowRestart) {
                        restarting = true; load.Text = Localizer.Text("Restart Codex & load");
                        SetState("One restart is needed", "Finish any running chats, then choose Restart Codex & load. Your existing account and chat directory will be used.");
                        SetConnection("The loader manages a local connection on this computer.");
                        return;
                    }
                    SetState("Waiting for Codex to quit…", "Using Codex's normal Quit command. Resolve any confirmation in Codex to continue.");
                    await client.QuitNormally(); normal = null;
                }
                int port;
                if (normal == null) {
                    port = Program.FreePort();
                    SetState("Opening Codex…", "Starting your installed client with its existing account and chats.");
                    client.Start(port);
                } else port = normal.DebugPort;
                endpoint = "http://127.0.0.1:" + port;
                restarting = false; load.Text = Localizer.Text("Load status bar");
                SetState("Connecting…", "Waiting for Codex to prepare its local interface.");
                bool ready = false;
                for (int i = 0; i < 100; i++) {
                    await Task.Delay(300);
                    if (await CheckEndpoint(endpoint)) { ready = true; break; }
                }
                if (!ready) throw new InvalidOperationException("Codex did not expose its local interface. Open Codex, then reconnect. A restart may be needed.");
                if (existing != null && Program.Value(existing, "endpoint") != endpoint) await Program.Manager("stop", endpoint, client.Asar, controlPort);
                if (existing == null) controlPort = Program.FreePort();
                await Program.Manager("start", endpoint, client.Asar, controlPort);
                monitorStatus = true;
                for (int i = 0; i < 20; i++) {
                    await Task.Delay(300); var status = await Program.ReadStatus();
                    if (status != null && Program.Value(status, "phase") == "running") break;
                }
                await RenderStatus(await Program.ReadStatus());
#endif
            } catch (Exception ex) { Program.LogError(ex); SetState("Could not load", ex.Message, true); Restore(); }
            finally { SetBusy(false); }
        }
        private static async Task<bool> CheckEndpoint(string endpoint) {
            try {
                var version = await Program.ReadJson(endpoint + "/json/version", null, 800);
                Uri socket;
                return Uri.TryCreate(Program.Value(version, "webSocketDebuggerUrl"), UriKind.Absolute, out socket) && socket.Scheme == "ws" && socket.Host == "127.0.0.1" && socket.Port == new Uri(endpoint).Port;
            } catch { return false; }
        }
        private async Task<bool> StopAsync() {
            if (busy) return false; SetBusy(true);
            try {
#if NATIVE_EXPERIMENT
                var nativeStopped = Program.Parse(await Program.Manager("stop", "", "", 0));
                if (Program.Value(nativeStopped, "phase") != "stopped") throw new InvalidOperationException("The helper has not confirmed it stopped. Retry Unload.");
#else
                var status = await Program.ReadStatus();
                if (status != null) {
                    var profile = Program.Parse(File.ReadAllText(Path.Combine(Program.PayloadRoot, "client-profile.json")));
                    string asar = client != null ? client.Asar : Program.Value(profile, "defaultAsarPath");
                    // 停止自己的助手无需重新验证已经更新或被移除的客户端文件。
                    await Program.Manager("stop", endpoint, asar, controlPort);
                    var stopped = Program.Parse(File.ReadAllText(Path.Combine(Program.RunRoot, "status.json")));
                    if (Program.Value(stopped, "phase") != "stopped") throw new InvalidOperationException("The helper has not confirmed it stopped. Retry Unload.");
                } else if (File.Exists(Path.Combine(Program.RunRoot, "manager.json"))) {
                    string stateFile = Path.Combine(Program.RunRoot, "status.json");
                    if (!File.Exists(stateFile) || Program.Value(Program.Parse(File.ReadAllText(stateFile)), "phase") != "stopped")
                        throw new InvalidOperationException("The helper is not responding, so unload cannot be confirmed. Reconnect and retry Unload. No process was force-terminated.");
                }
#endif
                monitorStatus = false;
                restarting = false; load.Text = Localizer.Text("Load status bar");
                SetState("Unloaded", "The status bar and local helper have stopped. Codex stays open."); SetConnection("");
                return true;
            } catch (Exception ex) { Program.LogError(ex); SetState("Unload needs attention", ex.Message, true); return false; }
            finally { SetBusy(false); }
        }
        private async Task RefreshAsync() {
            if (busy || polling) return; polling = true;
            try { var status = await Program.ReadStatus(); if (status != null || monitorStatus) await RenderStatus(status); }
            finally { polling = false; }
        }
        private Task RenderStatus(Dictionary<string, object> status) {
            if (status == null) { SetState("Not connected", "Click Load status bar to try again."); SetConnection(""); return Task.FromResult(0); }
            string locale = Program.Value(status, "language");
            if (Localizer.SetLanguage(locale)) ApplyLanguage(locale);
            string phase = Program.Value(status, "phase"); endpoint = Program.Value(status, "endpoint");
            var pages = status.ContainsKey("pages") ? status["pages"] as System.Collections.IEnumerable : null;
            int mounted = 0; bool adapterUnavailable = false;
            if (pages != null) foreach (Dictionary<string, object> page in pages) {
                if (Program.Value(page, "mounted") == "True") mounted++;
                if (Program.Value(page, "state") == "adapter-unavailable") adapterUnavailable = true;
            }
#if NATIVE_EXPERIMENT
            if (phase == "running" && mounted > 0) SetState("Status bar loaded", adapterUnavailable ? "The interface is loaded. Usage data is unavailable while the runtime adapter reconnects." : "");
            else if (phase == "waiting-for-endpoint") SetState("Waiting for Codex", "Open Codex normally, then click Reconnect.");
#else
            if (phase == "running" && mounted > 0) SetState("Status bar loaded", adapterUnavailable ? "The interface is loaded. Usage data is unavailable while the runtime adapter reconnects." : "Follows the current chat. Connected to Codex.");
            else if (phase == "waiting-for-endpoint") SetState("Waiting for Codex", "If Codex was opened from its original shortcut, use Load to reconnect. A restart may be needed.");
#endif
            else SetState("Waiting for a chat", "Open a local chat in Codex. The status bar loads when its composer becomes available.");
            desktopData = phase == "running" && mounted > 0 ? ObjectValue(status, "desktop") : null;
            if (desktopData != null && Program.Value(desktopData, "theme") != theme) ApplyTheme(Program.Value(desktopData, "theme"));
            UpdateMetrics();
            mountedPages = mounted; connectionSource = "";
            connection.Text = Localizer.Format("Local connection · {0} page(s) loaded · v{1}", mounted, BuildInfo.Version);
            return Task.FromResult(0);
        }
    }
}
