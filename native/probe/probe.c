#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "probe.h"

typedef const char *(*VersionFunction)(void);
typedef void *(*TryGetCurrentFunction)(void);
void probe_execute_script(HMODULE runtime, ProbeResult *result);

static void copy_version(char *output, size_t length, HMODULE runtime, const char *symbol) {
    VersionFunction get_version = (VersionFunction)(uintptr_t)GetProcAddress(runtime, symbol);
    if (get_version != NULL) {
        const char *value = get_version();
        if (value != NULL) strncpy_s(output, length, value, _TRUNCATE);
    }
}

__declspec(dllexport) LRESULT CALLBACK StatusbarProbeHook(int code, WPARAM word, LPARAM parameter) {
    // 只处理本次探针消息，不拦截或改写 Codex 的输入和其他窗口消息。
    if (code == HC_ACTION && parameter != 0) {
        MSG *message = (MSG *)parameter;
        if (message->message == RegisterWindowMessageW(PROBE_MESSAGE)) {
            wchar_t mapping_name[160];
            probe_mapping_name(mapping_name, 160, GetCurrentProcessId(), GetCurrentThreadId());
            HANDLE mapping = OpenFileMappingW(FILE_MAP_READ | FILE_MAP_WRITE, FALSE, mapping_name);
            if (mapping != NULL) {
                ProbeResult *result = MapViewOfFile(mapping, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(ProbeResult));
                if (result != NULL) {
                    if (result->magic == PROBE_MAGIC && result->schema == PROBE_SCHEMA
                        && result->process_id == GetCurrentProcessId() && result->thread_id == GetCurrentThreadId()
                        && result->cookie == message->wParam && result->completed == 0) {
                        result->callback_thread_id = GetCurrentThreadId();
                        HMODULE runtime = GetModuleHandleW(L"chrome.dll");
                        result->has_runtime_module = runtime != NULL;
                        if (runtime != NULL) {
                            TryGetCurrentFunction get_current = (TryGetCurrentFunction)(uintptr_t)GetProcAddress(runtime,
                                "?TryGetCurrent@Isolate@v8@@SAPEAV12@XZ");
                            result->has_try_get_current = get_current != NULL;
                            result->has_node_loop_export = GetProcAddress(runtime,
                                "?GetCurrentEventLoop@node@@YAPEAUuv_loop_s@@PEAVIsolate@v8@@@Z") != NULL;
                            result->has_script_exports = GetProcAddress(runtime,
                                "?Compile@Script@v8@@SA?AV?$MaybeLocal@VScript@v8@@@2@V?$Local@VContext@v8@@@2@V?$Local@VString@v8@@@2@PEAVScriptOrigin@2@@Z") != NULL;
                            copy_version(result->v8_version, sizeof(result->v8_version), runtime, "?GetVersion@V8@v8@@SAPEBDXZ");
                            copy_version(result->uv_version, sizeof(result->uv_version), runtime, "uv_version_string");
                            // TryGetCurrent 在没有进入 isolate 时返回空，避免调用会断言失败的 GetCurrent。
                            if (get_current != NULL) result->current_isolate = (uintptr_t)get_current();
                            if (result->operation == 2 || result->operation == 3) probe_execute_script(runtime, result);
                        }
                        InterlockedExchange(&result->completed, 1);
                    }
                    UnmapViewOfFile(result);
                }
                CloseHandle(mapping);
            }
        }
    }
    return CallNextHookEx(NULL, code, word, parameter);
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) DisableThreadLibraryCalls(instance);
    return TRUE;
}
