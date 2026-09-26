#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/scripting/Gen1Recomp"
ARTIFACT_DIR="$ROOT/artifacts"
ARTIFACT="$ARTIFACT_DIR/Gen1Recomp.scripting"
CHECK_ONLY=false
if [ "${1:-}" = "--check" ]; then CHECK_ONLY=true; fi

for tool in node zip unzip sha256sum; do
  command -v "$tool" >/dev/null || { echo "missing packaging tool: $tool" >&2; exit 1; }
done

VERSION="$(node -e "const m=require(process.argv[1]); if(!m.version||m.entry!=='index.tsx') process.exit(2); process.stdout.write(m.version)" "$SOURCE/script.json")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/project"
EXPECTED="$WORK/Gen1Recomp.scripting"
mkdir -p "$STAGE" "$ARTIFACT_DIR"

while IFS= read -r -d '' file; do
  relative="${file#"$SOURCE/"}"
  mkdir -p "$STAGE/$(dirname "$relative")"
  cp "$file" "$STAGE/$relative"
done < <(find "$SOURCE" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.md' \
  -o -name '*.html' -o -name '*.js' -o -name '*.wasm' -o -name '*.love' -o -name '*.lua' -o -name '*.txt' \) -print0 | sort -z)

# Stable metadata makes source-identical packages byte-identical.
find "$STAGE" -type f -exec touch -t 198001010000 {} +
mapfile -d '' FILES < <(cd "$STAGE" && find . -type f -print0 | sort -z)
# Scripting's iOS importer reported a valid DEFLATE package as not
# decompressible on-device. Store entries without compression: .scripting is
# already a transport archive, and STORE removes that importer compatibility
# boundary while retaining ZIP CRC/inventory validation and reproducibility.
(cd "$STAGE" && zip -X -q -0 "$EXPECTED" "${FILES[@]}")
unzip -tqq "$EXPECTED"
if unzip -lv "$EXPECTED" | grep -q ' Defl'; then
  echo "Scripting package unexpectedly contains compressed entries" >&2
  exit 1
fi
cmp "$SOURCE/script.json" <(unzip -p "$EXPECTED" script.json)
for required in \
  runtime/lovejs/harness.html runtime/lovejs/player.js runtime/lovejs/nogame.love \
  runtime/lovejs/lua/normalize1.lua runtime/lovejs/lua/normalize2.lua \
  runtime/adapter/normalize1.lua runtime/adapter/normalize2.lua \
  runtime/lovejs/11.5/love.js runtime/lovejs/11.5/love.wasm runtime/lovejs/11.5/license.txt; do
  unzip -Z1 "$EXPECTED" | grep -Fqx "$required" || {
    echo "runtime asset missing from package: $required" >&2
    exit 1
  }
done

if $CHECK_ONLY; then
  if [ ! -f "$ARTIFACT" ] || ! cmp -s "$EXPECTED" "$ARTIFACT"; then
    echo "artifacts/Gen1Recomp.scripting is missing or stale; run npm run package:scripting" >&2
    exit 1
  fi
  expected_hash="$(sha256sum "$EXPECTED" | cut -d' ' -f1)"
  recorded_hash="$(cut -d' ' -f1 "$ARTIFACT.sha256" 2>/dev/null || true)"
  [ "$expected_hash" = "$recorded_hash" ] || {
    echo "artifact checksum sidecar is missing or stale" >&2
    exit 1
  }
  echo "Scripting package $VERSION: reproducible artifact OK ($expected_hash)"
  exit 0
fi

mv "$EXPECTED" "$ARTIFACT"
(
  cd "$ARTIFACT_DIR"
  sha256sum "$(basename "$ARTIFACT")" > "$(basename "$ARTIFACT").sha256"
)
echo "Created artifacts/Gen1Recomp.scripting (version $VERSION)"
cat "$ARTIFACT.sha256"
