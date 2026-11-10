using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Xml;

namespace CodexTokenStatusbar {
    internal sealed class InstalledApplication {
        internal string Executable, ApplicationId;
    }
    internal static class DesktopIdentity {
        internal const string LoaderId = "CodexTokenStatusbar.Desktop";
        private static readonly Dictionary<string, InstalledApplication> cache = new Dictionary<string, InstalledApplication>(StringComparer.OrdinalIgnoreCase);
        private static readonly object sync = new object();
        private static readonly Guid AppIdFormat = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string applicationId);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int PackageFamilyNameFromFullName(string fullName, ref uint length, StringBuilder family);
        [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
        [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropertyValue value);
        [StructLayout(LayoutKind.Sequential)] private struct PropertyKey { internal Guid Format; internal uint Id; }
        [StructLayout(LayoutKind.Explicit, Size = 24)] private struct PropertyValue { [FieldOffset(0)] internal ushort Type; [FieldOffset(8)] internal IntPtr Pointer; }
        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IPropertyStore {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int GetAt(uint index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, out PropertyValue value);
            [PreserveSig] int SetValue(ref PropertyKey key, ref PropertyValue value);
            [PreserveSig] int Commit();
        }
        [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] private class ApplicationActivationManager { }
        [ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface IApplicationActivationManager {
            [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string applicationId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
            [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string applicationId, IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
            [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string applicationId, IntPtr items, out uint processId);
        }
        internal static void InitializeLoader() { Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(LoaderId)); }
        internal static InstalledApplication Resolve(string executable) {
            string full = Path.GetFullPath(executable);
            lock (sync) {
                InstalledApplication existing; if (cache.TryGetValue(full, out existing)) return existing;
                string root = Path.GetDirectoryName(Path.GetDirectoryName(full));
                if (!Path.GetFileName(root).StartsWith("OpenAI.Codex_", StringComparison.OrdinalIgnoreCase)) throw new IOException("Open Codex from the Start menu, then reconnect.");
                uint length = 512; var family = new StringBuilder((int)length);
                if (PackageFamilyNameFromFullName(Path.GetFileName(root), ref length, family) != 0) throw new IOException("Open Codex from the Start menu, then reconnect.");
                var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
                using (var reader = XmlReader.Create(Path.Combine(root, "AppxManifest.xml"), settings)) {
                    var document = new XmlDocument { XmlResolver = null }; document.Load(reader);
                    existing = ReadManifest(full, root, family.ToString(), document);
                }
                if (existing == null) throw new IOException("Open Codex from the Start menu, then reconnect.");
                cache.Add(full, existing); return existing;
            }
        }
        internal static InstalledApplication ReadManifest(string executable, string root, string family, XmlDocument document) {
            // 按真正的可执行文件匹配主应用，不猜测固定入口名，也不选包中的辅助程序。
            var applications = document.SelectNodes("/*[local-name()='Package']/*[local-name()='Applications']/*[local-name()='Application']");
            foreach (XmlElement application in applications) {
                string relative = application.GetAttribute("Executable").Replace('/', Path.DirectorySeparatorChar), id = application.GetAttribute("Id");
                if (relative.Length == 0 || id.Length == 0 || Path.IsPathRooted(relative)) continue;
                string full;
                try { full = Path.GetFullPath(Path.Combine(root, relative)); } catch (ArgumentException) { continue; }
                if (!string.Equals(full, Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase)) continue;
                if (!full.StartsWith(Path.GetFullPath(root).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) continue;
                return new InstalledApplication { Executable = full, ApplicationId = family + "!" + id };
            }
            return null;
        }
        internal static uint Launch(string executable) {
            var application = Resolve(executable);
            var activation = (IApplicationActivationManager)new ApplicationActivationManager();
            try {
                uint pid; int result = activation.ActivateApplication(application.ApplicationId, null, 0, out pid);
                if (result < 0) throw new IOException("Open Codex from the Start menu, then reconnect.");
                return pid;
            } finally { Marshal.ReleaseComObject(activation); }
        }
        internal static bool RepairWindow(string executable, int processId) {
            var application = Resolve(executable);
            using (var process = Process.GetProcessById(processId)) {
                // 只修改已核对的客户端窗口，不改快捷方式、注册表或系统图标缓存。
                if (!string.Equals(process.MainModule.FileName, application.Executable, StringComparison.OrdinalIgnoreCase)) return false;
                process.Refresh(); IntPtr window = process.MainWindowHandle; if (window == IntPtr.Zero) return false;
                SetWindowApplicationId(window, application.ApplicationId);
                return string.Equals(ReadWindowApplicationId(window), application.ApplicationId, StringComparison.Ordinal);
            }
        }
        internal static string ReadWindowApplicationId(IntPtr window) {
            Guid iid = typeof(IPropertyStore).GUID; IPropertyStore store;
            Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window, ref iid, out store));
            try {
                var key = new PropertyKey { Format = AppIdFormat, Id = 5 }; PropertyValue value;
                Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
                try { return value.Type == 31 ? Marshal.PtrToStringUni(value.Pointer) : null; }
                finally { PropVariantClear(ref value); }
            } finally { Marshal.ReleaseComObject(store); }
        }
        internal static void SetWindowApplicationId(IntPtr window, string applicationId) {
            Guid iid = typeof(IPropertyStore).GUID; IPropertyStore store;
            Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window, ref iid, out store));
            try {
                var key = new PropertyKey { Format = AppIdFormat, Id = 5 };
                var value = new PropertyValue { Type = 31, Pointer = Marshal.StringToCoTaskMemUni(applicationId) };
                try { Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref value)); Marshal.ThrowExceptionForHR(store.Commit()); }
                finally { PropVariantClear(ref value); }
            } finally { Marshal.ReleaseComObject(store); }
        }
    }
}
