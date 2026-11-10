#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
#include <stdint.h>
#include "probe.h"

typedef struct WindowSearch {
    DWORD process_id;
    HWND window;
    LONG64 area;
} WindowSearch;

static BOOL CALLBACK find_window(HWND window, LPARAM parameter) {
    WindowSearch *search = (WindowSearch *)parameter;
    DWORD process_id = 0;
    GetWindowThreadProcessId(window, &process_id);
    if (process_id == search->process_id && IsWindowVisible(window) && GetWindow(window, GW_OWNER) == NULL) {
        RECT bounds;
        if (GetClientRect(window, &bounds)) {
            LONG64 area = (LONG64)(bounds.right - bounds.left) * (bounds.bottom - bounds.top);
            if (area > search->area) { search->window = window; search->area = area; }
        }
    }
    return TRUE;
}

static int fail(const char *stage) {
    fprintf(stderr, "{\"ok\":false,\"stage\":\"%s\",\"win32Error\":%lu}\n", stage, GetLastError());
    return 1;
}

int wmain(int count, wchar_t **arguments) {
    BOOL self_test = count == 2 && wcscmp(arguments[1], L"--self-test") == 0;
    HWND fixture_window = NULL;
    if (self_test) {
        // 自测只创建自己的消息循环，不接触 Codex。
        WNDCLASSW window_class = {0};
        window_class.lpfnWndProc = DefWindowProcW;
        window_class.hInstance = GetModuleHandleW(NULL);
        window_class.lpszClassName = L"CodexStatusbarProbeFixture";
        if (!RegisterClassW(&window_class)) return fail("fixture-register");
        fixture_window = CreateWindowExW(0, window_class.lpszClassName, L"探针自测", WS_OVERLAPPEDWINDOW,
            -20000, -20000, 200, 100, NULL, NULL, window_class.hInstance, NULL);
        if (fixture_window == NULL) return fail("fixture-create");
        ShowWindow(fixture_window, SW_SHOWNOACTIVATE);
    }
    BOOL execute_script = count == 4 && wcscmp(arguments[3], L"--execute-probe") == 0;
    BOOL source_script = count == 5 && wcscmp(arguments[3], L"--script") == 0;
    if (!self_test && ((count != 3 && !execute_script && !source_script) || wcscmp(arguments[1], L"--pid") != 0)) {
        fprintf(stderr, "Usage: native-probe.exe --pid <Codex main process ID> [--execute-probe | --script <UTF-8 file>] | --self-test\n");
        return 2;
    }
    wchar_t *number_end = NULL;
    unsigned long parsed = self_test ? GetCurrentProcessId() : wcstoul(arguments[2], &number_end, 10);
    if (!self_test && (parsed == 0 || number_end == NULL || *number_end != 0)) return 2;
    DWORD process_id = (DWORD)parsed;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, process_id);
    if (process == NULL) return fail("open-target");
    wchar_t executable[32768];
    DWORD path_length = 32768;
    BOOL path_ok = QueryFullProcessImageNameW(process, 0, executable, &path_length);
    const wchar_t *basename = path_ok ? wcsrchr(executable, L'\\') : NULL;
    // 探针限定当前安装的 Codex，避免误附加同名第三方程序。
    if (!self_test && (!path_ok || basename == NULL || _wcsicmp(basename + 1, L"ChatGPT.exe") != 0
        || wcsstr(executable, L"\\WindowsApps\\OpenAI.Codex_") == NULL)) {
        CloseHandle(process); return fail("target-identity");
    }
    WindowSearch search = { process_id, NULL, 0 };
    EnumWindows(find_window, (LPARAM)&search);
    if (search.window == NULL) { CloseHandle(process); return fail("find-main-window"); }
    DWORD window_process = 0;
    DWORD thread_id = GetWindowThreadProcessId(search.window, &window_process);
    if (window_process != process_id || thread_id == 0) { CloseHandle(process); return fail("window-identity"); }

    wchar_t dll_path[32768];
    DWORD own_length = GetModuleFileNameW(NULL, dll_path, 32768);
    wchar_t *last_slash = own_length > 0 && own_length < 32768 ? wcsrchr(dll_path, L'\\') : NULL;
    if (last_slash == NULL) { CloseHandle(process); return fail("find-probe-library"); }
    wcscpy_s(last_slash + 1, 32768 - (size_t)(last_slash + 1 - dll_path), L"statusbar-probe.dll");
    HMODULE library = LoadLibraryExW(dll_path, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (library == NULL) { CloseHandle(process); return fail("load-probe-library"); }
    HOOKPROC callback = (HOOKPROC)(uintptr_t)GetProcAddress(library, "StatusbarProbeHook");
    if (callback == NULL) { FreeLibrary(library); CloseHandle(process); return fail("find-probe-export"); }

    wchar_t mapping_name[160];
    probe_mapping_name(mapping_name, 160, process_id, thread_id);
    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, NULL, PAGE_READWRITE, 0, sizeof(ProbeResult), mapping_name);
    if (mapping == NULL || GetLastError() == ERROR_ALREADY_EXISTS) {
        if (mapping != NULL) CloseHandle(mapping);
        FreeLibrary(library); CloseHandle(process); return fail("create-probe-channel");
    }
    ProbeResult *result = MapViewOfFile(mapping, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(ProbeResult));
    if (result == NULL) { CloseHandle(mapping); FreeLibrary(library); CloseHandle(process); return fail("map-probe-channel"); }
    ZeroMemory(result, sizeof(*result));
    LARGE_INTEGER counter; QueryPerformanceCounter(&counter);
    result->magic = PROBE_MAGIC; result->schema = PROBE_SCHEMA;
    result->process_id = process_id; result->thread_id = thread_id;
    result->cookie = (uintptr_t)counter.QuadPart;
    result->operation = source_script ? 3 : execute_script ? 2 : 1;
    if (source_script) {
        FILE *source_file = _wfopen(arguments[4], L"rb");
        if (source_file == NULL) {
            UnmapViewOfFile(result); CloseHandle(mapping); FreeLibrary(library); CloseHandle(process);
            return fail("read-script");
        }
        size_t length = fread(result->script_source, 1, sizeof(result->script_source), source_file);
        BOOL source_ok = length > 0 && length < sizeof(result->script_source) && !ferror(source_file);
        fclose(source_file);
        if (!source_ok) {
            UnmapViewOfFile(result); CloseHandle(mapping); FreeLibrary(library); CloseHandle(process);
            return fail("script-size");
        }
    }
    UINT message = RegisterWindowMessageW(PROBE_MESSAGE);
    HHOOK hook = SetWindowsHookExW(WH_GETMESSAGE, callback, library, thread_id);
    DWORD error = hook == NULL ? GetLastError() : ERROR_SUCCESS;
    BOOL posted = hook != NULL && PostThreadMessageW(thread_id, message, (WPARAM)result->cookie, 0);
    if (hook != NULL && !posted) error = GetLastError();
    ULONGLONG started = GetTickCount64();
    while (posted && InterlockedCompareExchange(&result->completed, 0, 0) == 0 && GetTickCount64() - started < 5000
        && WaitForSingleObject(process, 0) == WAIT_TIMEOUT) {
        if (self_test) {
            MSG queued;
            while (PeekMessageW(&queued, NULL, 0, 0, PM_REMOVE)) { TranslateMessage(&queued); DispatchMessageW(&queued); }
        }
        Sleep(10);
    }
    BOOL received = InterlockedCompareExchange(&result->completed, 0, 0) == 1;
    BOOL unhooked = hook != NULL && UnhookWindowsHookEx(hook);
    printf("{\"ok\":%s,\"processId\":%lu,\"threadId\":%lu,\"callbackThreadId\":%u,"
        "\"hookInstalled\":%s,\"hookRemoved\":%s,\"win32Error\":%lu,\"runtimeModule\":%s,"
        "\"tryGetCurrentExport\":%s,\"nodeLoopExport\":%s,\"scriptExport\":%s,"
        "\"currentIsolate\":\"0x%llx\",\"v8Version\":\"%s\",\"uvVersion\":\"%s\","
        "\"hasNodeEnvironment\":%s,\"scriptStage\":%u,\"scriptResult\":%s,"
        "\"executedJavaScript\":%s,\"openedDebugPort\":false}\n",
        received ? "true" : "false", process_id, thread_id, result->callback_thread_id,
        hook != NULL ? "true" : "false", unhooked ? "true" : "false", error,
        result->has_runtime_module ? "true" : "false", result->has_try_get_current ? "true" : "false",
        result->has_node_loop_export ? "true" : "false", result->has_script_exports ? "true" : "false",
        (unsigned long long)result->current_isolate, result->v8_version, result->uv_version,
        result->has_node_environment ? "true" : "false", result->script_stage,
        result->script_result[0] != 0 ? result->script_result : "null", result->script_executed ? "true" : "false");
    UnmapViewOfFile(result); CloseHandle(mapping); FreeLibrary(library); CloseHandle(process);
    if (fixture_window != NULL) DestroyWindow(fixture_window);
    return received && unhooked ? 0 : 1;
}
