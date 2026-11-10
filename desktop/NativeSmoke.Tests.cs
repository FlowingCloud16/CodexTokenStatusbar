using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class NativeSmokeTests {
    private const BindingFlags Static = BindingFlags.Static | BindingFlags.NonPublic;
    private const BindingFlags Instance = BindingFlags.Instance | BindingFlags.NonPublic;
    private static Form window;
    private static Type dashboard;
    private static int ticks;
    private static object Field(string name) { return dashboard.GetField(name, Instance).GetValue(window); }
    private static Task InvokeTask(string method, params object[] args) { return (Task)dashboard.GetMethod(method, Instance).Invoke(window, args); }
    private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static async Task WaitMetrics() {
        for (int attempt = 0; attempt < 40; attempt++) {
            await Task.Delay(250);
            await InvokeTask("RefreshAsync");
            var values = (Label[])Field("metricValues");
            if (values[1].Text != "--" && values[2].Text != "--" && values[3].Text != "--") return;
        }
        throw new Exception("原生通道没有恢复缓存、用量和费用。");
    }
    private static void Capture(string filename) {
        window.Refresh();
        using (var full = new Bitmap(window.Width, window.Height)) {
            window.DrawToBitmap(full, new Rectangle(Point.Empty, full.Size));
            var origin = window.PointToScreen(Point.Empty);
            using (var client = full.Clone(new Rectangle(origin.X - window.Left, origin.Y - window.Top,
                window.ClientSize.Width, window.ClientSize.Height), full.PixelFormat)) client.Save(filename);
        }
    }
    [STAThread]
    private static int Main(string[] args) {
        int exitCode = 1;
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        var app = Assembly.LoadFrom(Path.GetFullPath(args[0]));
        string reportPrefix = args.Length > 4 ? args[4] : "native-preview";
        var program = app.GetType("CodexTokenStatusbar.Program");
        program.GetField("PayloadRoot", Static).SetValue(null, Path.GetFullPath(args[1]));
        dashboard = app.GetType("CodexTokenStatusbar.Dashboard");
        window = (Form)Activator.CreateInstance(dashboard, Instance, null, new object[] { true }, null);
        window.StartPosition = FormStartPosition.Manual; window.Location = new Point(-3000, -3000);
        window.ShowInTaskbar = false; window.Opacity = 0;
        var timer = new System.Windows.Forms.Timer { Interval = 50 };
        timer.Tick += (s, e) => ticks++; timer.Start();
        var checks = new List<string>();
        window.Shown += async (s, e) => {
            try {
                using (var codex = Process.GetProcessById(int.Parse(args[3]))) {
                    DateTime before = codex.StartTime;
                    await InvokeTask("LoadAsync", false); await WaitMetrics();
                    Assert((string)Field("headingSource") == "Status bar loaded", "首次原生加载失败。");
                    checks.Add("打包后的 EXE 在真实窗口消息循环中完成原生加载，缓存、用量和费用恢复");
                    var stopped = (Task<bool>)dashboard.GetMethod("StopAsync", Instance).Invoke(window, new object[0]);
                    Assert(await stopped, "原生卸载失败。");
                    Assert((string)Field("headingSource") == "Unloaded", "原生卸载状态错误。");
                    checks.Add("卸载按钮确认停止自己的后台，不退出 Codex");
                    await InvokeTask("LoadAsync", false); await WaitMetrics();
                    Assert((string)Field("headingSource") == "Status bar loaded", "原生再次加载失败。");
                    codex.Refresh(); Assert(!codex.HasExited && codex.StartTime == before, "Codex 进程发生重启。");
                    checks.Add("卸载后再次加载成功，Codex PID 和启动时间保持不变");
                    Assert(ticks > 10, "原生加载期间窗口消息循环没有持续响应。");
                    checks.Add("窗口消息循环在原生加载和卸载过程中持续响应");
                    Capture(Path.Combine(args[2], reportPrefix + "-window.png"));
                    if (app.GetType("CodexTokenStatusbar.NativeBackend") != null) {
                        Assert(await (Task<bool>)dashboard.GetMethod("StopAsync", Instance).Invoke(window, new object[0]), "检查结束后卸载失败。");
                        checks.Add("检查结束正常卸载进程内后台，不遗留测试桥接");
                    }
                    File.WriteAllText(Path.Combine(args[2], reportPrefix + "-smoke-checks.json"),
                        new JavaScriptSerializer().Serialize(new { passed = true, checks = checks, uiTicks = ticks, realCodexActions = true }), new UTF8Encoding(false));
                    exitCode = 0;
                }
            } catch (Exception error) { Console.Error.WriteLine(error.ToString()); }
            finally { timer.Stop(); window.Close(); }
        };
        Application.Run(window); timer.Dispose();
        return exitCode;
    }
}
