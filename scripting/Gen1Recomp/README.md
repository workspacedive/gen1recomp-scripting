# Gen1Recomp Scripting Host

Importiere den Ordner `Gen1Recomp` als Scripting-Projekt. Die App nutzt ausschließlich in der offiziellen App-Store-Dokumentation nicht als Pro markierte APIs.

Aktueller Umfang:

- sichtbares Ordnersystem unter `Dateien → Auf meinem iPhone → Scripting → Gen1Recomp` (genauer Containername wird von Scripting/iOS dargestellt),
- einmaliger Content-Import mit SHA-256 und Staging,
- persistente Library,
- WebView-Capability-Probe,
- deutsche/englische Texttrennung,
- bewusst **kein** Runtime-Start, solange love.js auf dem konkreten Gerät nicht verifiziert ist.

Die Probe ist keine Zertifizierung. Insbesondere testet sie noch nicht love.js-Boot, Audio-Latenz, lokale Subresources, Persistenz nach App-Kill oder Save-Synchronisation.
