using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal static class NativePipeTests {
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 };
    private static Type pipeType;
    private static readonly List<string> checks = new List<string>();
    private static object Client(string name) {
        var descriptor = new Dictionary<string, object> { { "schemaVersion", 1 }, { "pid", Process.GetCurrentProcess().Id }, { "pipeName", @"\\.\pipe\" + name }, { "token", new string('a', 64) } };
        return Activator.CreateInstance(pipeType, BindingFlags.NonPublic | BindingFlags.Instance, null, new object[] { descriptor }, null);
    }
    private static object Request(object client) { return pipeType.GetMethod("Request", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(client, new object[] { new object[] { "action", "ping" } }); }
    private static void Assert(bool condition, string text) { if (!condition) throw new Exception(text); }
    private static void Exchange(Action<NamedPipeServerStream> respond, bool succeeds) {
        string name = "codex-token-statusbar-native-" + Guid.NewGuid();
        using (var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous)) {
            var task = Task.Run(() => {
                server.WaitForConnection();
                using (var reader = new StreamReader(server, new UTF8Encoding(false), false, 1024, true)) {
                    var body = Json.Deserialize<Dictionary<string, object>>(reader.ReadLine());
                    Assert((string)body["action"] == "ping" && (string)body["token"] == new string('a', 64), "管道请求没有携带正确的操作和令牌");
                    respond(server);
                }
            });
            bool completed = false; var clock = Stopwatch.StartNew();
            try { object result = Request(Client(name)); Assert(succeeds && Convert.ToString(result) == "中文通过", "管道回复错误"); completed = true; }
            catch (TargetInvocationException error) { Assert(!succeeds && (error.InnerException is IOException || error.InnerException is TimeoutException), "管道失败未受控返回"); completed = true; }
            Assert(completed && clock.ElapsedMilliseconds < 9000, "管道调用没有按时结束");
            Assert(task.Wait(10000), "测试管道未退出");
        }
    }
    private static void Reply(NamedPipeServerStream server, string text) { byte[] bytes = Encoding.UTF8.GetBytes(text); server.Write(bytes, 0, bytes.Length); server.Flush(); }
    private static int Main(string[] args) {
        try {
            pipeType = Assembly.LoadFrom(Path.GetFullPath(args[0])).GetType("CodexTokenStatusbar.NativePipe");
            Exchange(server => { byte[] bytes = Encoding.UTF8.GetBytes("{\"ok\":true,\"value\":\"中文通过\"}\n"); for (int i = 0; i < bytes.Length; i++) server.Write(bytes, i, 1); }, true);
            checks.Add("管道传递令牌，分块 UTF-8 回复可正确还原");
            Exchange(server => Reply(server, "{\"ok\":false,\"error\":\"unauthorized\"}\n"), false);
            checks.Add("拒绝鉴权失败的回复");
            Exchange(server => Reply(server, "不是 JSON\n"), false);
            checks.Add("损坏回复正常报错");
            Exchange(server => { server.Disconnect(); }, false);
            checks.Add("连接提前关闭不会挂起");
            Exchange(server => { Task.Delay(6500).Wait(); }, false);
            checks.Add("服务端没有回复时六秒超时，不无限等待");
            File.WriteAllText(args[1], Json.Serialize(new { passed = checks.Count, checks = checks }), new UTF8Encoding(false)); Console.WriteLine(Json.Serialize(new { passed = checks.Count })); return 0;
        } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
