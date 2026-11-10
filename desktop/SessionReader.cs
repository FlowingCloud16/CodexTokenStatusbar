using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace CodexTokenStatusbar {
    // 数据库始终以只读方式打开，不改动客户端的索引或会话文件。
    internal sealed class SystemSqlite : IDisposable {
        private IntPtr database;
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_open_v2(byte[] filename, out IntPtr handle, int flags, IntPtr vfs);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_close_v2(IntPtr handle);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_busy_timeout(IntPtr handle, int milliseconds);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_prepare_v2(IntPtr handle, byte[] query, int length, out IntPtr statement, IntPtr tail);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_bind_text(IntPtr statement, int index, byte[] value, int length, IntPtr destructor);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_step(IntPtr statement);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_column_text(IntPtr statement, int column);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_column_bytes(IntPtr statement, int column);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_finalize(IntPtr statement);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_libversion();
        private static byte[] Utf8(string text) { return Encoding.UTF8.GetBytes(text + "\0"); }
        internal SystemSqlite(string filename) {
            if (sqlite3_open_v2(Utf8(filename), out database, 1 | 0x10000, IntPtr.Zero) != 0) { Dispose(); throw new IOException("The chat index could not be opened."); }
            sqlite3_busy_timeout(database, 500);
        }
        internal string Lookup(string threadId) {
            IntPtr statement = IntPtr.Zero;
            try {
                if (sqlite3_prepare_v2(database, Utf8("SELECT rollout_path FROM threads WHERE id = ? LIMIT 1"), -1, out statement, IntPtr.Zero) != 0) throw new IOException("The chat index is unavailable.");
                byte[] value = Encoding.UTF8.GetBytes(threadId);
                if (sqlite3_bind_text(statement, 1, value, value.Length, new IntPtr(-1)) != 0) throw new IOException("The chat index lookup failed.");
                int result = sqlite3_step(statement);
                if (result == 101) return null;
                if (result != 100) throw new IOException("The chat index is busy.");
                int length = sqlite3_column_bytes(statement, 0);
                if (length <= 0 || length > 32768) return null;
                byte[] bytes = new byte[length]; Marshal.Copy(sqlite3_column_text(statement, 0), bytes, 0, length);
                return Encoding.UTF8.GetString(bytes);
            } finally { if (statement != IntPtr.Zero) sqlite3_finalize(statement); }
        }
        public void Dispose() { if (database != IntPtr.Zero) { sqlite3_close_v2(database); database = IntPtr.Zero; } }
    }

    internal static class FileIdentity {
        [StructLayout(LayoutKind.Sequential)] private struct Information {
            internal uint Attributes; internal System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            internal uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Information information);
        internal static string Canonical(string filename) {
            using (var handle = CreateFile(filename, 0, 1 | 2 | 4, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
                return Canonical(handle);
            }
        }
        internal static string Canonical(SafeFileHandle handle) {
            if (handle.IsInvalid) throw new IOException("The chat path is unavailable.");
            var path = new StringBuilder(32768); uint size = GetFinalPathNameByHandle(handle, path, (uint)path.Capacity, 0);
            if (size == 0 || size >= path.Capacity) throw new IOException("The chat path could not be checked.");
            return path.ToString().TrimEnd('\\');
        }
        internal static string Key(SafeFileHandle handle) {
            Information value; if (!GetFileInformationByHandle(handle, out value)) throw new IOException("The chat file could not be checked.");
            return value.Volume + ":" + value.IndexHigh + ":" + value.IndexLow + ":" + value.Creation.dwHighDateTime + ":" + value.Creation.dwLowDateTime;
        }
        internal static string Key(string filename) { using (var stream = Open(filename)) return Key(stream.SafeFileHandle); }
        internal static FileStream Open(string filename) {
            var handle = CreateFile(filename, 0x80000000, 1 | 2 | 4, IntPtr.Zero, 3, 0x08000000, IntPtr.Zero);
            if (handle.IsInvalid) { handle.Dispose(); throw new IOException("The chat file is unavailable."); }
            try { return new FileStream(handle, FileAccess.Read, 65536, false); } catch { handle.Dispose(); throw; }
        }
    }

    internal sealed class SessionReader {
        private readonly ApiPrices prices; private readonly string filename, threadId;
        private readonly bool validateIdentity;
        private UsageAccumulator accumulator; private long offset, bootstrapBytes; private bool initialized, fromTail, discardFirst;
        private string fileKey; private readonly MemoryStream pending = new MemoryStream();
        internal SessionReader(ApiPrices catalog, string file, string id, bool verify = false) { prices = catalog; filename = file; threadId = id; validateIdentity = verify; }
        private void Consume(byte[] bytes, int count) {
            int start = 0;
            for (int i = 0; i < count; i++) {
                if (bytes[i] != 10) continue;
                if (!discardFirst) {
                    if (i > start) pending.Write(bytes, start, i - start);
                    if (pending.Length > 0) accumulator.Consume(Encoding.UTF8.GetString(pending.GetBuffer(), 0, (int)pending.Length));
                }
                pending.SetLength(0); discardFirst = false; start = i + 1;
            }
            if (!discardFirst && count > start) pending.Write(bytes, start, count - start);
            if (pending.Length > 64 * 1024 * 1024) throw new IOException("The chat record is too large.");
        }
        internal object Read() {
            using (var stream = FileIdentity.Open(filename)) {
                if (validateIdentity) {
                    if (!string.Equals(FileIdentity.Canonical(stream.SafeFileHandle), filename, StringComparison.OrdinalIgnoreCase)) return null;
                    byte[] prefix = new byte[65536]; int count = stream.Read(prefix, 0, prefix.Length), end = System.Array.IndexOf(prefix, (byte)10, 0, count);
                    if (end < 0) return null;
                    object meta = Data.Parse(Encoding.UTF8.GetString(prefix, 0, end));
                    if (Data.Text(meta, "type") != "session_meta" || Data.Text(Data.Get(meta, "payload"), "id") != threadId) return null;
                }
                long size = stream.Length; string key = FileIdentity.Key(stream.SafeFileHandle);
                if (!initialized || size < offset || key != fileKey) {
                    long bytes = Math.Min(size, 64L * 1024 * 1024);
                    offset = size - bytes; bootstrapBytes = bytes; fromTail = offset > 0; discardFirst = fromTail;
                    pending.SetLength(0); accumulator = new UsageAccumulator(prices, threadId); fileKey = key; initialized = true;
                }
                stream.Position = offset; byte[] buffer = new byte[1024 * 1024];
                while (offset < size) {
                    int count = stream.Read(buffer, 0, (int)Math.Min(buffer.Length, size - offset)); if (count == 0) break;
                    Consume(buffer, count); offset += count;
                }
            }
            var result = (Dictionary<string, object>)accumulator.Snapshot();
            result["reader"] = Data.Obj("startedFromTail", fromTail, "bootstrapBytes", bootstrapBytes, "bytesRead", offset); return result;
        }
        internal void Close() { pending.Dispose(); }
    }

    internal sealed class SnapshotSource : IDisposable {
        private readonly string root; private readonly ApiPrices prices; private SystemSqlite database; private string databaseKey, sessionsRoot;
        private long retryAt; private readonly Dictionary<string, SessionReader> readers = new Dictionary<string, SessionReader>(StringComparer.OrdinalIgnoreCase);
        private readonly Queue<string> order = new Queue<string>();
        internal SnapshotSource(string directory, ApiPrices catalog) { root = directory; prices = catalog; }
        internal object Read(object identity) {
            string thread = Data.Text(identity, "threadId");
            if (Data.Text(identity, "status") != "resolved" || Data.Text(identity, "hostId") != "local" || !Data.ThreadId(thread) || Data.Now < retryAt) return null;
            try {
                string path = Path.Combine(root, "state_5.sqlite"), key = FileIdentity.Key(path);
                if (database != null && databaseKey != key) Dispose();
                if (database == null) { sessionsRoot = FileIdentity.Canonical(Path.Combine(root, "sessions")) + "\\"; database = new SystemSqlite(path); databaseKey = key; }
                string indexed = database.Lookup(thread); if (string.IsNullOrEmpty(indexed)) return null;
                string file = FileIdentity.Canonical(indexed);
                if (!file.StartsWith(sessionsRoot, StringComparison.OrdinalIgnoreCase) || !file.EndsWith(".jsonl", StringComparison.Ordinal)) return null;
                SessionReader reader;
                if (!readers.TryGetValue(file, out reader)) {
                    if (readers.Count >= 8) { string victim = order.Dequeue(); readers[victim].Close(); readers.Remove(victim); }
                    reader = new SessionReader(prices, file, thread, true); readers.Add(file, reader); order.Enqueue(file);
                }
                return reader.Read();
            } catch { Dispose(); retryAt = Data.Now + 10000; return null; }
        }
        public void Dispose() { foreach (var reader in readers.Values) reader.Close(); readers.Clear(); order.Clear(); if (database != null) database.Dispose(); database = null; databaseKey = null; }
    }
}
