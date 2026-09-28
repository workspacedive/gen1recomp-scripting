# LuaJIT im love.js-/iOS-WebView-Pfad – Versuch und Entscheidung

Stand: 2026-09-28

## Ergebnis

Ein echter LuaJIT-Einsatz im bestehenden love.js-WASM ist derzeit **NICHT VERIFIZIERT** und nicht als austauschbares Lua-Modul möglich. Der überprüfte offizielle LuaJIT-Stand `c6ffc141a8762b41703f9287d63d93622a13dd8f` enthält keinen WebAssembly-/WASM-Zielport. Seine VM-Kerne und sein JIT-Codegenerator sind architekturspezifisch; im aktuellen Quellbaum existiert kein WASM-Backend. Die lokale Buildumgebung enthält außerdem kein Emscripten-SDK (`emcc`).

## Warum kein Sidecar sinnvoll ist

Eine zweite Lua-VM als separates WASM oder JavaScript-Modul hätte einen anderen `lua_State`. Sie könnte nicht transparent Gen1Recomps bereits geladene Module, LÖVE-Userdata, Mod-Sandbox, Hooks, Upvalues und Callback-Registrierungen übernehmen. Eine solche VM neben dem Spiel zu starten würde daher PotatoVoxel nicht beschleunigen und seine Kompatibilitätsgrenzen nicht lösen.

LuaJIT müsste stattdessen beim Bau von LÖVE/love.js die vorhandene Lua-VM ersetzen. Das wäre ein neuer, separat lizenzierter und gehashter Runtimekandidat mit eigener Corresponding-Source-/SBOM-/Reproduzierbarkeitsprüfung. Der bestehende opaque upstream-WASM darf dafür nicht gepatcht werden.

## iOS/WebAssembly-Grenze

LuaJITs eigentlicher Nutzen kommt aus dynamisch erzeugtem nativen Maschinencode. Code innerhalb eines Browser-WASM-Moduls kann nicht einfach ARM64-Maschinencode erzeugen und ausführen. Selbst ein zukünftiger WASM-Port müsste daher voraussichtlich ohne den nativen Trace-JIT laufen oder einen eigenständigen WASM-Codegenerator samt Browserintegration besitzen. Ein Performancegewinn darf ohne echten Gerätebenchmark nicht behauptet werden.

## Was heute sinnvoll genutzt wird

Der Hostadapter unterstützt nur belegte LuaJIT-Quellkompatibilität an der Compilergrenze: UTF-8-BOM sowie tokenbegrenzte `LL`-/`ULL`-Integer-Suffixe. Das erhält die offizielle love.js-Runtime und denselben LÖVE-Lua-Zustand. Es ist keine LuaJIT-Ausführung und wird nicht als solche bezeichnet.

## Status

- LuaJIT-Syntaxkompatibilität für PotatoVoxel: **VERIFIZIERT** auf dem Gerät.
- Echter LuaJIT-WASM-Port im offiziellen Upstream: **NICHT VERIFIZIERT**; im geprüften Quellstand kein WASM-Ziel vorhanden.
- Ersatz der love.js-Lua-VM: **EXPERIMENTELL** und nur als separat gebauter Runtimekandidat vertretbar.
- Nativer Trace-JIT im iOS-WebView: **NUR MIT HOST-/RUNTIME-UNTERSTÜTZUNG**.
- Performancegewinn: **BENCHMARK ERFORDERLICH**.

## Quellen

- Offizieller LuaJIT-Quellbaum: https://github.com/LuaJIT/LuaJIT
- Offizielle DynASM-Beschreibung: https://luajit.org/dynasm.html
- Emscripten WebAssembly-Buildmodell: https://emscripten.org/docs/compiling/WebAssembly.html
