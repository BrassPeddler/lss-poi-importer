# lss-poi-importer

Ein Tampermonkey-Userscript für [Leitstellenspiel.de](https://www.leitstellenspiel.de), das das Anlegen von POIs (Points of Interest) erheblich vereinfacht.

![Version](https://img.shields.io/badge/version-2.4.5-blue)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-required-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### 🗺 OSM-Suche
- Adresse oder Ort eingeben und per Nominatim geocodieren
- **Nur dieser Ort** – sucht innerhalb der Gemeindegrenzen (OSM Area Query)
- **Umkreis** – sucht in einem konfigurierbaren Radius (500m – 50km)
- Automatisches Mapping von ~74 OSM-Tags auf LSS-POI-Typen
- Intelligente Filter: keine privaten Pools, keine Mini-Seen, keine Kapellen, keine Gym-Hallen
- Mindestflächenfilter für Wälder, Seen, Moore und Parks
- Wenn ein Punkt (z.B. Firma, Gebäude) geocodiert wird: direkt als beliebiger POI-Typ hinzufügen
- De-Duplikation: OSM-Objekte die als Node + Way + Relation dreifach vorkommen werden zusammengeführt
- Duplikat-Check gegen bereits vorhandene LSS-POIs (konfigurierbarer Radius, Standard 100m)

### 📄 JSON-Import
- JSON-Datei per Drag & Drop oder direkter Eingabe einlesen
- Unterstützt `{ "mission_positions": [...] }` sowie reine Arrays
- Vorschau mit Typ-Filter und Einzel-Auswahl
- Duplikat-Check gegen vorhandene POIs vor dem Import

### 📌 Manuell
- POI-Typ wählen und direkt auf die Karte klicken
- Fadenkreuz-Cursor während der Platzierung
- Sofortige Anzeige auf der Karte nach dem Speichern

### 🗑 Löschen
- **Duplikate suchen**: findet POIs des gleichen Typs innerhalb eines konfigurierbaren Radius und schlägt den neueren zum Löschen vor
- **Filter & Löschen**: alle POIs vom Server laden, nach Name/Adresse und POI-Typ filtern, Auswahl löschen

### Allgemein
- Kartenrefresh nach Import/Löschung – neue POIs erscheinen sofort ohne F5
- Mini-Progressbar im minimierten Header
- Konfigurierbarer Delay zwischen Requests (Standard 50ms)
- Panel verschiebbar, minimierbar, schließbar
- Shortcut: **Alt+Shift+P**
- Nahtlose Integration in die LSS-Navbar (Bootstrap-3-Design)

---

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) im Browser installieren
2. Neues Skript erstellen und den Inhalt von [`lss-poi-importer.user.js`](./lss-poi-importer.user.js) einfügen
3. Speichern
4. Leitstellenspiel.de öffnen – beim ersten Klick auf **OSM abfragen** erscheint ein Tampermonkey-Dialog für externe Verbindungen → **„Immer erlauben"** wählen

---

## OSM → LSS Mapping

Das Skript mappt OSM-Tags automatisch auf LSS-POI-Typen:

| OSM-Tag | LSS-Typ |
|---|---|
| `amenity=hospital` | Krankenhaus |
| `amenity=school`, `amenity=university` | Schule |
| `amenity=fuel` | Tankstelle |
| `amenity=bank` | Bank |
| `amenity=place_of_worship` + nicht Kapelle | Kirche |
| `railway=station` | Bahnhof |
| `leisure=stadium` + nicht Indoor/Fitness | Stadion |
| `leisure=swimming_pool` + `access=public` | Schwimmbad |
| `natural=water` + Mindestgröße | See |
| `landuse=forest`, `natural=wood` + Mindestgröße | Wald |
| `waterway=river` | Fluss |
| `aeroway=aerodrome` | Flughafen |
| `tourism=zoo` | Zoo |
| `amenity=nightclub` | Diskothek |
| … | … (74 Regeln gesamt) |

### Intelligente Filter

- **Kapellen** (`building=chapel`, `place_of_worship=chapel`, Wegschreine) werden automatisch ausgeschlossen
- **Private Pools** (kein `access=public`/`fee=yes`) werden gefiltert
- **Kleine Sportanlagen** (`leisure=sports_centre`) werden nicht als Stadion gewertet
- **Miniaturwälder und Pfützen** werden per Bounding-Box-Größe herausgefiltert (Wald: ~7 ha, See: ~3 ha Minimum)

---

## JSON-Format

```json
{
  "mission_positions": [
    {
      "caption": "Hauptbahnhof München",
      "latitude": 48.14,
      "longitude": 11.558,
      "poi_type": 7,
      "address": "Bayerstraße 10, 80335 München"
    }
  ]
}
```

POI-Typ-Nummern: `0` = Park, `1` = See, `2` = Krankenhaus, `3` = Wald, `6` = Bahnhof (Regional), `7` = Bahnhof (Regional + Fern), `11` = Tankstelle, `12` = Schule, `20` = Stadion, `37` = Bank, `38` = Kirche, `61` = Zoo … (0–65 vollständig unterstützt)

---

## Hinweise

- **Caption**: LSS setzt die Caption nach dem Erstellen immer auf den POI-Typ-Namen (z.B. „Tankstelle"). Eine nachträgliche Änderung wird vom Spiel nicht unterstützt.
- **Overpass API**: Bei sehr vielen ausgewählten POI-Typen werden die Abfragen automatisch in Batches aufgeteilt (4 Filter-Gruppen pro Anfrage). Bei Timeout einfach weniger Typen auswählen.
- **Duplikat-Check**: Lädt beim ersten Import einmalig alle vorhandenen POIs und cached sie für die Session.

---

## Technologie

- [Overpass API](https://overpass-api.de) – OSM-Datenabfragen
- [Nominatim](https://nominatim.openstreetmap.org) – Geocoding
- [Leaflet](https://leafletjs.com) – Kartenintegration (via LSS)
- Tampermonkey `GM_xmlhttpRequest` für Cross-Origin-Requests

---

## Autor

**BrassPeddler**

---

## Lizenz

MIT
