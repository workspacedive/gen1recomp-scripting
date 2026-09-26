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
done < <(find "$SOURCE" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.md' \) -print0 | sort -z)

# Stable metadata makes source-identical packages byte-identical.
find "$STAGE" -type f -exec touch -t 198001010000 {} +
mapfile -d '' FILES < <(cd "$STAGE" && find . -type f -print0 | sort -z)
(cd "$STAGE" && zip -X -q -9 "$EXPECTED" "${FILES[@]}")
unzip -tqq "$EXPECTED"
cmp "$SOURCE/script.json" <(unzip -p "$EXPECTED" script.json)

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
