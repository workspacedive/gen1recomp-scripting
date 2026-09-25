# RecompDeck

> **Based on the Pokemon Gen 1 Recompilation Project by BOIS CLUB GAMES, LLC (https://github.com/bryanthaboi/gen1recomp)**

**Deutsch** · [English](#english)

RecompDeck ist ein inoffizielles iOS-Frontend für
[gen1recomp](https://github.com/bryanthaboi/gen1recomp) — die native
Lua/LÖVE-Neuumsetzung von Pokémon Rot/Blau/Gelb (und Gold/Silber/Kristall
Phase 1) — als Projekt für die App [Scripting](https://scripting.fun).
Es startet das **unveränderte, offizielle Spielarchiv** in einer abgesicherten
WebView (love.js, LÖVE 11.5 als WebAssembly) und ersetzt Launcher, Datei-
verwaltung, Spielstände und Mod-Installation durch native Oberflächen.

- Läuft mit der **kostenlosen** Scripting-Version — keine PRO-Funktion wird
  verwendet ([Nachweis](docs/scripting-pro-vs-free.md)).
- Enthält **keine** Spielinhalte und keine ROMs. Du brauchst eigene,
  legal erstellte Cartridge-Dumps; sie werden per SHA-1 geprüft und
  verlassen dein Gerät nie.
- Kein Sideloading nötig. Wer sideloaden kann, bekommt mit der offiziellen
  iOS-IPA des Projekts (`gen1recomp++`, AltStore/SideStore-Repo
  `mobile/ios/app-repo.json`) native Leistung und alle Funktionen
  (z. B. Linkspiel, Shader-Presets).

## Installation

1. **Scripting** aus dem App Store installieren (kostenlos).
2. Auf dem iPhone/iPad diesen Import-Link öffnen:
   **[RecompDeck in Scripting importieren](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fworkspacedive%2Fgen1recomp-scripting%2Fraw%2Frefs%2Fheads%2Farena%2F01a0d858-gen1recomp-scripting%2Frelease%2FRecompDeck.scripting%22%5D)**
   (Stand dieses Branches; nach dem Merge nach `main`:
   [Import-Link für main](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fworkspacedive%2Fgen1recomp-scripting%2Fraw%2Frefs%2Fheads%2Fmain%2Frelease%2FRecompDeck.scripting%22%5D)).
3. Alternativ die Datei
   [`release/RecompDeck.scripting`](https://github.com/workspacedive/gen1recomp-scripting/raw/refs/heads/arena/01a0d858-gen1recomp-scripting/release/RecompDeck.scripting)
   laden und in Scripting importieren.

Für Entwickler: nach dem ersten Import `cd scripting && npx scripting-cli start --bonjour`
ausführen, in Scripting verbinden und *RecompDeck* wählen — Änderungen in
`scripting/RecompDeck` werden live synchronisiert.

## Erste Schritte

1. RecompDeck starten → **Einrichtung**: *Laufzeit (LÖVE 11.5 WebAssembly)* →
   **Installieren** (love.js 11.5.1 von npm, SHA-1 + gepinnte SHA-256).
2. *Spiel-Release* → **Installieren** (offizielles `gen1recomp-0.3.14.love`
   von GitHub, geprüft gegen `sha256sums.txt`, den GitHub-Digest und einen
   gepinnten Hash). Offline: eigene `.love`-Datei importieren.
3. Bei einem Spiel **ROM importieren…** → einmaliger Import (Grafik/Daten
   werden aus deiner ROM erzeugt und als Cache gespeichert).
4. **Spielen** / **Fortsetzen**. Die Menü-Taste (⋯ oben rechts) pausiert das
   Spiel; von dort geht es weiter oder zurück zu RecompDeck. Gespeichert wird
   im Spiel; alle Dateien, die das Spiel schreibt, übernimmt RecompDeck
   automatisch.

## Funktionen

- Offizielles Spiel, byte-identisch; Launch nur über dokumentierte
  Schnittstellen (`--game`, `--slot`, `POKEPORT_*`) — [Integration](docs/integration.md)
- Lua-5.1-Kompatibilitätsschicht (bit, Escapes, `load`-5.2, …) und
  C++-Exception-Firewall — [Kompatibilität](docs/compatibility.md)
- Grafik: WebGL 1, Retina-Darstellung, pixelgenaue Skalierung, ProMotion
  (30/60/120 fps), vorvalidierte Shader, Canvas-Limits des Geräts
- Kooperatives Frame-Pacing ohne Busy-Waits, Energiesparen bei Inaktivität,
  Import-Cache — [Leistung](docs/performance.md)
- Mods: Import als ZIP mit Sicherheitsprüfung, Berechtigungsanzeige, das
  Mod-System des Spiels bleibt unverändert — [Mods](docs/modding.md)
- Spielstände: Spiegel, automatische Backups, Export/Import (ZIP),
  Slot-Übersicht
- Haptik, Deep Links (`scripting://run/RecompDeck?game=red&slot=2`),
  Deutsch/Englisch, Diagnose-Ansicht
- Sicherheit: HTTPS-Allowlist, strikte CSP, validierte Bridge,
  fail-closed Navigation — [Sicherheit](docs/security.md)

| Spiel | Status |
|---|---|
| Rot, Blau, Gelb | unterstützt |
| Gold, Silber, Kristall | unterstützt (upstream Phase 1) |
| Feuerrot, Blattgrün | nicht unterstützt (benötigt `goto`/LuaJIT) |

## Verifikationsstand

Geprüft in der Entwicklungsumgebung ([Details](docs/verification.md)):
Typecheck gegen die Scripting-Typings, 20/20 Unit-Tests, `bit` bit-exakt zu
LuaJIT (21 700 Zeilen), Escape-Transformation literal-exakt
(2921 Literale im Spielarchiv), Upstream-Testsuiten unter Lua 5.1
(engine 667/681 mit exakt erwarteten 13 Gen-3-Abweichungen, gen2 149/149,
modkit 37/37, Tooling 137/137), End-to-End im Browser (Selbsttest 16/16,
offizieller Launcher, Persistenz, ROM-Prüfung).

**Noch offen (nur auf dem Gerät möglich):** Test in WKWebView/Scripting auf
iPhone/iPad inkl. echtem Spiel mit eigener ROM — Checkliste in
[docs/verification.md §5](docs/verification.md#5-device-checklist-v4).

## Dokumentation

[Architektur](docs/architecture.md) · [APK-Analyse](docs/apk-analysis.md) ·
[Kompatibilität](docs/compatibility.md) · [Integration](docs/integration.md) ·
[Mods](docs/modding.md) · [Leistung](docs/performance.md) ·
[Sicherheit](docs/security.md) · [PRO vs. Free](docs/scripting-pro-vs-free.md) ·
[Verifikation](docs/verification.md) · [CHANGELOG](CHANGELOG.md) ·
Für KI-Agenten: [AGENT.md](AGENT.md), [SKILLS.md](SKILLS.md)

## Entwicklung

```bash
tools/setup-lua.sh && npm install && npm run fetch-types
npm run check            # Typecheck, Unit-Tests, Lua-Lint, Paket aktuell?
tools/verify-lua.sh      # Lua-Differentiale + Upstream-Suiten (gen1recomp-Checkout in .cache/gen1recomp)
npm run harness:setup && npm run harness -- --game .cache/game-0.3.14.love --lovejs .cache/lovejs/compat --transport chunks --selftest
npm run release          # release/RecompDeck.scripting neu bauen
```

## Lizenz

RecompDeck steht unter der GPL-3.0-or-later ([LICENSE](LICENSE)) und
enthält keinen Code, keine Assets, keine Launcher-Dateien und keine
ROM-Daten des gen1recomp-Projekts. Es erfüllt dessen zusätzliche
Bedingungen: Namensnennung in README, Launcher, Über-Ansicht und
Ladebildschirm (§1, per Test abgesichert); der proprietäre Launcher des
Spiels wird nie gestartet, kopiert oder verändert — RecompDeck bringt einen
eigenen mit (§2); eigener Produktname, keine Rechte an Namen/Marken (§3).
Pokémon ist eine Marke von Nintendo, Creatures Inc. und GAME FREAK inc.;
dieses Projekt ist mit keinem von ihnen verbunden.

---

## English

RecompDeck is an unofficial iOS frontend for
[gen1recomp](https://github.com/bryanthaboi/gen1recomp) built as a project
for the [Scripting](https://scripting.fun) app. It runs the **unmodified
official game archive** on love.js (LÖVE 11.5 → WebAssembly) in a sandboxed
WebView and replaces launcher, file handling, saves and mod installation with
native screens. It needs only the **free** tier of Scripting, ships **no**
game content or ROMs (bring your own legally made cartridge dumps, verified by
SHA-1), and needs no sideloading — if you can sideload, the project's official
iOS IPA (`gen1recomp++`) gives native performance and every feature.

**Install:** get Scripting from the App Store, then open
**[Import RecompDeck into Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fworkspacedive%2Fgen1recomp-scripting%2Fraw%2Frefs%2Fheads%2Farena%2F01a0d858-gen1recomp-scripting%2Frelease%2FRecompDeck.scripting%22%5D)** on your device
([link for `main`](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fworkspacedive%2Fgen1recomp-scripting%2Fraw%2Frefs%2Fheads%2Fmain%2Frelease%2FRecompDeck.scripting%22%5D) after the merge), or import
[`release/RecompDeck.scripting`](https://github.com/workspacedive/gen1recomp-scripting/raw/refs/heads/arena/01a0d858-gen1recomp-scripting/release/RecompDeck.scripting) manually.

**First run:** *Setup* → *Runtime (LÖVE 11.5 WebAssembly)* → **Install**;
*Game release* → **Install**; **Import ROM…** for a game; **Play**.

**Status:** Red/Blue/Yellow supported, Gold/Silver/Crystal as far as
upstream Phase 1, FireRed/LeafGreen unsupported (need `goto`). Verified in
development (typecheck, 20 unit tests, Lua differentials, upstream suites on
Lua 5.1, browser E2E); the on-device checklist is in
[docs/verification.md](docs/verification.md). Everything else:
see the documentation links above.

**License:** GPL-3.0-or-later ([LICENSE](LICENSE)). RecompDeck contains no
gen1recomp code, assets, launcher files or ROM data and honours the
project's additional terms: the credit is shown in the README, launcher,
About and loading screens (§1, unit-tested); the proprietary game launcher is
never started, copied or modified (§2); own product name, no rights to names
or marks claimed (§3). Pokémon is a trademark of Nintendo, Creatures Inc. and
GAME FREAK inc.; this project is not affiliated with them.
