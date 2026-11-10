using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class LauncherUiTests {
    private static readonly List<string> checks = new List<string>();
    private static readonly Stopwatch clock = Stopwatch.StartNew();
    private static string report, stage = "初始化";
    private static int ticks, finished;
    private static Exception failure;
    private static Task<string> closingOperation;
    private static MethodInfo runNode;
    private static Task<string> Run(string script, int timeout) {
        return (Task<string>)runNode.Invoke(null, new object[] { new[] { "-e", script }, timeout });
    }
    private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static void Save(bool passed, string error) {
        if (Interlocked.CompareExchange(ref finished, 1, 0) != 0) return;
        var result = new { passed = passed, checks = checks.ToArray(), uiTicks = ticks, stage = stage, elapsedMs = clock.ElapsedMilliseconds, error = error,
            scope = "real-winforms-message-loop-with-node-helper-without-client-actions" };
        string json = new JavaScriptSerializer().Serialize(result);
        File.WriteAllText(report, json, new UTF8Encoding(false)); Console.WriteLine(json);
    }
    [STAThread]
    private static int Main(string[] args) {
        report = Path.GetFullPath(args[2]);
        // 看门狗只结束本测试进程，绝不结束 Codex 或其他进程。
        using (var watchdog = new System.Threading.Timer(_ => { Save(false, "窗口消息循环或助手调用超时"); Environment.Exit(2); }, null, 12000, Timeout.Infinite)) {
            try {
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                var app = Assembly.LoadFrom(Path.GetFullPath(args[0]));
                var program = app.GetType("CodexTokenStatusbar.Program");
                var flags = BindingFlags.NonPublic | BindingFlags.Static;
                program.GetField("PayloadRoot", flags).SetValue(null, Path.GetFullPath(args[1]));
                runNode = program.GetMethod("RunNode", flags);
                using (var window = new Form { ShowInTaskbar = false, Opacity = 0, StartPosition = FormStartPosition.Manual, Left = -3000, Top = -3000 })
                using (var heartbeat = new System.Windows.Forms.Timer { Interval = 40 }) {
                    heartbeat.Tick += (s, e) => Interlocked.Increment(ref ticks);
                    window.Shown += async (s, e) => {
                        try {
                            Assert(SynchronizationContext.Current is WindowsFormsSynchronizationContext, "未建立真实窗口同步上下文");
                            heartbeat.Start();
                            stage = "首次 Node 检测与助手调用";
                            int before = ticks;
                            string first = await Run("setTimeout(() => process.stdout.write('ready'), 400)", 3000);
                            Assert(first == "ready" && ticks - before >= 3, "首次助手调用阻塞窗口线程");
                            checks.Add("真实窗口上下文中的首次 Node 检测不阻塞消息循环");
                            stage = "已缓存运行时的助手调用";
                            before = ticks;
                            Assert(await Run("setTimeout(() => process.stdout.write('cached'), 300)", 3000) == "cached", "已缓存运行时调用失败");
                            Assert(ticks - before >= 3, "已缓存运行时仍阻塞窗口线程");
                            checks.Add("后续助手调用期间窗口计时器持续响应");
                            stage = "助手超时";
                            before = ticks;
                            try { await Run("setTimeout(() => {}, 5000)", 250); throw new Exception("未触发助手超时"); }
                            catch (TimeoutException) { }
                            Assert(ticks - before >= 2, "助手超时等待阻塞窗口线程");
                            checks.Add("助手超时期间窗口保持响应，超时正常返回");
                            stage = "助手等待期间关闭窗口";
                            closingOperation = Run("setTimeout(() => process.stdout.write('closed'), 300)", 3000);
                        } catch (Exception ex) { failure = ex; }
                        finally { window.Close(); }
                    };
                    Application.Run(window);
                }
                if (failure != null) throw failure;
                if (closingOperation == null || closingOperation.GetAwaiter().GetResult() != "closed") throw new Exception("关闭窗口后助手未正常完成");
                checks.Add("助手等待期间可关闭窗口，后台任务正常完成");
                stage = "完成"; Save(true, null); return 0;
            } catch (Exception ex) { Save(false, ex.ToString()); return 1; }
        }
    }
}
