#ifndef CODEX_STATUSBAR_NATIVE_PROBE_H
#define CODEX_STATUSBAR_NATIVE_PROBE_H

#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <wchar.h>

#define PROBE_MAGIC 0x43534250u
#define PROBE_SCHEMA 1u
#define PROBE_MESSAGE L"CodexTokenStatusbar.NativeProbe.v1"

typedef struct ProbeResult {
    uint32_t magic;
    uint32_t schema;
    uint32_t process_id;
    uint32_t thread_id;
    uintptr_t cookie;
    uint32_t operation;
    volatile LONG completed;
    uint32_t callback_thread_id;
    uint32_t has_runtime_module;
    uint32_t has_try_get_current;
    uint32_t has_node_loop_export;
    uint32_t has_script_exports;
    uintptr_t current_isolate;
    uint32_t has_node_environment;
    uint32_t script_executed;
    uint32_t script_stage;
    char v8_version[128];
    char uv_version[128];
    char script_result[4096];
    char script_source[65536];
} ProbeResult;

static inline void probe_mapping_name(wchar_t *output, size_t count, DWORD process_id, DWORD thread_id) {
    _snwprintf_s(output, count, _TRUNCATE, L"Local\\CodexTokenStatusbar.NativeProbe.%lu.%lu", process_id, thread_id);
}

#endif
