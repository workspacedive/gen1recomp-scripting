# APK-/Launcher-UI/UX-Audit und Scripting-Abbildung

Basis: v0.3.18 Source Commit `b83f805…`, insbesondere `src/import/LauncherView.lua`, `src/ui/kit/Theme.lua`, `Layout.lua`, `Kit.lua`, Touch Controls und Android Packaging, sowie die statisch extrahierte offizielle APK (SHA-256 `1314d5a7dccc6aed29b5a9e27d356fa81eb9014f5c5eb7522fdc70293e02fd88`). Alle 1.150 Dateien ihrer `game.love` wurden gegen den Tag verglichen: 1.149 sind byteidentisch; nur der erwartete Release-Stamp in `Version.lua` weicht ab. Damit sind Implementierung und Assets der eingebetteten APK-UI **VERIFIZIERT**. Gerendertes Verhalten bleibt ohne APK-Gerätetest **NICHT VERIFIZIERT**. Details: [`apk-static-analysis.md`](apk-static-analysis.md).

## Original-Design

- „Cartridge Studio“: flache Graphitflächen, ruhige Hairlines, helle Actions; Farbe konzentriert sich auf den Game Rail.
- Palette: Field `#14181d`, Surface `#1d2229`, Row `#181d23`, Raised `#2a313b`, Heading `#f5f7fa`; Red `#ff3c48`, Blue `#4696ff`, Yellow `#ffcb05`.
- Kartenradius 9 px, Controlradius 8 px, klare Innenkanten; Fokus ist weiß und nicht nur farbbasiert.
- Game-Auswahl als Dropdown statt sieben schmaler Tabs. Weitere Bereiche: Mods, Find, Online (Beta), Skins (Beta), Import.
- Direkte Pixel-Layouts statt Prozenten. Kurze Listen paginieren; Modliste virtualisiert. Aktionen werden gequeued und erst außerhalb des Draws ausgeführt.
- Touch: Release-Dispatch, Drag-Disqualifizierung, 16-px Slop, 0,35-s Dedup gegen synthetische Mouse Events, Long Press 0,60 s.
- Busy Work besitzt nicht schließbares Progress Overlay. Gefährliche Löschaktionen sind armiert/bestätigt.
- Der Wechsel von FlexLove zu unmittelbarem Rendering erfolgte nach gemessenen ~9 ms Build+Draw vor Inhaltszeilen. Das ist ein konkreter Grund, keine komplexe retained Nachbildung pro Frame aufzubauen.

## APK-Asset- und Shell-Abgleich

- **VERIFIZIERT:** `LauncherView.lua`, UI-Kit/Theme/Layout, Touchsteuerung sowie sämtliche PNG/WebP/SVG/TTF/OGV-Assets der `game.love` sind byteidentisch zum offiziellen Tag. Die unten dokumentierten Farben, Layouts und Gesten beschreiben daher den tatsächlich ausgelieferten Payload, nicht nur einen ähnlichen Source-Stand.
- **VERIFIZIERT:** Die native Android-Hülle ist Landscape, nicht resizebar und deklariert OpenGL ES 2.0; die eigentliche Launcher-/Game-UI liegt im LÖVE-Payload. Android-Ressourcen und Systemdialoge sind Host-Chrome, nicht die Produkt-UI, die pixelweise nachgebaut werden sollte.
- **TEILWEISE VERIFIZIERT:** Die DEX enthält Secondary-Display-, Touch-, Picker- und Lifecycle-Bridges passend zur getaggten Quelle. Ohne Ausführung sind Fokus, Safe Areas, Font-Rasterung, Touchlatenz und Frametiming nicht bewiesen.
- **NICHT VERIFIZIERT:** APK-Screenshots gegen echte Geräte. Ein statischer Payload-Abgleich ersetzt keinen Golden-Test.

## Scripting-Entscheidung

Die Scripting-Shell verwendet absichtlich native `List`, `Section`, `NavigationStack`, Dynamic Type und System-Touchverhalten statt den LÖVE-Launcher pixelweise in SwiftUI nachzuzeichnen. Sie übernimmt:

- dunkle/ruhige Struktur und Red/Blue/Yellow-Semantik,
- klare Statuszeilen und niemals Farbe als einzigen Status,
- Import als primäre leere Library-Aktion,
- queued async Aktionen ohne I/O im Renderpfad,
- Diagnose und Free-Tier-Status transparent,
- keine funktionslosen Mods/Online/Skins-Tabs vor Runtime-Verifikation.

Das ist „passende UX“, nicht falsches Pixel-Perfect-Marketing. Eine perfekte visuelle Übereinstimmung kann erst auf einem echten Gerät mit Screenshots, Safe Areas, Dynamic Type und beiden Farbschemata als Golden-Test abgenommen werden. Der In-Game-Look bleibt bei erfolgreichem love.js-Port original, weil der Originalrenderer zeichnet.

## Golden-Abnahme für die UI

- iPhone klein/groß und iPad, Portrait/Landscape soweit Runtime erlaubt.
- Light/Dark (Produkt empfiehlt Dark, muss aber lesbar bleiben), Dynamic Type Standard/XXL.
- VoiceOver-Reihenfolge und Labels; Status nie nur Farbe.
- Import-Abbruch, doppelter Tap, Drag, App inactive während Import, Low Disk.
- Screenshot-Diff mit tolerierter nativer Typografieabweichung; Layout-/Kontrastfehler sind blockers.
- Keine 60-fps-React-State-Updates im Library-Screen; große Libraries bleiben lazy/list-basiert.
