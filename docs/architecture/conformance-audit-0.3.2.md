# Architecture conformance audit — Scripting project 0.3.2

Audit date: 2026-09-26  
Trigger: real-device Scripting PRO gate shown by the 0.3.1 Mod import.

## Result

Overall status: **TEILWEISE VERIFIZIERT — Free-Tier architecture restored in source and tests; device retest required**.

The previous use of Scripting `Archive.openForMode`, `entries` and `extractTo` violated the explicit Free-Tier requirement despite being present in public API documentation. The device result outranks that documentation assumption. Version 0.3.2 removes the complete Archive host contract and does not substitute `FileManager.zip/unzip`, which is also barred by the regression scan.

## Replacement boundary

The project now owns the narrow ZIP subset needed to transport Gen1Recomp mods:

1. locate and bound the classic EOCD record;
2. reject ZIP64, split archives, encryption and methods other than Stored/Deflate;
3. parse every central entry under count, compressed, expanded and ratio ceilings;
4. normalize and validate paths before any write;
5. match each local header's name, flags and method to its approved central record;
6. decode RFC 1951 Stored, fixed-Huffman and dynamic-Huffman blocks with exact output allocation;
7. verify announced output length and CRC-32;
8. write each verified entry only to its already-contained transaction destination;
9. validate Gen1Recomp's manifest/entry subset and publish by content-addressed rename.

Unsupported ZIP features fail closed. No fallback invokes a host archive API.

## Conformance matrix

| Invariant | Evidence | Status |
|---|---|---|
| No known PRO archive API | product source and narrow host declaration contain no Archive API or FileManager ZIP methods; regression scan blocks their return | **VERIFIZIERT** statically |
| No Pro-only background API | existing BackgroundKeeper scan remains active | **VERIFIZIERT** statically |
| Transport safety is not weakened | all 0.3.1 limits remain; local-header and CRC checks are now project-owned | **VERIFIZIERT** by source/tests |
| Deflate interoperability | Node zlib-generated dynamic, fixed and empty raw-DEFLATE streams decode byte-exactly | **VERIFIZIERT** by regression tests |
| ZIP interoperability | Stored, Deflate and data-descriptor entries extract and verify; local/central mismatch is rejected | **VERIFIZIERT** by regression tests |
| User-data isolation | extraction remains under `Transactions`; immutable package publication remains under `Mods` | **VERIFIZIERT** |
| Mod execution remains gated | package state remains `stored`; no Lua is executed | **VERIFIZIERT** |
| Concrete iOS Free-Tier run | new package not tested yet | **NICHT VERIFIZIERT** |
| Full ZIP ecosystem | only the documented supported subset is intentional; ZIP64/encryption/other methods are rejected | **VORAUSSETZUNG** for package compatibility, not silently emulated |
| Runtime/gameplay | unchanged and disabled | **NICHT VERIFIZIERT** |

## Security notes

The inflater preallocates exactly the central-directory expanded size and aborts on every overrun, underrun, invalid Huffman tree, invalid distance or missing end symbol. Aggregate expanded bytes, per-entry bytes and expansion ratio were already bounded during preflight. CRC-32 is an integrity/error-detection check, not an authenticity mechanism; code authenticity remains governed by the separate component/mod trust model.

The implementation deliberately does not support ZIP64, traditional/AES encryption, patched data, unknown compression methods, multi-disk archives or symbolic links. Adding any of those requires a separate threat review and tests; it must not be done as a permissive fallback.
