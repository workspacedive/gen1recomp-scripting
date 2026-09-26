# Architektur-Konformitätsprüfung 0.10.9

Stand: 2026-09-26

## Gerätebefund

Der von 0.10.8 erzeugte `.scripting`-Transport wurde von Scripting auf iOS mit „Datei kann nicht dekomprimiert werden“ abgelehnt. **VERIFIZIERT (Gerät)**. Lokale unabhängige Prüfungen mit Info-ZIP und Python lesen alle 29 Einträge, prüfen CRCs und melden keine Beschädigung. **VERIFIZIERT (lokal)**. Damit ist die genaue Abweichung des Scripting-Importers **TECHNISCH UNBEKANNT**; ein beschädigtes lokales Build-Artefakt ist nicht reproduzierbar.

## Korrektur

0.10.9 ändert ausschließlich den äußeren `.scripting`-Transport: Alle ZIP-Einträge verwenden die standardisierte STORE-Methode statt DEFLATE. Dadurch muss der Scripting-Importer keine Nutzdaten dekomprimieren. CRC-32, Zentralverzeichnis, Inventarprüfung, deterministische Metadaten und reproduzierbarer SHA-256 bleiben erhalten.

Der Paket-Builder sperrt komprimierte Einträge nun explizit und prüft außerdem den in 0.10.8 ergänzten `runtime/adapter/normalize2.lua` als Pflichtdatei. Die installierten Projektbytes sind inhaltlich identisch zu 0.10.8; Runtime r13 bleibt deshalb dieselbe separat versionierte Runtime.

## Status

- Lokale ZIP-Integrität des abgelehnten 0.10.8-Pakets: **VERIFIZIERT**.
- STORE-Paket, keine komprimierten Einträge und reproduzierbarer Build: **VERIFIZIERT**.
- Import von 0.10.9 in Scripting: **NICHT VERIFIZIERT**, Gerätetest erforderlich.
- QueueableSource-Korrektur r13: **NICHT VERIFIZIERT**, erst nach erfolgreichem Import testbar.
