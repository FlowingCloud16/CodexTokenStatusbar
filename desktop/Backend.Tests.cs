using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace CodexTokenStatusbar {
    internal static class BackendTests {
        private static int Main(string[] args) {
            try {
                var prices = new ApiPrices(args[2]); var results = new List<object>();
                foreach (object test in Data.Array(Data.Parse(File.ReadAllText(args[0])))) {
                    string kind = Data.Text(test, "kind"); object actual;
                    if (kind == "metrics") {
                        var accumulator = new UsageAccumulator(prices, Data.Text(Data.Get(test, "options"), "threadId"));
                        foreach (object record in Data.Array(Data.Get(test, "records"))) { if (record is string) accumulator.Consume((string)record); else accumulator.Consume(record); }
                        actual = accumulator.Snapshot();
                    } else if (kind == "price") actual = prices.Price(Data.Get(test, "entry"));
                    else if (kind == "summary") actual = prices.Summarize(Data.Array(Data.Get(test, "entries")).ToList(), Data.Get(test, "expectedUsage"), Data.Array(Data.Get(test, "reasons")).Cast<string>().ToArray());
                    else if (kind == "rate") { var value = ApiPrices.Rate(Data.Get(test, "value")); actual = value.HasValue ? value.Value.ToString() : null; }
                    else if (kind == "session") {
                        using (var source = new SnapshotSource(Data.Text(test, "directory"), prices)) actual = source.Read(Data.Get(test, "identity"));
                        if (actual == null && Data.Get(test, "expected") != null) {
                            string directory = Data.Text(test, "directory");
                            using (var database = new SystemSqlite(Path.Combine(directory, "state_5.sqlite"))) {
                                string file = FileIdentity.Canonical(database.Lookup(Data.Text(Data.Get(test, "identity"), "threadId")));
                                var reader = new SessionReader(prices, file, Data.Text(Data.Get(test, "identity"), "threadId"));
                                try { reader.Read(); } finally { reader.Close(); }
                            }
                            throw new Exception("索引读取没有返回已确认的会话。");
                        }
                    } else if (kind == "reader") {
                        string file = Data.Text(test, "filename"); File.WriteAllText(file, "", new UTF8Encoding(false)); var states = new List<object>();
                        var reader = new SessionReader(prices, file, Data.Text(test, "threadId"));
                        try {
                            foreach (object action in Data.Array(Data.Get(test, "actions"))) {
                                byte[] bytes = Convert.FromBase64String(Data.Text(action, "bytes"));
                                if (Data.Bool(Data.Get(action, "replace"))) { string temp = file + ".replacement"; File.WriteAllBytes(temp, bytes); File.Replace(temp, file, null); }
                                else using (var stream = new FileStream(file, Data.Bool(Data.Get(action, "truncate")) ? FileMode.Create : FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) stream.Write(bytes, 0, bytes.Length);
                                states.Add(Data.Copy(reader.Read()));
                            }
                        } finally { reader.Close(); }
                        actual = states;
                    } else throw new InvalidOperationException("未知的对照检查。");
                    results.Add(actual);
                }
                File.WriteAllText(args[1], Data.Json(results), new UTF8Encoding(false)); return 0;
            } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        }
    }
}
