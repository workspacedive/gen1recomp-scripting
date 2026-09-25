# CI workflow templates

The two workflows live here instead of `.github/workflows/` because the
automation that created this repository may not hold GitHub's `workflows`
permission (pushes that touch `.github/workflows/` are then rejected).

Activate them once with an account that may edit workflows:

```bash
mkdir -p .github/workflows
cp tools/ci/workflows/*.yml .github/workflows/
git add .github/workflows && git commit -m "Enable CI" && git push
```

| Workflow | Trigger | What it proves |
|---|---|---|
| `ci.yml` | push / PR | `npm run check` (typecheck against the pinned Scripting typings, unit tests, Lua 5.1 lint), `tools/verify-lua.sh` against gen1recomp v0.3.14 (bit + literal differentials, upstream tiers with the machine-checked expectation list), reproducible `dist/RecompDeck.scripting` artifact |
| `apk-analysis.yml` | manual (`version` input) or changes to the analyzer | downloads the official Android APK + `.love` + `sha256sums.txt`, verifies checksums, runs `tools/apk-analysis/analyze.py` with `aapt2`/`apksigner` and commits `docs/apk-analysis/generated/<version>/report.{md,json}` |

Everything both workflows run can also be run locally — see
`docs/verification.md`.
