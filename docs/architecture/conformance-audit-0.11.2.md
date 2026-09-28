# Architektur-Konformitätsprüfung 0.11.2

Stand: 2026-09-26

## Gerätebefund und korrigierte Schlussfolgerung

0.11.1 reproduziert exakt `Music.lua:308: attempt to call a nil value`. **VERIFIZIERT (Gerät)**. Damit war die Annahme falsch, der zurückgegebene Source-Proxy sei als gewöhnliche Lua-Tabelle mutierbar. Der Proxy ist auf diesem Pfad ein nicht erweiterbares Objekt (typischerweise userdata oder eine geschützte Proxy-Tabelle): Die r15-Zuweisungen konnten keine Methode ergänzen.

Das erklärt sowohl den unveränderten Fehler als auch, warum die vorhandenen nativen Kernmethoden ausgelesen und benutzt werden können, während `setLooping` weiterhin nil bleibt.

## Korrektur r16

r16 versucht nicht mehr, das Runtimeobjekt zu verändern. Nach vollständiger Prüfung der nativen Kernmethoden erzeugt der Adapter eine eigene Lua-Fassade:

- `setVolume`, `queue`, `getFreeBufferCount`, `play`, `stop`, `pause` und `isPlaying` werden mit dem originalen nativen Source als `self` weitergeleitet.
- Vorhandene native `setLooping`, `setFilter` und `setPitch` werden ebenfalls weitergeleitet.
- Nur fehlende optionale Modifikatoren erhalten einen No-op.
- Das native Objekt bleibt in `__hostNativeSource` referenziert; ChipAudio selbst besitzt und befüllt weiterhin unverändert seine originale QueueableSource.

Damit sieht Music einen vollständigen Source-Vertrag, ohne das opake Runtimeobjekt zu verändern oder Audiooperationen nachzubauen. Der ausführbare Test prüft die Self-Bindung jeder Kernweiterleitung, Rückgabewerte, native Identität und die drei optionalen Fallbacks.

## Status

- Ursache des wirkungslosen r15-Patches: **VERIFIZIERT durch Geräteverhalten und Adapterpfad**.
- Fassaden-Weiterleitung: **VERIFIZIERT (ausführbarer Test)**.
- Kartenstart und Kartenmusik: **NICHT VERIFIZIERT**, Gerätetest erforderlich.
