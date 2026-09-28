# Sichere Bibliotheksentfernung 0.13.1

Stand: 2026-09-27

## Funktion

Ein importiertes Spiel kann in der Spiele-Registerkarte über `Aus Bibliothek entfernen` entfernt werden. Eine native Bestätigung nennt den exakten Umfang: Nur die importierte ROM und ihr `content.json` werden entfernt; Spielstände und Mods bleiben bestehen.

## Reihenfolge und Fehlerverhalten

1. Der übergebene SHA-256 wird erneut als sicherer Pfadabschnitt validiert.
2. Der aktuelle Index muss einen Eintrag mit identischer ID, SHA-256 und Upstream-SHA-1 enthalten.
3. Der verbleibende Index wird über den bestehenden Temp-/Backup-/Rename-Pfad atomar veröffentlicht.
4. Das Index-Backup wird auf den bereits veröffentlichten neuen Stand synchronisiert.
5. Erst danach wird `Library/content/<sha256>` entfernt.

Schlägt Schritt 3 oder 4 fehl, bleibt die ROM erhalten. Schlägt Schritt 5 fehl, bleibt höchstens ein nicht mehr referenzierter Content-Ordner zurück; kein Index verweist auf fehlende Daten. `Saves`, `Mods`, `Profiles` und `Diagnostics` liegen außerhalb des Zielpfads und werden nicht verändert.

Status: **VERIFIZIERT (statische Prüfung und automatisierte Reihenfolge-Regression)**; Gerätetest der UI-Bestätigung noch **NICHT VERIFIZIERT**.
