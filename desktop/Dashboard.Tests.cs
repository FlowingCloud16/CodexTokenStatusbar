using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class DashboardTests {
    private const BindingFlags Instance = BindingFlags.Instance | BindingFlags.NonPublic;
    private static Form window;
    private static Type type;
    private static readonly List<string> checks = new List<string>();
    private static object Field(string name) { return type.GetField(name, Instance).GetValue(window); }
    private static object Invoke(string name, params object[] args) { return type.GetMethod(name, Instance).Invoke(window, args); }
    private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Render(string data) { ((Task)Invoke("RenderStatus", data == null ? null : new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(data))).GetAwaiter().GetResult(); }
    private static string Fixture(string locale, string theme) {
        return new JavaScriptSerializer().Serialize(new {
            phase = "running", language = locale, endpoint = "http://127.0.0.1:12345", pages = new[] { new { mounted = true } },
            desktop = new {
                theme = theme, scope = locale == "zh" ? "当前对话" : "Current conversation",
                values = new { speed = "34.4 t/s", cache = "97.9%", total = "57.8M", cost = "$13.40" },
                speedNote = locale == "zh" ? "采样均速：输出 token 除以同一次采样的整轮耗时，含等待和工具执行。" : "Sample avg: output tokens divided by turn time up to the same usage sample, including waiting and tools.",
                cost = new {
                    amount = "≈ $13.4000", coverage = locale == "zh" ? "已计价响应：12 / 14" : "Priced responses: 12 / 14", version = "2026-11-09",
                    rows = new[] { new[] { locale == "zh" ? "普通输入" : "Input", "≈ $3.0000" }, new[] { locale == "zh" ? "缓存读取" : "Cache read", "≈ $2.0000" }, new[] { locale == "zh" ? "缓存写入" : "Cache write", "≈ $0.0000" }, new[] { locale == "zh" ? "输出" : "Output", "≈ $8.4000" } },
                    notes = new[] { locale == "zh" ? "仅显示已计价小计，历史记录不完整。" : "Priced subtotal only; some historical usage is missing." },
                    rates = new[] { new { heading = "gpt-6.1-sol · Standard", rows = new[] { new[] { "Input", "$2.00" }, new[] { "Cache read", "$0.10" }, new[] { "Output", "$10.00" } } } },
                    disclaimer = locale == "zh" ? "API 估算不代表订阅扣款或实际账单。" : "API estimates do not represent subscription charges or your actual bill."
                }
            }
        });
    }
    private static System.Collections.Generic.IEnumerable<Control> Descendants(Control parent) {
        foreach (Control child in parent.Controls) { yield return child; foreach (Control nested in Descendants(child)) yield return nested; }
    }
    private static void Capture(string path) {
        Application.DoEvents(); window.Refresh();
        using (var full = new Bitmap(window.Width, window.Height)) {
            window.DrawToBitmap(full, new Rectangle(Point.Empty, full.Size));
            var client = window.PointToScreen(Point.Empty);
            using (var bitmap = full.Clone(new Rectangle(client.X - window.Left, client.Y - window.Top, window.ClientSize.Width, window.ClientSize.Height), full.PixelFormat)) bitmap.Save(path);
        }
    }
    [STAThread]
    private static int Main(string[] args) {
        try {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            var app = Assembly.LoadFrom(Path.GetFullPath(args[0])); type = app.GetType("CodexTokenStatusbar.Dashboard");
            string versionTag = app.GetName().Version.ToString(3).Replace('.', '-');
            // 预览构造器不启动连接、托盘、后台轮询或 Codex，也不写入用户设置。
            window = (Form)Activator.CreateInstance(type, Instance, null, new object[] { true }, null);
            window.ShowInTaskbar = false; window.StartPosition = FormStartPosition.Manual; window.Location = new Point(-3000, -3000); window.Opacity = 0;
            window.Show(); Application.DoEvents(); Render(Fixture("zh", "dark"));
            var metrics = (Label[])Field("metricValues");
            Assert(metrics.Select(label => label.Text).SequenceEqual(new[] { "34.4 t/s", "97.9%", "57.8M", "$13.40" }), "主窗口统计没有取自连接摘要");
            Assert(((Button)Field("load")).Text == "打开 Codex", "已连接主按钮状态错误");
            Assert(((Label)Field("title")).Text == "Codex 状态栏", "主窗口标题未翻译");
            Assert(((Label)Field("title")).Font.Name == "Microsoft YaHei UI", "中文没有使用系统无衬线字体");
            Capture(Path.Combine(args[1], "desktop-overview-" + versionTag + ".png"));
            checks.Add("概览显示桥接摘要四项统计，连接后主按钮变为打开 Codex，中英文标题与统计口径一致");
            Assert(window.ClientSize == new Size(720, 324), "删除冗余区域后主窗口没有缩短");
            Assert(!Descendants(window).Any(control => control.AccessibleRole == AccessibleRole.PageTab), "主窗口仍显示页签导航");
            Assert(!Descendants(window).Any(control => control.Text.Contains("状态栏布局") || control.Text.Contains("关闭窗口后继续在托盘运行") || control.Text == "当前对话" || control.Text == "Current conversation" || control.Text == "诊断" || control.Text == "Diagnostics" || control.Text == "详情" || control.Text == "Details" || control.Text == "快捷方式" || control.Text == "Shortcut"), "主窗口仍显示已移除的标题或菜单入口");
            Assert(((Control)Field("overview")).Bottom < ((Control)Field("load")).Top, "统计区域与主按钮发生重叠");
            var footerButtons = new[] { (Button)Field("reconnect"), (Button)Field("stop"), (Button)Field("load") };
            Assert(footerButtons.Select(button => button.Text).SequenceEqual(new[] { "重新连接", "卸载状态栏", "打开 Codex" }), "底部按钮中文名称错误");
            Assert(footerButtons.All(button => button.Visible && button.Top == footerButtons[0].Top), "底部按钮未排列在同一行");
            Assert(footerButtons[0].Right < footerButtons[1].Left && footerButtons[1].Right < footerButtons[2].Left, "底部按钮发生重叠");
            Invoke("SetBusy", true); Assert(footerButtons.All(button => !button.Enabled), "执行操作时仍可重复点击其他按钮");
            Invoke("SetBusy", false); Assert(footerButtons.All(button => button.Enabled), "操作完成后按钮未恢复");
            checks.Add("移除诊断菜单、详情与快捷方式入口，底部三个按钮直接可见、间距正常，忙碌期间同时禁用");
            Render(null); Assert(metrics.All(label => label.Text == "--"), "断线后仍显示旧数据");
            Assert(((Button)Field("load")).Text == "加载状态栏", "断线主按钮没有恢复加载");
            Render("{\"phase\":\"waiting-for-endpoint\",\"pages\":[{\"mounted\":true}],\"desktop\":{\"values\":{\"speed\":\"999 t/s\"}}}");
            Assert(metrics.All(label => label.Text == "--"), "非运行阶段误采纳旧摘要");
            checks.Add("断线、等待端点和缺失摘要清空全部统计，不保留其他对话的旧数据");
            Render(Fixture("de-DE", "light"));
            Assert(window.BackColor.R > 240 && ((Label)Field("title")).Text == "Codex Statusbar", "主题或非中文英文回退错误");
            Assert(footerButtons.Select(button => button.Text).SequenceEqual(new[] { "Reconnect", "Unload status bar", "Open Codex" }), "底部按钮没有回退英文");
            Capture(Path.Combine(args[1], "desktop-light-english-" + versionTag + ".png"));
            checks.Add("主题跟随客户端摘要，非中文统一英文，浅色背景与图标同步切换");
            Render(Fixture("zh", "dark"));
            var data = (Dictionary<string, object>)Field("desktopData");
            var values = (Dictionary<string, object>)data["values"];
            values["cost"] = "$1,234.57–$9,876.54"; Invoke("UpdateMetrics");
            using (var graphics = window.CreateGraphics()) Assert(graphics.MeasureString(metrics[3].Text, metrics[3].Font).Width <= metrics[3].Width, "金额区间未缩小字体以保留完整数值");
            using (var graphics = window.CreateGraphics()) Assert(graphics.MeasureString(metrics[3].Text, metrics[3].Font).Height <= metrics[3].Height, "金额区间换行后高度不足");
            Capture(Path.Combine(args[1], "desktop-long-cost-" + versionTag + ".png"));
            checks.Add("长金额区间会缩小数值字体，避免覆盖相邻统计，完整值仍可悬停查看");
            values["cost"] = "$13.40"; Invoke("UpdateMetrics");
            foreach (float scale in new[] { 1f, 1.25f, 1.5f }) {
                window.Font = new Font("Segoe UI", 10.5f * scale); window.ClientSize = new Size((int)(720 * scale), (int)(324 * scale));
                Application.DoEvents();
                foreach (var button in footerButtons) Assert(window.ClientRectangle.Contains(button.Bounds), "缩放后按钮超出主窗口");
                foreach (var value in metrics) Assert(value.Parent.ClientRectangle.Contains(value.Bounds), "缩放后统计超出概览");
            }
            checks.Add("720×324 基准与 125%、150% 字体缩放下，主按钮与四项统计不越界");
            window.Close(); Assert(window.IsDisposed, "预览窗口无法关闭");
            checks.Add("独立预览窗口能正常关闭，不创建托盘或启动助手");
            string json = new JavaScriptSerializer().Serialize(new { passed = checks.Count, checks = checks, scope = "real-native-controls-with-isolated-demo-data-without-client-actions" });
            File.WriteAllText(args[2], json, new UTF8Encoding(false)); Console.WriteLine(json); return 0;
        } catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
        finally { if (window != null) window.Dispose(); }
    }
}
