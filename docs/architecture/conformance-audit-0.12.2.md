# Battle-Start-Profiling 0.12.2

Stand: 2026-09-27

## Ausgangslage

Speicherpersistenz und Gelbs Pokéball-Mengenglyphe sind **VERIFIZIERT (Gerät)**. Der Benutzer priorisiert verbleibende kleine Ruckler bei Trainerkämpfen und wilden Begegnungen vor dem separaten Files-Export.

## Statische Phasenprüfung

Der Gen-1-Pfad am gepinnten Gen1Recomp-Stand wurde bis zum ersten Battle-Frame verfolgt:

1. `BattleState.newWild` beziehungsweise `newTrainer` erzeugt Kampf und Gegnerteam.
2. `OverworldState:pushBattle` startet über `BattleState:playBattleTheme` die Kampfmusik.
3. `BattleTransition.new` führt den ausgewählten Wipe aus.
4. Nach dem Wipe wird `BattleState:enter` aufgerufen; dort werden unter anderem Back-/Trainerbilder geladen und aufbereitet.
5. `BattleState:draw` zeichnet den ersten Kampfframe.

Die Übergänge besitzen absichtlich unterschiedliche Framebudgets. Zusätzlich hält der Gen-1-Übergang 60 schwarze Frames; zwei Stile besitzen außerdem 72 Flash-Frames. Abhängig vom Stil sind deshalb bereits ohne Rechenengpass ungefähr 1,9 bis 4,1 Sekunden vorgesehen. Ob die Gerätebeobachtung dieses vorgesehene Budget oder zusätzliche Frame-Stalls betrifft, ist noch **BENCHMARK ERFORDERLICH**.

## Instrumentierung

Adapter r20 misst ohne Änderung der Payloaddateien:

- `battle.construct` für Wild-/Trainerkonstruktoren,
- `battle.music` für die synchrone Musikinitialisierung,
- `battle.transition` mit Stil, Soll-Framezahl und realer Wandzeit,
- `battle.enter`,
- `battle.first_draw`.

Der Harness akzeptiert ausschließlich Zeilen mit dem festen Präfix `[gen1-profile]`. Der versionierte Host-Bridge-Typ `runtime.profile` wird separat von Boot-Meilensteinen behandelt. Die letzten 100 Einträge werden unter `Documents/Gen1Recomp/Diagnostics/battle-profile.v1.json` gespeichert. Profilnachrichten können keine Pfade oder Hostoperationen bestimmen.

## Entscheidungsgate

- Übergangswandzeit ungefähr `frames / 60`: Dauer ist überwiegend das vorgesehene Animationsbudget; dann wird eine hostseitige, ausdrücklich konfigurierbare Beschleunigungsstrategie geprüft.
- Hohe `battle.music`-Zeit: Queue-/Synthese-Pfad isolieren und benchmarken.
- Hohe `battle.enter`- oder `battle.first_draw`-Zeit: Bilddekodierung, Paletten-Mapping und Cache-Treffer getrennt messen.
- Konstruktorzeit hoch: Pokémon-/Traineraufbau weiter unterteilen.

Keine dieser Optimierungen wird vor dem Gerätedatensatz behauptet.
