#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""List the import section of a wasm module (names only) to see which Emscripten
runtime features (C++ exception landing pads, setjmp/longjmp, GL) it was built with."""
import sys
def leb(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1; r |= (x & 0x7f) << s; s += 7
        if not x & 0x80: return r, i
def imports(path):
    b = open(path, 'rb').read(); assert b[:4] == b'\0asm'; i = 8; out = []
    while i < len(b):
        sid = b[i]; i += 1; size, i = leb(b, i); end = i + size
        if sid == 2:
            n, i = leb(b, i)
            for _ in range(n):
                ml, i = leb(b, i); mod = b[i:i+ml].decode(); i += ml
                fl, i = leb(b, i); name = b[i:i+fl].decode(); i += fl
                kind = b[i]; i += 1
                if kind == 0: _, i = leb(b, i)
                elif kind == 1: i += 1; fl2, i = leb(b, i); _, i = leb(b, i); (leb(b, i) if fl2 & 1 else None)
                elif kind == 2: fl2, i = leb(b, i); _, i = leb(b, i); i = leb(b, i)[1] if fl2 & 1 else i
                elif kind == 3: i += 2
                out.append(name)
            return out
        i = end
    return out
for p in sys.argv[1:]:
    names = imports(p)
    exc = sorted(n for n in names if 'cxa' in n or 'catch' in n or 'resumeException' in n)
    sj = sorted(n for n in names if 'setjmp' in n.lower() or 'longjmp' in n.lower() or n.startswith('invoke_'))
    print(p.split('/research/')[-1], 'imports:', len(names))
    print('  exceptions:', exc)
    print('  setjmp/invoke:', len(sj), sj[:12])
