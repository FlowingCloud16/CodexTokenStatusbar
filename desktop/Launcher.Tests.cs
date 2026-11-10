using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class LauncherTests {
    private static Assembly app;
    private static readonly List<string> checks = new List<string>();
    private const BindingFlags Static = BindingFlags.Static | BindingFlags.NonPublic;
    private const BindingFlags Instance = BindingFlags.Instance | BindingFlags.NonPublic;
    private static object Call(string type, string method, params object[] args) { return app.GetType("CodexTokenStatusbar." + type).GetMethod(method, Static).Invoke(null, args); }
    private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    private static void TimeoutCheck(bool body) {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var server = Task.Run(async () => {
            using (var client = await listener.AcceptTcpClientAsync()) {
                if (body) {
                    byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n");
                    await client.GetStream().WriteAsync(header, 0, header.Length);
                }
                await Task.Delay(1500);
            }
        });
        var clock = Stopwatch.StartNew();
        var operation = (Task<Dictionary<string, object>>)Call("Program", "ReadJson", "http://127.0.0.1:" + port + "/status", null, 250);
        try {
            Assert(Task.WhenAny(operation, Task.Delay(2500)).GetAwaiter().GetResult() == operation, "本地 HTTP 超时未生效");
            try { operation.GetAwaiter().GetResult(); throw new Exception("未抛出超时"); }
            catch (TimeoutException) { }
            Assert(clock.ElapsedMilliseconds < 2000, "本地 HTTP 超时超过预算");
            checks.Add(body ? "响应头已返回但响应体挂起时，连接仍在明确期限内取消" : "本地监听器不返回响应时，连接在明确期限内取消");
        } finally { listener.Stop(); server.GetAwaiter().GetResult(); }
    }
    [STAThread]
    private static int Main(string[] args) {
        try {
            app = Assembly.LoadFrom(Path.GetFullPath(args[0]));
            string report = Path.GetFullPath(args[1]);
            // 测试只加载自有程序集；不会调用启动、退出或键盘注入方法。
            Assert(Convert.ToString(Call("Client", "LaunchArguments", 23456)) == "--remote-debugging-address=127.0.0.1 --remote-debugging-port=23456", "正常客户端启动参数不符");
            try { Call("Client", "LaunchArguments", 1); throw new Exception("未拒绝无效端口"); } catch (TargetInvocationException ex) { Assert(ex.InnerException is ArgumentOutOfRangeException, "无效端口错误类型不符"); }
            checks.Add("启动参数仅设置本地连接，不覆盖用户目录，并拒绝无效端口");
            string oldClient = @"C:\Program Files\WindowsApps\OpenAI.Codex_26.1103.4239.0_x64__test\app\ChatGPT.exe";
            string newClient = @"C:\Program Files\WindowsApps\OpenAI.Codex_99.9999.1.0_x64__test\app\ChatGPT.exe";
            Func<string, bool> present = file => file == oldClient || file == newClient;
            Assert(Convert.ToString(Call("Client", "SelectExecutable", new[] { newClient }, oldClient, oldClient, present)) == newClient, "运行中新版没有优先于旧版");
            Assert(Convert.ToString(Call("Client", "SelectExecutable", new string[0], newClient, oldClient, present)) == newClient, "未运行时没有选择当前注册新版");
            Assert(Call("Client", "SelectExecutable", new[] { @"C:\Other\ChatGPT.exe" }, null, oldClient, new Func<string, bool>(file => file != oldClient)) == null, "误识别其他程序或不存在的旧版");
            checks.Add("安装发现不锁定版本，运行中实例优先于注册安装，注册新版优先于旧目录，并拒绝其他 ChatGPT 程序");
            foreach (string version in new[] { "v24.0.0", "v24.21.0\r\n", "v25.1.0" }) Assert((bool)Call("Program", "SupportsNode", version), "未接受兼容 Node 版本：" + version);
            foreach (string version in new[] { "v22.21.0", "v23.9.0", "24.0.0", "v24", "v24.0.0-extra", "v999999999999.0.0", "" }) Assert(!(bool)Call("Program", "SupportsNode", version), "错误接受 Node 版本：" + version);
            checks.Add("运行时版本检查接受 Node 24 及更新版本，拒绝过旧和无效版本");
            string[] paths = (string[])Call("Program", "NodeCandidates", (object)new[] { "", ".", "relative", "C:relative", "  \"C:\\Program Files\\nodejs\"  ", "c:\\program files\\NODEJS", "C:\\工具 空格\\node" });
            Assert(paths.Length == 2 && paths[0] == "C:\\Program Files\\nodejs\\node.exe" && paths[1] == "C:\\工具 空格\\node\\node.exe", "Node 搜索路径未正确过滤、去重或保留中文空格");
            checks.Add("只搜索本机绝对路径，过滤工作目录与相对路径，去重并保留中文空格");
            bool bundled = (bool)app.GetType("CodexTokenStatusbar.BuildInfo").GetField("BundlesNode", Static).GetValue(null);
            using (var stream = app.GetManifestResourceStream("statusbar.payload")) using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                Assert((archive.GetEntry("runtime/node.exe") != null) == bundled, "资源中的 Node 与构建类型不符");
                Assert((archive.GetEntry("runtime/LICENSE") != null) == bundled, "随附 Node 许可证与构建类型不符");
                Assert(archive.GetEntry("licenses/lucide-LICENSE") != null, "缺少图标许可证");
                Assert(archive.GetEntry("licenses/codex-statusbar-MIT") != null, "缺少生成速度参考项目许可证");
                bool portable = app.GetType("CodexTokenStatusbar.NativeBackend") != null;
                Assert(archive.GetEntry("dist/statusbar.bundle.js") != null && archive.GetEntry("src/api-prices.json") != null
                    && archive.GetEntry(portable ? "native/main-bridge.cjs" : "tools/statusbar-manager.mjs") != null, "缺少核心功能资源");
                if (portable) {
                    Assert(app.GetType("CodexTokenStatusbar.Program").GetMethod("RunNode", Static) == null && app.GetType("CodexTokenStatusbar.Program").GetMethod("ResolveNodeAsync", Static) == null, "免安装版仍包含外部 Node 调用入口");
                    Assert(archive.Entries.Count == 8 && archive.GetEntry("native/bin/native-probe.exe") != null && archive.GetEntry("native/bin/statusbar-probe.dll") != null, "原生组件缺失或混入多余资源");
                    Assert(archive.Entries.All(entry => !entry.FullName.StartsWith("tools/") && !entry.FullName.EndsWith("node.exe")), "免安装版仍携带 Node 后台");
                }
                Assert(archive.Entries.All(entry => !entry.FullName.EndsWith(".map") && !entry.FullName.Contains("node_modules/") && !entry.FullName.StartsWith("reports/") && !entry.FullName.StartsWith("tests/")), "资源混入开发产物");
            }
            if (!bundled) Assert(new FileInfo(args[0]).Length < 1024 * 1024, "轻量 EXE 超过 1 MiB");
            checks.Add("构建类型与嵌入资源一致，保留全部功能及许可证，轻量版不包含 Node 或开发产物");
            var nativeInput = app.GetType("CodexTokenStatusbar.Native").GetNestedType("INPUT", BindingFlags.NonPublic);
            Assert(Marshal.SizeOf(nativeInput) == 40, "x64 INPUT 结构大小错误");
            checks.Add("Windows x64 键盘输入结构布局正确，测试未发送按键");
            TimeoutCheck(false); TimeoutCheck(true);

            Application.EnableVisualStyles();
            var type = app.GetType("CodexTokenStatusbar.Dashboard");
            var dashboard = (Form)Activator.CreateInstance(type, Instance, null, new object[] { true }, null);
            string settingsTestFile = Path.Combine(Path.GetTempPath(), "CodexStatusbar-layout-tests-" + Guid.NewGuid().ToString("N") + ".json");
            try {
                // 共享布局格式仅写入独立临时文件，不改动用户的布局偏好。
                Call("Program", "SaveLayout", settingsTestFile, "icon");
                Assert(Convert.ToString(Call("Program", "ReadLayout", settingsTestFile)) == "icon", "布局未持久化");
                Call("Program", "SaveLayout", settingsTestFile, "separate");
                Assert(Convert.ToString(Call("Program", "ReadLayout", settingsTestFile)) == "separate", "软件内选择没有保存布局");
                try { Call("Program", "SaveLayout", settingsTestFile, "invalid"); throw new Exception("未拒绝未知布局"); }
                catch (TargetInvocationException ex) { Assert(ex.InnerException is ArgumentOutOfRangeException, "未知布局错误类型不符"); }
                checks.Add("共享布局设置可保存和读回，未知布局被拒绝，测试不改用户偏好");
                var serializer = new JavaScriptSerializer();
                Action<string> render = json => { ((Task)type.GetMethod("RenderStatus", Instance).Invoke(dashboard, new object[] { json == null ? null : serializer.Deserialize<Dictionary<string, object>>(json) })).GetAwaiter().GetResult(); };
                Func<string> heading = () => ((Label)type.GetField("heading", Instance).GetValue(dashboard)).Text;
                render("{\"phase\":\"running\",\"pages\":[{\"mounted\":false}]}");
                Assert(heading() == "Waiting for a chat", "仅发现页面不能宣告已挂载");
                render("{\"phase\":\"running\",\"pages\":[{\"mounted\":true}]}");
                Assert(heading() == "Status bar loaded", "已挂载页面未显示成功");
                checks.Add("真实 JSON 数组可识别，只在存在已挂载页面时显示加载完成");
                render(null); Assert(heading() == "Not connected", "失联后仍保留旧成功状态");
                checks.Add("失联会清除加载成功状态");
                render("{\"phase\":\"running\",\"language\":\"zh\",\"pages\":[{\"mounted\":true}]}");
                Assert(heading() == "状态栏已加载", "加载器未跟随客户端切换中文");
                Assert(((Button)type.GetField("load", Instance).GetValue(dashboard)).Text == "打开 Codex", "中文按钮未翻译");
                Assert(((NotifyIcon)type.GetField("tray", Instance).GetValue(dashboard)).ContextMenuStrip.Items[2].Text == "退出加载器", "中文托盘菜单未翻译");
                Assert(Convert.ToString(Call("Program", "ReadLayout", settingsTestFile)) == "separate", "语言切换改动了布局偏好");
                Assert(((Button)type.GetField("load", Instance).GetValue(dashboard)).PreferredSize.Width <= ((Button)type.GetField("load", Instance).GetValue(dashboard)).Width, "主按钮中文文字宽度不足");
                render("{\"phase\":\"running\",\"language\":\"ja-JP\",\"pages\":[{\"mounted\":true}]}");
                Assert(heading() == "Status bar loaded", "非中文环境未回退英文");
                Assert(((Button)type.GetField("load", Instance).GetValue(dashboard)).Text == "Open Codex", "语言切换后按钮未恢复英文");
                checks.Add("加载器跟随已连接客户端切换中文，按钮和托盘同步，其他语言回退英文");
                Call("Localizer", "SetLanguage", "zh-CN");
                Assert(Convert.ToString(Call("Localizer", "Error", "An older loader is running. Unload it before starting this version.")).Contains("旧版加载器"), "中文错误提示未翻译");
                Assert(Convert.ToString(Call("Localizer", "Error", "This lightweight build needs Node.js 24 or newer. Install Node.js or use the standalone build.")).Contains("轻量版需要"), "缺失 Node 的中文提示未翻译");
                Call("Localizer", "SetLanguage", "fr-FR");
                Assert(Convert.ToString(Call("Localizer", "Error", "原始中文日志")) == "The action could not be completed. The error was saved to the local log.", "原始中文诊断泄漏到英文界面");
                checks.Add("错误提示跟随语言，未知原始诊断留在日志，英文界面保持英文");
                type.GetField("busy", Instance).SetValue(dashboard, true);
                Assert(!((Task<bool>)type.GetMethod("StopAsync", Instance).Invoke(dashboard, null)).GetAwaiter().GetResult(), "忙碌时错误确认卸载成功");
                checks.Add("忙碌时拒绝确认退出，避免遗留新创建的后台助手");
                type.GetField("busy", Instance).SetValue(dashboard, false);
                render("{\"phase\":\"waiting-for-endpoint\",\"pages\":[]}");
            } finally {
                if (File.Exists(settingsTestFile)) File.Delete(settingsTestFile);
                ((System.Windows.Forms.Timer)type.GetField("timer", Instance).GetValue(dashboard)).Dispose();
                ((NotifyIcon)type.GetField("tray", Instance).GetValue(dashboard)).Dispose(); dashboard.Dispose();
            }
            var result = new { passed = checks.Count, checks = checks, scope = "compiled-executable-without-client-launch-or-keyboard-actions" };
            string output = new JavaScriptSerializer().Serialize(result); File.WriteAllText(report, output, new UTF8Encoding(false)); Console.WriteLine(output);
            return 0;
        } catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
