#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include "probe.h"

// 本实验只使用已核对的 Windows x64 ABI，并动态查找导出，不使用固定地址或对象偏移。
typedef void (*ScopeConstructor)(void *, void *);
typedef void (*ScopeDestructor)(void *);
typedef void *(*GetContext)(void *, void **);
typedef void *(*GetEnvironment)(void *);
typedef void *(*GetMainContext)(void **, void *);
typedef void (*ContextAction)(void *);
typedef void *(*NewString)(void **, void *, const char *, int, int);
typedef void *(*CompileScript)(void **, void *, void *, void *);
typedef void *(*RunScript)(void *, void **, void *);
typedef size_t (*StringLength)(void *, void *);
typedef size_t (*WriteString)(void *, void *, char *, size_t, int, size_t *);

#define RESOLVE(type, variable, symbol) type variable = (type)(uintptr_t)GetProcAddress(runtime, symbol)

void probe_execute_script(HMODULE runtime, ProbeResult *result) {
    // V8 的 ABI 需要单独验证；其他版本仍可运行前面的只读环境探针。
    if (strcmp(result->v8_version, "15.7.112.23") != 0) { result->script_stage = 10; return; }
    void *isolate = (void *)result->current_isolate;
    if (isolate == NULL) { result->script_stage = 11; return; }
    RESOLVE(ScopeConstructor, scope_create, "??0HandleScope@v8@@QEAA@PEAVIsolate@1@@Z");
    RESOLVE(ScopeDestructor, scope_destroy, "??1HandleScope@v8@@QEAA@XZ");
    RESOLVE(GetContext, get_context, "?GetCurrentContext@Isolate@v8@@QEAA?AV?$Local@VContext@v8@@@2@XZ");
    RESOLVE(GetEnvironment, get_environment, "?GetCurrentEnvironment@node@@YAPEAVEnvironment@1@V?$Local@VContext@v8@@@v8@@@Z");
    RESOLVE(GetMainContext, get_main_context, "?GetMainContext@node@@YA?AV?$Local@VContext@v8@@@v8@@PEAVEnvironment@1@@Z");
    RESOLVE(ContextAction, enter_context, "?Enter@Context@v8@@QEAAXXZ");
    RESOLVE(ContextAction, exit_context, "?Exit@Context@v8@@QEAAXXZ");
    RESOLVE(ScopeConstructor, catch_create, "??0TryCatch@v8@@QEAA@PEAVIsolate@1@@Z");
    RESOLVE(ScopeDestructor, catch_destroy, "??1TryCatch@v8@@QEAA@XZ");
    RESOLVE(NewString, new_string, "?NewFromUtf8@String@v8@@SA?AV?$MaybeLocal@VString@v8@@@2@PEAVIsolate@2@PEBDW4NewStringType@2@H@Z");
    RESOLVE(CompileScript, compile, "?Compile@Script@v8@@SA?AV?$MaybeLocal@VScript@v8@@@2@V?$Local@VContext@v8@@@2@V?$Local@VString@v8@@@2@PEAVScriptOrigin@2@@Z");
    RESOLVE(RunScript, run, "?Run@Script@v8@@QEAA?AV?$MaybeLocal@VValue@v8@@@2@V?$Local@VContext@v8@@@2@@Z");
    RESOLVE(StringLength, string_length, "?Utf8LengthV2@String@v8@@QEBA_KPEAVIsolate@2@@Z");
    RESOLVE(WriteString, write_string, "?WriteUtf8V2@String@v8@@QEBA_KPEAVIsolate@2@PEAD_KHPEA_K@Z");
    if (!scope_create || !scope_destroy || !get_context || !get_environment || !get_main_context
        || !enter_context || !exit_context || !catch_create || !catch_destroy || !new_string
        || !compile || !run || !string_length || !write_string) { result->script_stage = 12; return; }

    uintptr_t scope[3] = {0};
    // TryCatch 的不透明存储预留充足空间，构造和析构都由目标运行时执行。
    __attribute__((aligned(16))) unsigned char catcher[256] = {0};
    scope_create(scope, isolate);
    void *current_context = NULL;
    get_context(isolate, &current_context);
    if (current_context == NULL) { result->script_stage = 13; scope_destroy(scope); return; }
    void *environment = get_environment(current_context);
    result->has_node_environment = environment != NULL;
    if (environment == NULL) { result->script_stage = 14; scope_destroy(scope); return; }
    void *main_context = NULL;
    get_main_context(&main_context, environment);
    if (main_context == NULL) { result->script_stage = 15; scope_destroy(scope); return; }
    enter_context(main_context);
    catch_create(catcher, isolate);

    const char *default_source = "JSON.stringify((()=>{try{"
        "const p=globalThis.process;const req=typeof require==='function'?require:"
        "p.mainModule&&typeof p.mainModule.require==='function'?p.mainModule.require.bind(p.mainModule):"
        "p.getBuiltinModule('module').createRequire(p.execPath);"
        "const e=req('electron');return {probe:'codex-statusbar-native-v1',value:6*7,"
        "processType:p.type,requireType:typeof require,hasBrowserWindow:typeof e.BrowserWindow==='function',"
        "hasWebContents:!!e.webContents,windowCount:e.BrowserWindow?.getAllWindows?.().length??null};"
        "}catch(e){return {probe:'codex-statusbar-native-v1',error:String(e)}}})())";
    const char *source = default_source;
    char *wrapped = NULL;
    if (result->operation == 3) {
        size_t input_length = strnlen(result->script_source, sizeof(result->script_source));
        if (input_length == sizeof(result->script_source)) result->script_stage = 20;
        else {
            const char *prefix = "(()=>{try{return JSON.stringify({ok:true,value:(()=>{\n";
            const char *suffix = "\n})()})}catch(e){return JSON.stringify({ok:false,error:String(e)})}})()";
            wrapped = malloc(strlen(prefix) + input_length + strlen(suffix) + 1);
            if (wrapped != NULL) {
                strcpy(wrapped, prefix); strcat(wrapped, result->script_source); strcat(wrapped, suffix);
                source = wrapped;
            } else result->script_stage = 21;
        }
    }
    void *text = NULL, *script = NULL, *value = NULL;
    if (result->script_stage == 0) new_string(&text, isolate, source, 0, (int)strlen(source));
    if (text == NULL) result->script_stage = 16;
    else {
        compile(&script, main_context, text, NULL);
        if (script == NULL) result->script_stage = 17;
        else {
            run(script, &value, main_context);
            if (value == NULL) result->script_stage = 18;
            else {
                size_t length = string_length(value, isolate);
                if (length >= sizeof(result->script_result)) result->script_stage = 19;
                else {
                    size_t written = write_string(value, isolate, result->script_result, length, 0, NULL);
                    result->script_result[written < sizeof(result->script_result) ? written : sizeof(result->script_result) - 1] = 0;
                    result->script_executed = 1; result->script_stage = 1;
                }
            }
        }
    }
    catch_destroy(catcher);
    exit_context(main_context);
    scope_destroy(scope);
    free(wrapped);
}
