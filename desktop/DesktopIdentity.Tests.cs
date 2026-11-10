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
using System.Xml;

internal static class DesktopIdentityTests {
    private const BindingFlags Static = BindingFlags.Static | BindingFlags.NonPublic;
    private const BindingFlags Instance = BindingFlags.Instance | BindingFlags.NonPublic;
    private static Type identity;
    private static readonly List<string> checks = new List<string>();
    private static object Call(string name, params object[] args) { return identity.GetMethod(name, Static).Invoke(null, args); }
    private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static string ApplicationId(object application) { return (string)application.GetType().GetField("ApplicationId", Instance).GetValue(application); }
    [STAThread]
    private static int Main(string[] args) {
        try {
            var app = Assembly.LoadFrom(Path.GetFullPath(args[0])); identity = app.GetType("CodexTokenStatusbar.DesktopIdentity");
            var document = new XmlDocument();
            document.LoadXml("<Package xmlns='urn:test'><Applications><Application Id='Helper' Executable='app/helper.exe'/><Application Id='ChangedMainEntry' Executable='app/ChatGPT.exe'/></Applications></Package>");
            object entry = Call("ReadManifest", @"C:\Package\app\ChatGPT.exe", @"C:\Package", "OpenAI.Codex_Test", document);
            Assert(ApplicationId(entry) == "OpenAI.Codex_Test!ChangedMainEntry", "没有按实际可执行文件识别主入口");
            checks.Add("读取实际主入口，忽略辅助程序，不固定应用入口名");
            document.LoadXml("<Package><Applications><Application Id='Outside' Executable='../ChatGPT.exe'/></Applications></Package>");
            Assert(Call("ReadManifest", @"C:\ChatGPT.exe", @"C:\Package", "OpenAI.Codex_Test", document) == null, "允许越过安装目录");
            checks.Add("拒绝安装目录以外的入口");
            Application.EnableVisualStyles();
            using (var window = new Form { ShowInTaskbar = false, Opacity = 0, Left = -3000, Top = -3000, StartPosition = FormStartPosition.Manual }) {
                window.Show(); Application.DoEvents();
                Call("SetWindowApplicationId", window.Handle, "CodexTokenStatusbar.Test");
                Assert((string)Call("ReadWindowApplicationId", window.Handle) == "CodexTokenStatusbar.Test", "窗口应用标识写入后不一致"); window.Close();
            }
            checks.Add("Windows 窗口关联写入和读回正常");
            using (var icon = Icon.ExtractAssociatedIcon(Path.GetFullPath(args[0])))
            using (var bitmap = icon.ToBitmap()) {
                bitmap.Save(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[1])), "taskbar-loader-icon.png"));
                using (var generic = SystemIcons.Application.ToBitmap()) {
                    bool different = bitmap.Size != generic.Size;
                    for (int y = 0; !different && y < bitmap.Height; y++) for (int x = 0; x < bitmap.Width; x++) if (bitmap.GetPixel(x, y) != generic.GetPixel(x, y)) { different = true; break; }
                    Assert(different, "EXE 仍使用系统默认图标");
                }
            }
            checks.Add("EXE 已内嵌独立图标，提取结果与系统默认图标不同");
            string beforeId = null, afterId = null; bool sameProcess = true; uint activatedPid = 0;
            if (args.Length >= 4) {
                using (var process = Process.GetProcessById(int.Parse(args[2]))) {
                    DateTime beforeStart = process.StartTime; process.Refresh();
                    beforeId = (string)Call("ReadWindowApplicationId", process.MainWindowHandle);
                    var installed = Call("Resolve", args[3]);
                    Assert((bool)Call("RepairWindow", args[3], process.Id), "当前客户端窗口关联没有修复");
                    afterId = (string)Call("ReadWindowApplicationId", process.MainWindowHandle);
                    Assert(afterId == ApplicationId(installed), "当前窗口标识与注册入口不一致");
                    checks.Add("当前客户端窗口已关联到安装包的原生入口");
                    Assert(Task.Run(() => (bool)Call("RepairWindow", args[3], process.Id)).GetAwaiter().GetResult(), "后台线程未能核对窗口关联");
                    checks.Add("后台线程可正常核对窗口关联");
                    if (args.Length > 4 && args[4] == "--activate-existing") {
                        activatedPid = (uint)Call("Launch", args[3]);
                        checks.Add("系统注册入口可激活当前已打开的客户端");
                    }
                    process.Refresh(); sameProcess = !process.HasExited && process.StartTime == beforeStart;
                    Assert(sameProcess, "检查中客户端发生重启");
                    checks.Add("修复过程中客户端 PID 与启动时间不变");
                }
            }
            string json = new JavaScriptSerializer().Serialize(new { passed = checks.Count, checks, beforeWindowAppId = beforeId, afterWindowAppId = afterId, sameClientProcess = sameProcess, activatedPid, coldStartTested = false });
            File.WriteAllText(args[1], json, new UTF8Encoding(false)); Console.WriteLine(json); return 0;
        } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
