// ==UserScript==
// @name         LSS POI Importer v2.4.14
// @namespace    https://www.leitstellenspiel.de/
// @version      2.4.14
// @downloadURL  https://github.com/BrassPeddler/lss-poi-importer/raw/refs/heads/main/leitstellenspiel_poi_import.user.js
// @updateURL    https://github.com/BrassPeddler/lss-poi-importer/raw/refs/heads/main/leitstellenspiel_poi_import.user.js
// @description  POIs aus JSON importieren, per OSM-Suche generieren oder alle löschen (Alt+Shift+P oder 📍-Button)
// @author       BrassPeddler
// @match        https://www.leitstellenspiel.de/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      overpass-api.de
// @connect      nominatim.openstreetmap.org
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // KONSTANTEN
  // ═══════════════════════════════════════════════════════════════════════════

  const POI_TYPES = {
    0:'Park',1:'See',2:'Krankenhaus',3:'Wald',4:'Bushaltestelle',
    5:'Straßenbahnhaltestelle',6:'Bahnhof (Regionalverkehr)',
    7:'Bahnhof (Regional und Fernverkehr)',8:'Güterbahnhof',
    9:'Supermarkt (Klein)',10:'Supermarkt (Groß)',11:'Tankstelle',
    12:'Schule',13:'Museum',14:'Einkaufszentrum',15:'Auto-Werkstatt',
    16:'Autobahnauf.- / abfahrt',17:'Weihnachtsmarkt',18:'Lagerhalle',
    19:'Diskothek',20:'Stadion',21:'Bauernhof',22:'Bürokomplex',
    23:'Schwimmbad',24:'Bahnübergang',25:'Theater',26:'Festplatz',
    27:'Fluss',28:'Baumarkt',29:'Flughafen (klein): Start-/Landebahn',
    30:'Flughafen (klein): Gebäude',31:'Flughafen (klein): Flugzeug Standplatz',
    32:'Flughafen (groß): Start-/Landebahn',33:'Flughafen (groß): Terminal',
    34:'Flughafen (groß): Vorfeld / Standplätze',35:'Flughafen (groß): Parkhaus',
    36:'Biogasanlage',37:'Bank',38:'Kirche',39:'Chemiepark',
    40:'Industrie-Allgemein',41:'Automobilindustrie',42:'Müllverbrennungsanlage',
    43:'Eishalle',44:'Holzverarbeitung',45:'Motorsportanlage',46:'Tunnel',
    47:'Klärwerk',48:'Innenstadt',49:'Möbelhaus',50:'Campingplatz',
    51:'Kompostieranlage',52:'Textilverarbeitung',53:'Moor',54:'Hüttenwerk',
    55:'Kraftwerk',56:'Werksgelände',57:'Seilbahn',58:'Brücke',
    59:'U-Bahn Station',60:'Eisenbahntunnel',61:'Zoo',62:'Kohlekraftwerk',
    63:'JVA',64:'Solarpark',65:'Raffinerie'
  };

  // OSM-Tag → LSS poi_type (Priorität: spezifischeres zuerst)
  const OSM_MAPPING = [
    {tags:{amenity:'hospital'},type:2},
    {tags:{amenity:'clinic'},type:2},
    {tags:{railway:'station',station:'subway'},type:59},
    {tags:{railway:'station',usage:'main'},type:7},
    {tags:{railway:'station'},type:6},
    {tags:{railway:'halt'},type:6},
    {tags:{railway:'tram_stop'},type:5},
    {tags:{railway:'level_crossing'},type:24},
    {tags:{highway:'bus_stop'},type:4},
    {tags:{amenity:'bus_station'},type:4},
    {tags:{aeroway:'terminal'},type:33},
    {tags:{aeroway:'aerodrome',aerodrome:'international'},type:32},
    {tags:{aeroway:'aerodrome'},type:29},
    {tags:{aeroway:'runway'},type:29},
    {tags:{amenity:'university'},type:12},
    {tags:{amenity:'college'},type:12},
    {tags:{amenity:'school'},type:12},
    {tags:{building:'school'},type:12},
    {tags:{shop:'supermarket'},type:10},
    {tags:{shop:'convenience'},type:9},
    {tags:{shop:'kiosk'},type:9},
    {tags:{shop:'department_store'},type:14},
    {tags:{shop:'mall'},type:14},
    {tags:{shop:'furniture'},type:49},
    {tags:{shop:'doityourself'},type:28},
    {tags:{shop:'hardware'},type:28},
    {tags:{shop:'car_repair'},type:15},
    {tags:{amenity:'fuel'},type:11},
    {tags:{amenity:'bank'},type:37},
    // Kirchen: building=church/cathedral immer inkludieren.
    // place_of_worship nur wenn keine Kapelle/Wegkapelle/Schrein.
    // Kapellen in OSM: building=chapel, place_of_worship=chapel,
    //   amenity=wayside_shrine, historic=wayside_cross, tourism=wayside_shrine
    {tags:{building:'cathedral'},type:38},
    {tags:{building:'church'},type:38},
    {tags:{amenity:'place_of_worship'},type:38,
      excludeIf:[
        {building:'chapel'},{place_of_worship:'chapel'},
        {amenity:'wayside_shrine'},{amenity:'wayside_cross'},
        {tourism:'wayside_shrine'},{historic:'wayside_cross'},
        {historic:'wayside_shrine'},{man_made:'cross'},
      ]},
    {tags:{leisure:'water_park'},type:23},
    // Schwimmbäder: nur öffentliche. Private Pools haben access=private oder keinen access-Tag.
    // Öffentlich erkennbar an: access=public/yes, leisure=swimming_pool + name (benannte Bäder
    // sind fast immer öffentlich), amenity=public_bath, oder fee=yes.
    {tags:{leisure:'swimming_pool'},type:23,
      requireAny:[
        {access:'public'},{access:'yes'},{fee:'yes'},
        {amenity:'public_bath'},{sport:'swimming'},
      ]},
    {tags:{amenity:'swimming_pool'},type:23,
      requireAny:[
        {access:'public'},{access:'yes'},{fee:'yes'},{sport:'swimming'},
      ]},
    {tags:{amenity:'public_bath'},type:23},
    {tags:{leisure:'ice_rink'},type:43},
    // Stadion: nur leisure=stadium, leisure=sports_centre weglassen (erfasst auch Gyms/Fitnessstudios).
    // Bei stadium zusätzlich: indoor-Hallen, Sporthallen und reine Fitness-Anlagen ausschließen.
    {tags:{leisure:'stadium'},type:20,
      excludeIf:[
        {indoor:'yes'},{building:'sports_hall'},{building:'gym'},
        {sport:'fitness'},{sport:'gymnastics'},
        {leisure:'fitness_centre'},{leisure:'fitness_station'},
      ]},
    {tags:{amenity:'theatre'},type:25},
    {tags:{amenity:'cinema'},type:25},
    {tags:{amenity:'nightclub'},type:19},
    {tags:{tourism:'museum'},type:13},
    {tags:{tourism:'zoo'},type:61},
    {tags:{tourism:'camp_site'},type:50},
    {tags:{tourism:'caravan_site'},type:50},
    {tags:{leisure:'park'},type:0},
    {tags:{leisure:'garden'},type:0},
    {tags:{landuse:'forest'},type:3},
    {tags:{natural:'wood'},type:3},
    {tags:{natural:'water',water:'lake'},type:1},
    {tags:{natural:'water',water:'reservoir'},type:1},
    {tags:{natural:'water'},type:1},
    {tags:{natural:'wetland',wetland:'bog'},type:53},
    {tags:{natural:'wetland'},type:53},
    {tags:{waterway:'river'},type:27},
    {tags:{waterway:'stream'},type:27},
    {tags:{power:'plant',plant_source:'coal'},type:62},
    {tags:{power:'plant',plant_source:'solar'},type:64},
    {tags:{power:'plant',plant_source:'biogas'},type:36},
    {tags:{power:'plant'},type:55},
    {tags:{man_made:'wastewater_plant'},type:47},
    {tags:{man_made:'works'},type:56},
    {tags:{landuse:'industrial'},type:40},
    {tags:{building:'industrial'},type:40},
    {tags:{building:'warehouse'},type:18},
    {tags:{landuse:'warehouse'},type:18},
    {tags:{aerialway:'gondola'},type:57},
    {tags:{aerialway:'cable_car'},type:57},
    {tags:{highway:'motorway_junction'},type:16},
    {tags:{landuse:'farmyard'},type:21},
    {tags:{building:'farm'},type:21},
    {tags:{amenity:'prison'},type:63},
    {tags:{leisure:'motorsport'},type:45},
    {tags:{landuse:'solar_farm'},type:64},
  ];

  // Alle OSM-Tag-Paare die wir abfragen wollen (dedupliziert aus OSM_MAPPING)
  const OSM_QUERY_TAGS = [...new Map(
    OSM_MAPPING.map(r => {
      const [k,v] = Object.entries(r.tags)[0];
      return [`${k}=${v}`, [k,v]];
    })
  ).values()];

  // ═══════════════════════════════════════════════════════════════════════════
  // HILFSFUNKTIONEN
  // ═══════════════════════════════════════════════════════════════════════════

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function getCsrfToken() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : null;
  }

  function osmToLssType(tags) {
    for (const rule of OSM_MAPPING) {
      // Pflicht-Tags müssen alle passen
      if (!Object.entries(rule.tags).every(([k,v]) => tags[k] === v)) continue;
      // excludeIf: wenn eines der Ausschluss-Objekte vollständig passt → skip
      if (rule.excludeIf && rule.excludeIf.some(excl =>
        Object.entries(excl).every(([k,v]) => tags[k] === v)
      )) continue;
      // requireAny: mindestens eines der Objekte muss vollständig passen
      if (rule.requireAny && !rule.requireAny.some(req =>
        Object.entries(req).every(([k,v]) => tags[k] === v)
      )) continue;
      return rule.type;
    }
    return null;
  }

  function osmName(tags) {
    return tags['name:de'] || tags.name || tags.ref || tags.operator || null;
  }

  function osmCoords(el) {
    if (el.type === 'node') return {lat:el.lat, lon:el.lon};
    if (el.center) return {lat:el.center.lat, lon:el.center.lon};
    if (el.bounds) return {
      lat:(el.bounds.minlat+el.bounds.maxlat)/2,
      lon:(el.bounds.minlon+el.bounds.maxlon)/2
    };
    return null;
  }

  function osmAddress(tags) {
    return [tags['addr:street'],tags['addr:housenumber'],tags['addr:postcode'],tags['addr:city']]
      .filter(Boolean).join(' ');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API
  // ═══════════════════════════════════════════════════════════════════════════

  function geocode(query) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method:'GET',
        url:`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        headers:{
          'Accept':'application/json',
          'Accept-Language':'de',
          'User-Agent':'LSS-POI-Importer/2.0'
        },
        onload(r) {
          if (r.status === 0) { reject(new Error('Nominatim blockiert – Tampermonkey-Berechtigung fehlt. Skript neu laden und Zugriff erlauben.')); return; }
          if (r.status !== 200) { reject(new Error(`Nominatim HTTP ${r.status}`)); return; }
          try {
            const d = JSON.parse(r.responseText);
            if (d.length) resolve({
              lat: parseFloat(d[0].lat),
              lon: parseFloat(d[0].lon),
              display: d[0].display_name,
              osm_type: d[0].osm_type,   // node / way / relation
              osm_id:   d[0].osm_id,     // numerische OSM-ID
            });
            else reject(new Error('Ort nicht gefunden'));
          } catch(e) { reject(new Error('Nominatim Antwort ungültig')); }
        },
        onerror:() => reject(new Error('Nominatim nicht erreichbar (Netzwerkfehler)')),
        ontimeout:() => reject(new Error('Nominatim Timeout'))
      });
    });
  }

  // Baut Filter-Gruppen aus aktiven Tags (gruppiert nach Key)
  function buildFilters(selectedTypes) {
    const activeTags = OSM_QUERY_TAGS.filter(([k,v]) =>
      OSM_MAPPING.some(rule => {
        const [rk,rv] = Object.entries(rule.tags)[0];
        return rk===k && rv===v && selectedTypes.includes(rule.type);
      })
    );
    const byKey = {};
    for (const [k,v] of activeTags) {
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(v);
    }
    return Object.entries(byKey).map(([k,vals]) =>
      vals.length===1 ? `["${k}"="${vals[0]}"]` : `["${k}"~"^(${vals.join('|')})$"]`
    );
  }

  // Splittet Filter in Batches und führt mehrere Abfragen durch, mergt Ergebnisse
  const BATCH_SIZE = 4; // Filter-Gruppen pro Abfrage

  async function overpassAreaQuery(osmType, osmId, selectedTypes, onProgress) {
    let areaId;
    if (osmType === 'relation') areaId = parseInt(osmId) + 3600000000;
    else if (osmType === 'way')  areaId = parseInt(osmId) + 2400000000;
    else                         areaId = parseInt(osmId);

    const filters = buildFilters(selectedTypes);
    const batches = [];
    for (let i = 0; i < filters.length; i += BATCH_SIZE)
      batches.push(filters.slice(i, i + BATCH_SIZE));

    const allElements = [];
    for (let b = 0; b < batches.length; b++) {
      if (onProgress) onProgress(b + 1);
      const batch = batches[b];
      const geo = type => batch.map(f => `  ${type}${f}(area.searcharea);`).join('\n');
      const ql = `[out:json][timeout:180];
area(${areaId})->.searcharea;
(
${geo('node')}
${geo('way')}
${geo('relation')}
);
out center tags bb;`;
      const data = await sendOverpassQuery(ql);
      allElements.push(...(data.elements || []));
    }
    return { elements: allElements };
  }

  async function overpassQuery(lat, lon, radiusM, selectedTypes, onProgress) {
    const filters = buildFilters(selectedTypes);
    const batches = [];
    for (let i = 0; i < filters.length; i += BATCH_SIZE)
      batches.push(filters.slice(i, i + BATCH_SIZE));

    const allElements = [];
    for (let b = 0; b < batches.length; b++) {
      if (onProgress) onProgress(b + 1);
      const batch = batches[b];
      const geo = type => batch.map(f => `  ${type}${f}(around:${radiusM},${lat},${lon});`).join('\n');
      const ql = `[out:json][timeout:180];
(
${geo('node')}
${geo('way')}
${geo('relation')}
);
out center tags bb;`;
      const data = await sendOverpassQuery(ql);
      allElements.push(...(data.elements || []));
    }
    return { elements: allElements };
  }

  function sendOverpassQuery(ql) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method:'POST',
        url:'https://overpass-api.de/api/interpreter',
        data:'data='+encodeURIComponent(ql),
        headers:{
          'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept':'application/json, text/plain, */*',
          'User-Agent':'LSS-POI-Importer/2.0'
        },
        onload(r) {
          if (r.status === 0) {
            reject(new Error(
              '⚠ Zugriff verweigert (Status 0) – Tampermonkey-Berechtigung fehlt!\n' +
              'Lösung: Skript in Tampermonkey öffnen → Speichern → Seite neu laden → ' +
              'beim erscheinenden Dialog "overpass-api.de" erlauben.'
            ));
            return;
          }
          if (r.status === 400) { reject(new Error('Overpass: Abfragesyntax ungültig (400)')); return; }
          if (r.status === 429) { reject(new Error('Overpass: Zu viele Anfragen, kurz warten (429)')); return; }
          if (r.status === 504) { reject(new Error('Overpass Timeout (504) – Abfrage zu groß. Tipp: Weniger POI-Typen auswählen oder kleineren Radius verwenden.')); return; }
          if (r.status !== 200) { reject(new Error(`Overpass HTTP ${r.status} – ${r.responseText.substring(0,120)}`)); return; }
          try { resolve(JSON.parse(r.responseText)); }
          catch(e) { reject(new Error('Overpass Antwort konnte nicht geparst werden')); }
        },
        onerror:() => reject(new Error('Overpass nicht erreichbar – Netzwerkfehler')),
        ontimeout:() => reject(new Error('Overpass Timeout'))
      });
    });
  }

  async function createPOI(poi, token) {
    const fd = new FormData();
    fd.append('utf8','✓');
    fd.append('mission_position[poi_type]', poi.poi_type);
    fd.append('mission_position[latitude]', poi.latitude);
    fd.append('mission_position[longitude]', poi.longitude);
    fd.append('mission_position[address]', poi.address||'');
    const h = {'X-Requested-With':'XMLHttpRequest'};
    if (token) h['X-CSRF-Token'] = token;
    const r = await fetch('/mission_positions',{method:'POST',headers:h,body:fd,credentials:'same-origin'});
    return r.ok;
  }

  async function fetchAllPOIs() {
    // Prüfen ob POI-Ebene auf der Karte aktiv ist
    try {
      if (typeof map_filters_service !== 'undefined') {
        const layers = map_filters_service.getMapFiltersLayers?.();
        const poisLayer = layers?.pois;
        if (poisLayer && poisLayer.isHidden && poisLayer.isHidden()) {
          throw new Error(
            'POI-Ebene ist auf der Karte ausgeblendet!\n' +
            'Bitte in den Kartenfiltern die POI-Anzeige aktivieren, sonst werden keine POIs geladen.'
          );
        }
      }
    } catch(e) {
      if (e.message.includes('POI-Ebene')) throw e;
    }

    const r = await fetch('/mission_positions.json',{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const pois = (await r.json()).mission_positions || [];

    // Leer = POI-Filter ausgeblendet ODER neuer Account ohne POIs
    if (pois.length === 0) {
      const err = new Error(
        'Keine POIs geladen (leere Liste).\n' +
        'Mögliche Ursache: POI-Anzeige in den Kartenfiltern deaktiviert.\n' +
        'Falls du noch keine POIs hast, kannst du trotzdem fortfahren.'
      );
      err.isEmpty = true;
      throw err;
    }

    // 10.000 POI-Limit warnen
    const limitReached = pois.length >= 10000;
    if (limitReached) {
      console.warn('[LSS POI Importer] ⚠ Exakt 10.000 POIs geladen – möglicherweise sind weitere vorhanden.');
    }

    return { pois, limitReached };
  }

  async function deletePOI(id, token) {
    const fd = new FormData();
    fd.append('_method','delete'); fd.append('utf8','✓');
    const h = {'X-Requested-With':'XMLHttpRequest','X-HTTP-Method-Override':'DELETE'};
    if (token) h['X-CSRF-Token'] = token;
    const r = await fetch(`/mission_positions/${id}`,{method:'POST',headers:h,body:fd,credentials:'same-origin'});
    return r.ok;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════════════════

  function buildUI() {
    if (document.getElementById('lss-poi-importer')) return;

    const style = document.createElement('style');
    style.textContent = `
      /* ── LSS Bootstrap 3 Light Theme ── */
      #lss-poi-importer{
        position:fixed;top:60px;right:16px;width:420px;max-height:calc(100vh - 80px);
        background:#fff;border:1px solid #ccc;border-radius:4px;
        box-shadow:0 6px 20px rgba(0,0,0,.25);
        font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
        font-size:13px;color:#333;z-index:99999;
        display:flex;flex-direction:column;overflow:hidden;
      }
      #lss-poi-importer *{box-sizing:border-box;margin:0;padding:0;}

      /* Header – wie LSS modal-header */
      #lss-hdr{
        background:#f5f5f5;padding:9px 15px;
        display:flex;align-items:center;justify-content:space-between;
        cursor:move;user-select:none;
        border-bottom:1px solid #e5e5e5;border-radius:4px 4px 0 0;flex-shrink:0;
      }
      #lss-hdr .htitle{font-size:14px;font-weight:700;color:#333;}
      #lss-hdr .hbadge{
        background:#337ab7;color:#fff;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:3px;margin-left:8px;
      }
      #lss-hdr .hbtns{display:flex;gap:2px;}
      #lss-hdr button{
        background:none;border:none;color:#999;font-size:16px;line-height:1;
        cursor:pointer;padding:2px 7px;border-radius:3px;
        transition:color .15s,background .15s;
      }
      #lss-hdr button:hover{color:#333;background:#e5e5e5;}

      /* Tabs – wie LSS nav-tabs */
      .ltabs{display:flex;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0;}
      .ltab{
        flex:1;padding:8px 4px;text-align:center;font-size:12px;font-weight:600;
        color:#555;cursor:pointer;border-bottom:3px solid transparent;
        transition:color .15s,background .15s,border-color .15s;user-select:none;
      }
      .ltab:hover{color:#333;background:#ebebeb;}
      .ltab.on{color:#337ab7;border-bottom-color:#337ab7;background:#fff;}
      .lpane{display:none;flex-direction:column;gap:10px;}
      .lpane.on{display:flex;}

      /* Body */
      #lss-body{padding:14px;overflow-y:auto;flex:1;background:#fff;}

      /* Labels */
      .ll{
        font-size:11px;font-weight:700;color:#777;
        text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;
      }

      /* Inputs – wie Bootstrap 3 form-control */
      .li{
        width:100%;background:#fff;border:1px solid #ccc;border-radius:4px;
        color:#333;font-size:13px;padding:6px 10px;outline:none;
        box-shadow:inset 0 1px 1px rgba(0,0,0,.075);
        transition:border-color .15s,box-shadow .15s;
      }
      .li:focus{border-color:#66afe9;box-shadow:inset 0 1px 1px rgba(0,0,0,.075),0 0 6px rgba(102,175,233,.6);}
      textarea.li{font-family:monospace;font-size:11px;height:80px;resize:vertical;}
      select.li{padding:5px 8px;cursor:pointer;}

      /* Buttons – Bootstrap 3 */
      .lb{
        background:#fff;border:1px solid #ccc;color:#333;
        border-radius:4px;padding:5px 12px;font-size:13px;cursor:pointer;
        white-space:nowrap;transition:background .15s,border-color .15s;
        font-weight:400;line-height:1.4;
      }
      .lb:hover{background:#e6e6e6;border-color:#adadad;}
      .lb:disabled{opacity:.55;cursor:not-allowed;}
      /* btn-primary */
      .lb.p{background:#337ab7;border-color:#2e6da4;color:#fff;font-weight:600;}
      .lb.p:hover{background:#286090;border-color:#204d74;}
      .lb.p:disabled{background:#5e9dc8;border-color:#5e9dc8;}
      /* btn-success */
      .lb.s{background:#5cb85c;border-color:#4cae4c;color:#fff;font-weight:600;}
      .lb.s:hover{background:#449d44;border-color:#398439;}
      .lb.s:disabled{background:#80c780;border-color:#80c780;}
      /* btn-danger */
      .lb.d{background:#fff;border-color:#d9534f;color:#d9534f;}
      .lb.d:hover{background:#d9534f;border-color:#d43f3a;color:#fff;}

      /* Flex row */
      .lr{display:flex;gap:8px;align-items:center;}

      /* Drop zone */
      .ldz{
        border:2px dashed #ccc;border-radius:4px;padding:14px 12px;
        text-align:center;cursor:pointer;color:#999;
        transition:border-color .2s,background .2s;
      }
      .ldz:hover,.ldz.ov{border-color:#337ab7;background:#f0f7ff;color:#337ab7;}
      .ldz .dzi{font-size:20px;margin-bottom:3px;}
      .ldz .dzh{font-size:11px;color:#bbb;margin-top:2px;}

      /* Tabelle */
      .ltw{max-height:180px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;}
      table.lt{width:100%;border-collapse:collapse;font-size:12px;}
      .lt thead th{
        background:#f5f5f5;padding:6px 8px;text-align:left;
        font-weight:700;color:#555;border-bottom:2px solid #ddd;
        position:sticky;top:0;z-index:1;
      }
      .lt tbody tr{border-bottom:1px solid #f0f0f0;}
      .lt tbody tr:last-child{border-bottom:none;}
      .lt tbody tr:hover{background:#f9f9f9;}
      .lt td{padding:5px 8px;vertical-align:middle;color:#333;}
      .lt td.m{font-family:monospace;font-size:11px;color:#777;}
      .lt td.e{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

      /* Fortschritt */
      .lpw{display:flex;flex-direction:column;gap:5px;}
      .lpr{display:flex;justify-content:space-between;font-size:11px;color:#777;}
      .lpbg{height:16px;background:#f5f5f5;border-radius:4px;overflow:hidden;border:1px solid #ddd;}
      .lpbf{height:100%;border-radius:3px;width:0%;transition:width .3s;background-image:linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);background-size:40px 40px;}
      .lpbf.blue{background-color:#337ab7;}
      .lpbf.red{background-color:#d9534f;}
      .lstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px;}
      .lstat{background:#f9f9f9;border:1px solid #e3e3e3;border-radius:4px;padding:6px 8px;text-align:center;}
      .lstat .sv{font-size:17px;font-weight:700;color:#333;line-height:1;}
      .lstat .sl{font-size:10px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:.4px;}
      .lstat.ok .sv{color:#3c763d;}
      .lstat.fail .sv{color:#a94442;}

      /* Log */
      .llog{
        background:#f9f9f9;border:1px solid #ddd;border-radius:4px;
        padding:8px 10px;font-family:monospace;font-size:11px;
        max-height:110px;overflow-y:auto;line-height:1.8;color:#333;
      }
      .lok{color:#3c763d;} .lfail{color:#a94442;} .linfo{color:#31708f;} .lwarn{color:#8a6d3b;}

      /* Fehler-Box – Bootstrap alert-danger */
      .lerr{
        background:#f2dede;border:1px solid #ebccd1;color:#a94442;
        border-radius:4px;padding:8px 12px;font-size:12px;line-height:1.5;
      }

      /* Bestätigungs-Box */
      .lconf{
        background:#f2dede;border:1px solid #ebccd1;border-radius:4px;
        padding:10px 12px;font-size:12px;color:#a94442;
        display:none;flex-direction:column;gap:8px;
      }
      .lconf.on{display:flex;}

      /* OSM Typ-Grid */
      .ltg{
        display:grid;grid-template-columns:repeat(2,1fr);gap:2px;
        max-height:155px;overflow-y:auto;
        background:#fff;border:1px solid #ddd;border-radius:4px;padding:8px;
      }
      .ltg label{
        display:flex;align-items:center;gap:5px;font-size:12px;
        color:#555;cursor:pointer;padding:2px 4px;border-radius:3px;
      }
      .ltg label:hover{background:#f5f5f5;color:#333;}
      .ltg input{accent-color:#337ab7;cursor:pointer;}

      /* Geocode-Info – Bootstrap alert-info */
      .lgeo{
        font-size:11px;color:#31708f;padding:6px 10px;
        background:#d9edf7;border:1px solid #bce8f1;
        border-radius:4px;line-height:1.4;
      }

      /* Delay-Zeile */
      .ldel{display:flex;align-items:center;gap:8px;font-size:12px;color:#777;}
      .ldel input{
        width:68px;background:#fff;border:1px solid #ccc;border-radius:4px;
        color:#333;font-size:12px;padding:4px 8px;outline:none;
        box-shadow:inset 0 1px 1px rgba(0,0,0,.075);
      }
      .ldel input:focus{border-color:#66afe9;}

      /* Trennlinie */
      hr.lhr{border:none;border-top:1px solid #e5e5e5;}

      /* Info-Banner – Bootstrap alert-info */
      .linfo-box{
        background:#d9edf7;border:1px solid #bce8f1;
        border-left:3px solid #31b0d5;
        border-radius:4px;padding:8px 12px;font-size:11px;
        color:#31708f;line-height:1.5;
      }
      .linfo-box code{
        background:rgba(0,0,0,.07);padding:1px 4px;border-radius:3px;
        font-size:10px;color:#245269;
      }

      /* Scrollbar */
      #lss-body::-webkit-scrollbar,.ltw::-webkit-scrollbar,.ltg::-webkit-scrollbar,.llog::-webkit-scrollbar{width:5px;}
      #lss-body::-webkit-scrollbar-track,.ltw::-webkit-scrollbar-track,.ltg::-webkit-scrollbar-track,.llog::-webkit-scrollbar-track{background:#f5f5f5;}
      #lss-body::-webkit-scrollbar-thumb,.ltw::-webkit-scrollbar-thumb,.ltg::-webkit-scrollbar-thumb,.llog::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px;}
      #lss-body::-webkit-scrollbar-thumb:hover,.ltw::-webkit-scrollbar-thumb:hover{background:#aaa;}
    `;
    document.head.appendChild(style);

    // ── HTML ──────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'lss-poi-importer';
    panel.innerHTML = `
      <div id="lss-hdr">
        <div class="lr"><span class="htitle">📍 POI Importer</span><span class="hbadge">v2.4.13</span></div>
        <div class="hbtns">
          <button id="lss-min">─</button>
          <button id="lss-close">✕</button>
        </div>
      </div>
      <!-- Mini-Progressbar im Header (nur sichtbar wenn minimiert + aktiv) -->
      <div id="lss-mini-progress" style="display:none;padding:0 0 4px 0;background:#f5f5f5;border-bottom:1px solid #e5e5e5;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#777;padding:3px 12px 2px">
          <span id="lss-mini-label">0 / 0</span>
          <span id="lss-mini-pct">0%</span>
        </div>
        <div style="height:4px;background:#e5e5e5;margin:0 12px;border-radius:2px;overflow:hidden">
          <div id="lss-mini-bar" style="height:100%;width:0%;border-radius:2px;background:#337ab7;transition:width .3s"></div>
        </div>
      </div>

      <div class="ltabs">
        <div class="ltab on" data-tab="osm">🗺 OSM-Suche</div>
        <div class="ltab" data-tab="json">📄 JSON</div>
        <div class="ltab" data-tab="man">📌 Manuell</div>
        <div class="ltab" data-tab="del">🗑 Löschen</div>
      </div>

      <div id="lss-body">

        <!-- OSM TAB -->
        <div class="lpane on" id="tab-osm">
          <div class="linfo-box">
            ℹ️ <strong>Tampermonkey-Berechtigung erforderlich:</strong> Beim ersten Klick auf „OSM abfragen" öffnet Tampermonkey einen Erlaubnisdialog für <code>overpass-api.de</code> und <code>nominatim.openstreetmap.org</code> – bitte <strong>„Immer erlauben"</strong> wählen.
          </div>
          <div id="o-poi-layer-warn" style="display:none;background:#fcf8e3;border:1px solid #faebcc;border-left:3px solid #f0ad4e;border-radius:4px;padding:8px 10px;font-size:12px;color:#8a6d3b;line-height:1.5">
            ⚠️ <strong>POI-Ebene nicht aktiv!</strong> Die POI-Anzeige ist in den Kartenfiltern deaktiviert. Dadurch kann der Duplikat-Check nicht funktionieren – es könnten doppelte POIs entstehen. Bitte die POI-Ebene in den Kartenfiltern einschalten.
          </div>
          <div>
            <div class="ll">Adresse / Ort</div>
            <div class="lr">
              <input id="o-addr" class="li" placeholder="z.B. Biberach an der Riß" style="flex:1">
              <button class="lb p" id="o-geo-btn" title="Geocodieren">📍</button>
            </div>
            <div id="o-geo-info" style="display:none;margin-top:5px" class="lgeo"></div>
            <!-- Erscheint wenn Geocodierung einen Punkt (kein Gebiet) liefert -->
            <div id="o-point-add" style="display:none;margin-top:6px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:8px 10px">
              <div style="font-size:11px;color:#777;margin-bottom:6px">📍 Punkt gefunden – direkt als POI hinzufügen:</div>
              <div class="lr">
                <select id="o-point-type" class="li" style="flex:1;font-size:12px">
                  ${Object.entries(POI_TYPES).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>
                    `<option value="${id}">${name}</option>`).join('')}
                </select>
                <button class="lb s" id="o-point-add-btn" style="white-space:nowrap;padding:5px 10px;font-size:12px">+ Hinzufügen</button>
              </div>
            </div>
          </div>
          <div>
            <div class="ll" style="margin-bottom:6px">Suchmodus</div>
            <div class="lr" style="gap:0">
              <button class="lb" id="o-mode-area" style="border-radius:4px 0 0 4px;flex:1;font-weight:600;background:#337ab7;border-color:#2e6da4;color:#fff">📐 Nur dieser Ort</button>
              <button class="lb" id="o-mode-radius" style="border-radius:0 4px 4px 0;flex:1">⭕ Umkreis</button>
            </div>
          </div>
          <div id="o-radius-row" style="display:none" class="lr">
            <div style="flex:1">
              <div class="ll">Radius (m)</div>
              <input id="o-radius" class="li" type="number" value="5000" min="500" max="50000" step="500" placeholder="5000">
            </div>
            <div style="flex:1">
              <div class="ll">Koordinaten (optional)</div>
              <input id="o-coords" class="li" placeholder="48.098, 9.789">
            </div>
          </div>
          <div>
            <div class="ll" style="margin-bottom:6px">POI-Typen
              <span style="float:right;font-weight:400;font-size:10px">
                <a href="#" id="o-all" style="color:#60a5fa;text-decoration:none">Alle</a> /
                <a href="#" id="o-none" style="color:#60a5fa;text-decoration:none">Keine</a>
              </span>
            </div>
            <div class="ltg" id="o-types">
              ${Object.entries(POI_TYPES).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>
                `<label><input type="checkbox" data-t="${id}" checked>${name}</label>`
              ).join('')}
            </div>
          </div>
          <button class="lb p" id="o-search" style="width:100%;padding:8px">🔍 OSM abfragen</button>
          <div id="o-res" style="display:none;flex-direction:column;gap:10px">
            <hr class="lhr">
            <div class="lr" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
              <span class="ll" style="margin:0" id="o-count"></span>
              <div class="lr" style="gap:5px">
                <select class="li" id="o-fsel" style="font-size:11px;padding:4px 6px"></select>
                <button class="lb" id="o-tall" style="font-size:11px;padding:3px 8px">Alle</button>
                <button class="lb" id="o-tnone" style="font-size:11px;padding:3px 8px">Keine</button>
              </div>
            </div>
            <div class="ltw"><table class="lt">
              <thead><tr>
                <th style="width:28px"><input type="checkbox" id="o-chkall"></th>
                <th>Name</th><th>Typ</th><th>Lat</th><th>Lng</th><th style="width:28px"></th>
              </tr></thead>
              <tbody id="o-tbody"></tbody>
            </table></div>
            <div class="ldel">
              <span>Delay:</span><input id="o-delay" type="number" value="100" min="100" max="5000" step="100"><span>ms</span>
              <span style="margin-left:8px">Dup.-Radius:</span><input id="o-dup-radius" type="number" value="100" min="10" max="1000" step="10"><span>m</span>
            </div>
            <div id="o-prog" style="display:none" class="lpw">
              <div class="lpr"><span id="o-pl">0/0</span><span id="o-pp">0%</span></div>
              <div class="lpbg"><div class="lpbf blue" id="o-pb"></div></div>
              <div class="lstats">
                <div class="lstat"><div class="sv" id="o-st">0</div><div class="sl">Gesamt</div></div>
                <div class="lstat ok"><div class="sv" id="o-sok">0</div><div class="sl">OK</div></div>
                <div class="lstat fail"><div class="sv" id="o-sfail">0</div><div class="sl">Fehler</div></div>
              </div>
            </div>
            <button class="lb s" id="o-import" style="width:100%;padding:8px;font-weight:600">⬆ Auswahl importieren</button>
            <div id="o-dup-limit-warn" style="display:none;background:#fcf8e3;border:1px solid #faebcc;border-left:3px solid #f0ad4e;border-radius:4px;padding:8px 10px;font-size:12px;color:#8a6d3b;line-height:1.5">
              ⚠ <strong>Duplikat-Check unvollständig!</strong> Es wurden nur 10.000 von möglicherweise mehr POIs geladen.
              Es könnten Duplikate entstehen.<br>
              <label style="margin-top:6px;display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="o-dup-limit-override"> <span>Ich verstehe das Risiko – trotzdem importieren</span>
              </label>
            </div>
            <div id="o-logs" style="display:none"><div class="ll">Protokoll</div><div class="llog" id="o-log"></div></div>
          </div>
          <div id="o-err" style="display:none" class="lerr"></div>
        </div>

        <!-- JSON TAB -->
        <div class="lpane" id="tab-json">
          <div>
            <div class="ll">JSON-Datei</div>
            <div class="ldz" id="j-dz"><div class="dzi">📂</div><div>JSON-Datei ablegen oder klicken</div><div class="dzh">mission_positions-Format oder Array</div></div>
            <input type="file" id="j-fi" accept=".json,application/json" style="display:none">
          </div>
          <div>
            <div class="ll">Oder direkt einfügen</div>
            <textarea id="j-ta" class="li" placeholder='{ "mission_positions": [...] }'></textarea>
            <div class="lr" style="margin-top:6px">
              <button class="lb p" id="j-parse" style="flex:1">Einlesen</button>
              <button class="lb d" id="j-clear">Leeren</button>
            </div>
          </div>
          <div id="j-res" style="display:none;flex-direction:column;gap:10px">
            <hr class="lhr">
            <div class="lr" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
              <span class="ll" style="margin:0" id="j-count"></span>
              <div class="lr" style="gap:5px">
                <select class="li" id="j-fsel" style="font-size:11px;padding:4px 6px"></select>
                <button class="lb" id="j-tall" style="font-size:11px;padding:3px 8px">Alle</button>
                <button class="lb" id="j-tnone" style="font-size:11px;padding:3px 8px">Keine</button>
              </div>
            </div>
            <div class="ltw"><table class="lt">
              <thead><tr>
                <th style="width:28px"><input type="checkbox" id="j-chkall"></th>
                <th>Name</th><th>Typ</th><th>Lat</th><th>Lng</th><th style="width:28px"></th>
              </tr></thead>
              <tbody id="j-tbody"></tbody>
            </table></div>
            <div class="ldel">
              <span>Delay:</span><input id="j-delay" type="number" value="50" min="50" max="5000" step="100"><span>ms</span>
              <span style="margin-left:8px">Dup.-Radius:</span><input id="j-dup-radius" type="number" value="100" min="10" max="1000" step="10"><span>m</span>
            </div>
            <div id="j-prog" style="display:none" class="lpw">
              <div class="lpr"><span id="j-pl">0/0</span><span id="j-pp">0%</span></div>
              <div class="lpbg"><div class="lpbf blue" id="j-pb"></div></div>
              <div class="lstats">
                <div class="lstat"><div class="sv" id="j-st">0</div><div class="sl">Gesamt</div></div>
                <div class="lstat ok"><div class="sv" id="j-sok">0</div><div class="sl">OK</div></div>
                <div class="lstat fail"><div class="sv" id="j-sfail">0</div><div class="sl">Fehler</div></div>
              </div>
            </div>
            <button class="lb p" id="j-import" style="width:100%;padding:8px;font-weight:600">⬆ Auswahl importieren</button>
            <div id="j-logs" style="display:none"><div class="ll">Protokoll</div><div class="llog" id="j-log"></div></div>
          </div>
          <div id="j-err" style="display:none" class="lerr"></div>
        </div>

        <!-- DEL TAB -->
        <div class="lpane" id="tab-del">
          <div style="font-size:12px;color:#777;line-height:1.6">
            POIs laden, filtern und gezielt oder alle löschen.
            <strong style="color:#a94442">Nicht rückgängig machbar.</strong>
          </div>

          <!-- Duplikat-Check -->
          <div>
            <div class="ll">Duplikate suchen</div>
            <div class="ldel" style="margin-bottom:6px">
              <span>Radius:</span>
              <input id="d-dup-radius" type="number" value="100" min="10" max="1000" step="10">
              <span>m</span>
            </div>
            <button class="lb" id="d-dup-check" style="width:100%;padding:7px">🔍 Duplikate prüfen</button>
            <div id="d-dup-result" style="display:none;flex-direction:column;gap:8px;margin-top:8px">
              <div id="d-dup-summary" style="font-size:12px;color:#777"></div>
              <div class="ltw" id="d-dup-wrap"><table class="lt">
                <thead><tr>
                  <th style="width:28px"><input type="checkbox" id="d-dup-chkall"></th>
                  <th>Name</th><th>Typ</th><th>Adresse</th><th style="width:36px;text-align:center">Dist.</th>
                </tr></thead>
                <tbody id="d-dup-tbody"></tbody>
              </table></div>
              <div class="lr" style="gap:6px">
                <button class="lb" id="d-dup-sel-all" style="font-size:11px;padding:3px 8px">Alle</button>
                <button class="lb" id="d-dup-sel-none" style="font-size:11px;padding:3px 8px">Keine</button>
                <button class="lb d" id="d-dup-delete" style="flex:1;padding:5px">🗑 Auswahl löschen…</button>
              </div>
            </div>
          </div>

          <hr class="lhr">

          <!-- Filter & Laden -->
          <div>
            <div class="ll">Filter &amp; Löschen</div>
            <div class="lr" style="margin-bottom:6px">
              <input id="d-search" class="li" placeholder="Name / Adresse enthält…" style="flex:1">
              <select id="d-type-filter" class="li" style="width:140px">
                <option value="">Alle POI-Typen</option>
                ${Object.entries(POI_TYPES).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>
                  `<option value="${id}">${name}</option>`).join('')}
              </select>
            </div>
            <button class="lb p" id="d-load" style="width:100%;padding:7px">📥 POIs laden &amp; filtern</button>
          </div>

          <!-- Vorschau-Tabelle -->
          <div id="d-preview" style="display:none;flex-direction:column;gap:8px">
            <div class="lr" style="justify-content:space-between">
              <span class="ll" style="margin:0" id="d-count"></span>
              <div class="lr" style="gap:5px">
                <button class="lb" id="d-sel-all" style="font-size:11px;padding:3px 8px">Alle</button>
                <button class="lb" id="d-sel-none" style="font-size:11px;padding:3px 8px">Keine</button>
              </div>
            </div>
            <div class="ltw"><table class="lt">
              <thead><tr>
                <th style="width:28px"><input type="checkbox" id="d-chkall"></th>
                <th>Name</th><th>Typ</th><th>Adresse</th>
              </tr></thead>
              <tbody id="d-tbody"></tbody>
            </table></div>
            <div class="ldel"><span>Delay:</span><input id="d-delay" type="number" value="50" min="50" max="5000" step="50"><span>ms</span></div>
            <button class="lb d" id="d-start" style="width:100%;padding:8px;font-weight:600">🗑 Auswahl löschen…</button>
          </div>

          <!-- Bestätigung -->
          <div class="lconf" id="d-conf">
            <div id="d-ctext">Bitte warten…</div>
            <div class="lr" id="d-cbtns" style="display:none">
              <button class="lb d" id="d-exec" style="flex:1;font-weight:600">✓ Ja, löschen</button>
              <button class="lb" id="d-cancel" style="flex:1">Abbrechen</button>
            </div>
          </div>

          <!-- Fortschritt -->
          <div id="d-prog" style="display:none" class="lpw">
            <div class="lpr"><span id="d-pl">0/0</span><span id="d-pp">0%</span></div>
            <div class="lpbg"><div class="lpbf red" id="d-pb"></div></div>
            <div class="lstats">
              <div class="lstat"><div class="sv" id="d-st">0</div><div class="sl">Gesamt</div></div>
              <div class="lstat ok"><div class="sv" id="d-sok">0</div><div class="sl">Gelöscht</div></div>
              <div class="lstat fail"><div class="sv" id="d-sfail">0</div><div class="sl">Fehler</div></div>
            </div>
          </div>
          <div id="d-logs" style="display:none"><div class="ll">Protokoll</div><div class="llog" id="d-log"></div></div>
          <div id="d-err" style="display:none" class="lerr"></div>
        </div>

        <!-- MANUELL TAB -->
        <div class="lpane" id="tab-man">
          <div style="font-size:12px;color:#777;line-height:1.6">
            POI-Typ wählen, dann auf die Karte klicken um den POI zu setzen.
          </div>
          <div>
            <div class="ll">POI-Typ</div>
            <select id="man-type" class="li">
              ${Object.entries(POI_TYPES).sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>
                `<option value="${id}">${name}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="ll">Name (optional)</div>
            <input id="man-name" class="li" placeholder="Wird automatisch aus POI-Typ gesetzt">
          </div>
          <button class="lb p" id="man-start" style="width:100%;padding:8px;font-weight:600">
            📌 Kartenmodus aktivieren
          </button>
          <div id="man-active" style="display:none;background:#d9edf7;border:1px solid #bce8f1;border-left:3px solid #31b0d5;border-radius:4px;padding:8px 12px;font-size:12px;color:#31708f;line-height:1.5">
            <strong>Kartenmodus aktiv</strong> — klicke auf die Karte um einen POI zu setzen.<br>
            <span id="man-active-type" style="font-weight:600"></span>
          </div>
          <div id="man-coords" style="display:none">
            <div class="ll">Gesetzte Koordinaten</div>
            <div class="lr">
              <input id="man-lat" class="li" readonly style="flex:1;background:#f9f9f9">
              <input id="man-lng" class="li" readonly style="flex:1;background:#f9f9f9">
            </div>
          </div>
          <button class="lb s" id="man-save" style="width:100%;padding:8px;font-weight:600;display:none">
            ✓ POI speichern
          </button>
          <button class="lb" id="man-cancel" style="width:100%;padding:5px;display:none">
            Abbrechen
          </button>
          <div id="man-result" style="display:none;margin-top:4px"></div>
          <div id="man-err" style="display:none" class="lerr"></div>
        </div>

      </div>
    `;
    document.body.appendChild(panel);

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════
    let running = false, minimized = false;
    let osmPOIs = [], osmFilt = [];
    let jsonPOIs = [], jsonFilt = [];
    let delPOIs = [];
    let gLat = null, gLon = null, gOsmType = null, gOsmId = null;

    // ─ Tabs ────────────────────────────────────────────────────────────────
    panel.querySelectorAll('.ltab').forEach(t => t.addEventListener('click', () => {
      panel.querySelectorAll('.ltab').forEach(x=>x.classList.remove('on'));
      panel.querySelectorAll('.lpane').forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      document.getElementById('tab-'+t.dataset.tab).classList.add('on');
      if (t.dataset.tab === 'osm') checkPoiLayerWarning();
    }));

    // ─ Header ──────────────────────────────────────────────────────────────
    document.getElementById('lss-min').addEventListener('click', () => {
      const b=document.getElementById('lss-body'), tabs=panel.querySelector('.ltabs');
      minimized=!minimized;
      b.style.display=minimized?'none':''; tabs.style.display=minimized?'none':'';
      panel.style.maxHeight=minimized?'auto':'calc(100vh - 80px)';
      // Mini-Bar nur zeigen wenn minimiert UND ein Vorgang läuft
      g('lss-mini-progress').style.display = (minimized && running) ? 'block' : 'none';
    });
    document.getElementById('lss-close').addEventListener('click', () => panel.remove());

    // Mini-Progressbar im Header aktualisieren
    function updateMiniProgress(done, total, color) {
      const pct = total > 0 ? Math.round(done/total*100) : 0;
      g('lss-mini-label').textContent = `${done} / ${total}`;
      g('lss-mini-pct').textContent = pct + '%';
      g('lss-mini-bar').style.width = pct + '%';
      g('lss-mini-bar').style.background = color || '#337ab7';
      // Nur anzeigen wenn minimiert
      if (minimized) g('lss-mini-progress').style.display = 'block';
    }
    function hideMiniProgress() {
      g('lss-mini-progress').style.display = 'none';
    }

    // Einen einzelnen POI direkt auf die Karte hinzufügen
    // LSS erwartet das Server-Response-Format aus /mission_positions.json
    async function addPoiToMap(poi) {
      try {
        if (typeof map_pois_service === 'undefined' ||
            !map_pois_service.leafletMissionPositionMarkerAdd) return;
        // Server-Response für diesen POI holen (hat id, caption, poi_type, lat, lng etc.)
        const r = await fetch('/mission_positions.json', {
          credentials: 'same-origin',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!r.ok) return;
        const data = await r.json();
        // Den gerade importierten POI anhand Position + Typ finden
        const serverPoi = (data.mission_positions || []).find(p =>
          p.poi_type === poi.poi_type &&
          Math.abs(parseFloat(p.latitude) - poi.latitude) < 0.0001 &&
          Math.abs(parseFloat(p.longitude) - poi.longitude) < 0.0001
        );
        if (serverPoi) {
          map_pois_service.leafletMissionPositionMarkerAdd(serverPoi);
        }
      } catch(e) { /* ignore */ }
    }

    // Alle POIs vom Server neu laden und auf Karte zeichnen
    function refreshMap() {
      setTimeout(async () => {
        try {
          if (typeof map_pois_service === 'undefined' ||
              !map_pois_service.leafletMissionPositionMarkerAdd) return;
          const r = await fetch('/mission_positions.json', {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
          });
          if (!r.ok) return;
          const data = await r.json();
          (data.mission_positions || []).forEach(p => {
            try {
              // Nur hinzufügen wenn noch nicht auf der Karte
              if (typeof mission_position_markers_per_id !== 'undefined' &&
                  mission_position_markers_per_id.has(p.id)) return;
              map_pois_service.leafletMissionPositionMarkerAdd(p);
            } catch(e) {}
          });
        } catch(e) {
          console.warn('[LSS POI Importer] Map-Refresh fehlgeschlagen:', e.message);
        }
      }, 500);
    }

    let dx=0,dy=0;
    document.getElementById('lss-hdr').addEventListener('mousedown', e => {
      if (e.target.tagName==='BUTTON') return;
      dx=e.clientX-panel.getBoundingClientRect().left;
      dy=e.clientY-panel.getBoundingClientRect().top;
      const mv=ev=>{panel.style.right='auto';panel.style.left=(ev.clientX-dx)+'px';panel.style.top=(ev.clientY-dy)+'px';};
      const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });

    // ─ Generics ─────────────────────────────────────────────────────────────
    const g = id => document.getElementById(id);
    const showErr = (id, msg) => { const el=g(id); el.style.display=msg?'block':'none'; el.textContent=msg||''; };
    const addLog = (id, msg, cls) => { const el=g(id); el.innerHTML+=`<span class="${cls}">${msg}</span><br>`; el.scrollTop=99999; };

    // POI-Ebene prüfen und Warnbanner anzeigen (nach g-Definition)
    function checkPoiLayerWarning() {
      const banner = g('o-poi-layer-warn');
      if (!banner) return;
      try {
        if (typeof map_filters_service !== 'undefined') {
          const layers = map_filters_service.getMapFiltersLayers?.();
          const poisLayer = layers?.pois;
          if (poisLayer && poisLayer.isHidden && poisLayer.isHidden()) {
            banner.style.display = 'block';
            return;
          }
        }
      } catch(e) {}
      banner.style.display = 'none';
    }
    // Direkt beim Öffnen prüfen
    checkPoiLayerWarning();

    // Haversine-Distanz in Metern
    function haversineM(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2-lat1) * Math.PI/180;
      const dLon = (lon2-lon1) * Math.PI/180;
      const a = Math.sin(dLat/2)**2 +
                Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Vorhandene LSS-POIs (gecacht, wird beim ersten Check geladen)
    let existingPOIs = null;
    let existingPOIsLoading = false;
    let existingPOIsLimitReached = false;

    async function getExistingPOIs(warnErrId) {
      if (existingPOIs !== null) return existingPOIs;
      if (existingPOIsLoading) {
        while (existingPOIsLoading) await sleep(100);
        return existingPOIs;
      }
      existingPOIsLoading = true;
      try {
        const result = await fetchAllPOIs();
        existingPOIs = result.pois;
        existingPOIsLimitReached = result.limitReached;
        if (result.limitReached && warnErrId) {
          showErr(warnErrId,
            '⚠ Es wurden exakt 10.000 POIs geladen – möglicherweise existieren weitere. ' +
            'Der Duplikat-Filter ist eventuell unvollständig.'
          );
        }
      } catch(e) {
        existingPOIs = null; // nicht als leer cachen — nächster Versuch soll neu laden
        existingPOIsLimitReached = false;
        existingPOIsLoading = false;
        throw e; // Fehler weitergeben damit der Aufrufer blockieren kann
      }
      existingPOIsLoading = false;
      return existingPOIs;
    }

    // Prüft ob ein POI bereits existiert (gleicher Typ + innerhalb radiusM)
    function isDuplicate(poi, existing, radiusM) {
      return existing.some(e =>
        e.poi_type === poi.poi_type &&
        haversineM(poi.latitude, poi.longitude, parseFloat(e.latitude), parseFloat(e.longitude)) <= radiusM
      );
    }

    async function markDuplicates(arr, radiusM, warnErrId) {
      // Fehler (leere Liste, Filter aktiv, 10k-Limit) werden weitergegeben
      const existing = await getExistingPOIs(warnErrId);
      arr.forEach(p => { p.duplicate = isDuplicate(p, existing, radiusM); });
    }

    function buildTypeFilter(arr, selId) {
      const types=[...new Set(arr.map(p=>p.poi_type))].sort((a,b)=>a-b);
      g(selId).innerHTML='<option value="">Alle Typen</option>'+
        types.map(t=>`<option value="${t}">${POI_TYPES[t]||'Typ '+t}</option>`).join('');
    }

    function renderTable(all, filt, ids) {
      const {tbody,count,fsel,chkall} = ids;
      const tf = g(fsel).value;
      filt.length=0;
      (tf?all.filter(p=>p.poi_type==tf):all).forEach(p=>filt.push(p));
      g(tbody).innerHTML = filt.map(p=>`
        <tr style="${p.duplicate?'opacity:.55':''}">
          <td><input type="checkbox" data-i="${p.idx}" ${p.checked?'checked':''}></td>
          <td class="e" title="${p.caption}">${p.caption}</td>
          <td class="e m" title="${POI_TYPES[p.poi_type]||'?'}" style="font-size:11px">${POI_TYPES[p.poi_type]||'Typ '+p.poi_type}</td>
          <td class="m">${(+p.latitude).toFixed(4)}</td>
          <td class="m">${(+p.longitude).toFixed(4)}</td>
          <td style="text-align:center" title="${p.duplicate?'Bereits vorhanden':''}">${p.duplicate?'🟡':''}</td>
        </tr>`).join('');
      g(tbody).querySelectorAll('input[type=checkbox]').forEach(c=>c.addEventListener('change',e=>{
        all.find(p=>p.idx==e.target.dataset.i).checked=e.target.checked;
        updateCount(all,filt,count);
      }));
      updateCount(all,filt,count);
    }

    function updateCount(all,filt,cid) {
      const sel = filt.filter(p=>p.checked).length;
      const dups = filt.filter(p=>p.duplicate).length;
      let txt = `${filt.length} POIs · ${sel} ausgewählt`;
      if (dups > 0) txt += ` · <span style="color:#8a6d3b">🟡 ${dups} bereits vorhanden</span>`;
      g(cid).innerHTML = txt;
    }

    async function runImport(list, delayMs, I) {
      g(I.prog).style.display='block'; g(I.logs).style.display='block';
      g(I.log).innerHTML='';
      const token=getCsrfToken();
      let ok=0, fail=0, skipped=0;
      const total=list.length;
      const stats=()=>{
        const done=ok+fail+skipped, pct=Math.round(done/total*100);
        g(I.pl).textContent=`${done}/${total}`; g(I.pp).textContent=pct+'%';
        g(I.pb).style.width=pct+'%';
        g(I.st).textContent=total; g(I.sok).textContent=ok; g(I.sfail).textContent=fail;
        updateMiniProgress(done, total, '#337ab7');
      };
      addLog(I.log,`▶ Starte Import: ${total} POIs`,'linfo');
      if (skipped > 0) addLog(I.log, `⏭ ${skipped} bereits vorhanden`, 'lwarn');
      for (let i=0;i<list.length;i++) {
        const p=list[i]; stats();
        if (p.duplicate) {
          skipped++;
          addLog(I.log,`⏭ [${i+1}/${total}] ${p.caption} – bereits vorhanden`,'lwarn');
          stats(); continue;
        }
        try {
          if (await createPOI(p,token)) {
            ok++;
            if (existingPOIs) existingPOIs.push({poi_type:p.poi_type, latitude:p.latitude, longitude:p.longitude});
            addLog(I.log,`✓ [${i+1}/${total}] ${p.caption}`,'lok');
          }
          else { fail++; addLog(I.log,`✗ [${i+1}/${total}] ${p.caption} – Fehler`,'lfail'); }
        } catch(e) { fail++; addLog(I.log,`✗ [${i+1}/${total}] ${p.caption} – ${e.message}`,'lfail'); }
        stats();
        if (i<list.length-1) await sleep(delayMs);
      }
      const skipTxt = skipped > 0 ? `, ${skipped} übersprungen` : '';
      addLog(I.log,`■ Fertig: ${ok} OK, ${fail} Fehler${skipTxt}`,'linfo');
      g(I.btn).disabled=false; g(I.btn).textContent='⬆ Auswahl importieren';
      hideMiniProgress();
      if (ok > 0) refreshMap();
      running=false;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OSM TAB
    // ═══════════════════════════════════════════════════════════════════════
    try {

    g('o-geo-btn')?.addEventListener('click', async () => {
      const addr=g('o-addr').value.trim(); if(!addr) return;
      g('o-geo-btn').disabled=true; g('o-geo-btn').textContent='⏳';
      showErr('o-err','');
      try {
        const geo=await geocode(addr);
        gLat=geo.lat; gLon=geo.lon; gOsmType=geo.osm_type; gOsmId=geo.osm_id;
        // Zeige Koordinaten nur im Umkreis-Modus
        if (searchMode==='radius') g('o-coords').value=`${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`;
        g('o-geo-info').style.display='block';
        const typeLabel = geo.osm_type==='relation' ? '🗺 Gebiet' : geo.osm_type==='way' ? '〰 Weg' : '📍 Punkt';
        g('o-geo-info').textContent=`${typeLabel} · ${geo.display.split(',').slice(0,3).join(', ')}`;
        // Punkt: direktes Hinzufügen als POI anbieten
        g('o-point-add').style.display = geo.osm_type === 'node' ? 'block' : 'none';
      } catch(e) { showErr('o-err',e.message); }
      g('o-geo-btn').disabled=false; g('o-geo-btn').textContent='📍';
    });

    // ── Modus-Umschalter ────────────────────────────────────────────────────
    let searchMode = 'area'; // 'area' | 'radius'
    function setMode(mode) {
      searchMode = mode;
      const aBtn = g('o-mode-area'), rBtn = g('o-mode-radius');
      const rRow = g('o-radius-row');
      if (mode === 'area') {
        aBtn.style.cssText += ';background:#337ab7;border-color:#2e6da4;color:#fff;font-weight:600';
        rBtn.style.cssText += ';background:#fff;border-color:#ccc;color:#333;font-weight:400';
        rRow.style.display = 'none';
      } else {
        rBtn.style.cssText += ';background:#337ab7;border-color:#2e6da4;color:#fff;font-weight:600';
        aBtn.style.cssText += ';background:#fff;border-color:#ccc;color:#333;font-weight:400';
        rRow.style.display = 'flex';
        g('o-point-add').style.display = 'none'; // Punkt-Add im Umkreis-Modus nicht relevant
      }
    }
    g('o-mode-area').addEventListener('click', () => setMode('area'));
    g('o-mode-radius').addEventListener('click', () => setMode('radius'));

    // 10k-Limit Override-Checkbox
    document.addEventListener('change', e => {
      if (e.target.id === 'o-dup-limit-override') {
        g('o-import').disabled = !e.target.checked;
      }
    });

    g('o-all').addEventListener('click',e=>{e.preventDefault();panel.querySelectorAll('#o-types input').forEach(c=>c.checked=true);});
    g('o-none').addEventListener('click',e=>{e.preventDefault();panel.querySelectorAll('#o-types input').forEach(c=>c.checked=false);});

    // Direktes Hinzufügen eines geocodierten Punktes als POI
    g('o-point-add-btn').addEventListener('click', async () => {
      if (!gLat || !gLon) { showErr('o-err','Bitte zuerst eine Adresse geocodieren.'); return; }
      const poiType = parseInt(g('o-point-type').value);
      const name = g('o-addr').value.trim() || POI_TYPES[poiType] || '';
      const btn = g('o-point-add-btn');
      btn.disabled = true; btn.textContent = '⏳';
      showErr('o-err','');
      try {
        const poi = { caption: name, latitude: gLat, longitude: gLon, poi_type: poiType, address: '' };
        const ok = await createPOI(poi, getCsrfToken());
        if (ok) {
          // Auf Karte hinzufügen
          const r = await fetch('/mission_positions.json', { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (r.ok) {
            const data = await r.json();
            const sp = (data.mission_positions || []).find(p =>
              p.poi_type === poiType &&
              Math.abs(parseFloat(p.latitude) - gLat) < 0.0001 &&
              Math.abs(parseFloat(p.longitude) - gLon) < 0.0001
            );
            if (sp && typeof map_pois_service !== 'undefined') {
              try { map_pois_service.leafletMissionPositionMarkerAdd(sp); } catch(e) {}
            }
          }
          if (existingPOIs) existingPOIs.push({ poi_type: poiType, latitude: gLat, longitude: gLon });
          g('o-geo-info').textContent = `✓ ${name} als „${POI_TYPES[poiType]}" gespeichert`;
          g('o-geo-info').style.display = 'block';
          g('o-point-add').style.display = 'none';
        } else {
          showErr('o-err','Fehler beim Speichern.');
        }
      } catch(e) { showErr('o-err','Fehler: '+e.message); }
      btn.disabled = false; btn.textContent = '+ Hinzufügen';
    });

    g('o-search').addEventListener('click', async () => {
      if (running) return;
      showErr('o-err','');

      const selTypes=[...panel.querySelectorAll('#o-types input:checked')].map(c=>parseInt(c.dataset.t));
      if (!selTypes.length) { showErr('o-err','Mindestens einen POI-Typ auswählen.'); return; }

      const numBatches = Math.ceil(buildFilters(selTypes).length / BATCH_SIZE);
      // Warnung bei sehr vielen Typen
      if (numBatches > 5) {
        showErr('o-err', `⚠ ${selTypes.length} Typen ausgewählt (${numBatches} Abfragen). Bei Timeout bitte weniger Typen wählen.`);
        // Kein return – trotzdem versuchen
      } else {
        showErr('o-err','');
      }

      const btn=g('o-search'); btn.disabled=true;
      const updateBtn = numBatches > 1
        ? (i) => { btn.textContent = `⏳ Abfrage ${i}/${numBatches}…`; }
        : () => { btn.textContent = '⏳ Abfrage läuft…'; };
      updateBtn(1);
      running=true;

      try {
        let data;

        if (searchMode === 'area') {
          // Brauchen OSM-Typ und ID – ggf. jetzt geocodieren
          if (!gOsmType || !gOsmId) {
            const addr=g('o-addr').value.trim();
            if (!addr) { showErr('o-err','Bitte einen Ort eingeben und mit 📍 geocodieren.'); btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return; }
            const geo=await geocode(addr);
            gLat=geo.lat; gLon=geo.lon; gOsmType=geo.osm_type; gOsmId=geo.osm_id;
            g('o-geo-info').style.display='block';
            g('o-geo-info').textContent='📌 '+geo.display.split(',').slice(0,3).join(', ');
          }
          if (gOsmType==='node') {
            showErr('o-err','Dieser Ort ist in OSM nur ein Punkt (kein Gebiet). Bitte Umkreis-Modus verwenden oder einen Ort/eine Gemeinde suchen.');
            btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return;
          }
          data=await overpassAreaQuery(gOsmType, gOsmId, selTypes, updateBtn);

        } else {
          // Radius-Modus
          let lat,lon;
          const cv=g('o-coords').value.trim();
          if (cv) { const p=cv.split(/[\s,]+/); lat=parseFloat(p[0]); lon=parseFloat(p[1]); }
          else if (gLat!==null) { lat=gLat; lon=gLon; }
          else {
            const addr=g('o-addr').value.trim();
            if (!addr) { showErr('o-err','Adresse oder Koordinaten eingeben.'); btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return; }
            const geo=await geocode(addr);
            lat=geo.lat; lon=geo.lon; gLat=lat; gLon=lon; gOsmType=geo.osm_type; gOsmId=geo.osm_id;
          }
          if (isNaN(lat)||isNaN(lon)) { showErr('o-err','Ungültige Koordinaten.'); btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return; }
          const radius=Math.max(500, parseInt(g('o-radius').value)||5000);
          data=await overpassQuery(lat, lon, radius, selTypes, updateBtn);
        }
        const seen=new Set();
        const raw=[];
        for (const el of (data.elements||[])) {
          if (seen.has(el.type+el.id)) continue;
          seen.add(el.type+el.id);
          const tags=el.tags||{};
          const type=osmToLssType(tags);
          if (type===null||!selTypes.includes(type)) continue;
          const coords=osmCoords(el); if (!coords) continue;

          // ── Größenfilter für Flächen-POIs ────────────────────────────
          // Wald (3), See (1), Moor (53), Park (0): nur echte Flächen,
          // keine einzelnen Nodes (Pfützen, Baumgruppen).
          // Für ways/relations: Bounding-Box muss Mindestgröße haben.
          const AREA_TYPES = new Set([0, 1, 3, 53]);
          if (AREA_TYPES.has(type)) {
            // Nodes komplett ignorieren (kein Flächenobjekt)
            if (el.type === 'node') continue;
            // Bounding-Box-Größe prüfen (in Grad)
            if (el.bounds) {
              const dLat = el.bounds.maxlat - el.bounds.minlat;
              const dLon = el.bounds.maxlon - el.bounds.minlon;
              // ~111km/Grad → 0.002° ≈ 220m Mindestausdehnung
              // See/Wald: mind. 0.002° in beiden Achsen (ca. 4–5 ha Minimum)
              const MIN_DEG = type === 3 ? 0.003 : 0.002; // Wald etwas größer
              if (dLat < MIN_DEG && dLon < MIN_DEG) continue;
            }
          }

          const name=osmName(tags)||`${POI_TYPES[type]} (OSM ${el.id})`;
          raw.push({idx:raw.length,checked:true,caption:name,
            latitude:coords.lat,longitude:coords.lon,
            poi_type:type,address:osmAddress(tags)});
        }
        if (!raw.length) { showErr('o-err','Keine passenden POIs gefunden.'); btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return; }

        // ── De-Duplikation ───────────────────────────────────────────────
        // Gleicher POI-Typ + Position auf ~100m gerundet → nur einen behalten.
        // OSM enthält dieselbe Schule oft als node UND als way/relation.
        const dedupSeen = new Set();
        const deduped = [];
        for (const p of raw) {
          // 3 Dezimalstellen ≈ 111m Genauigkeit
          const key = `${p.poi_type}_${p.latitude.toFixed(3)}_${p.longitude.toFixed(3)}`;
          if (dedupSeen.has(key)) continue;
          dedupSeen.add(key);
          deduped.push(p);
        }
        // Indizes neu vergeben
        deduped.forEach((p,i) => p.idx=i);
        const dupCount = raw.length - deduped.length;

        // ── Duplikat-Check gegen vorhandene LSS-POIs ─────────────────────
        btn.textContent = '⏳ Prüfe vorhandene POIs…';
        const dupRadius = Math.max(10, parseInt(g('o-dup-radius').value) || 100);
        try {
          await markDuplicates(deduped, dupRadius, 'o-err');
        } catch(dupErr) {
          if (dupErr.isEmpty) {
            // Leere Liste: könnte neuer Account sein → Warnung mit Weiter-Option
            showErr('o-err',
              '⚠ Keine vorhandenen POIs geladen. POI-Ebene aktiv?\n' +
              'Falls du noch keine POIs hast, kannst du trotzdem importieren.'
            );
            // Tabelle trotzdem anzeigen, aber alle als nicht-Duplikat markieren
            deduped.forEach(p => { p.duplicate = false; p.checked = true; });
            existingPOIsLimitReached = false;
          } else {
            // Echter Fehler (Filter aktiv etc.) → blockieren
            showErr('o-err', '🚫 ' + dupErr.message);
            btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false; return;
          }
        }
        // Duplikate standardmäßig abwählen
        deduped.forEach(p => { if (p.duplicate) p.checked = false; });
        const serverDupCount = deduped.filter(p=>p.duplicate).length;

        // 10k-Limit: Import sperren bis Nutzer bestätigt
        const importBtn = g('o-import');
        if (existingPOIsLimitReached) {
          importBtn.disabled = true;
          g('o-dup-limit-warn').style.display = 'block';
          g('o-dup-limit-override').checked = false;
        } else {
          importBtn.disabled = false;
          g('o-dup-limit-warn').style.display = 'none';
        }

        osmPOIs=deduped; osmFilt=[];
        buildTypeFilter(osmPOIs,'o-fsel');
        renderTable(osmPOIs,osmFilt,{tbody:'o-tbody',count:'o-count',fsel:'o-fsel',chkall:'o-chkall'});
        g('o-res').style.display='flex';
        g('o-prog').style.display='none'; g('o-logs').style.display='none'; g('o-log').innerHTML='';
        let infoText = `✓ ${deduped.length} POIs gefunden`;
        if (dupCount > 0) infoText += ` (${dupCount} OSM-Duplikat${dupCount>1?'e':''} entfernt)`;
        if (serverDupCount > 0) infoText += ` · 🟡 ${serverDupCount} bereits im Spiel`;
        g('o-geo-info').style.display='block';
        g('o-geo-info').textContent=infoText;
      } catch(e) { showErr('o-err',e.message); }
      btn.disabled=false; btn.textContent='🔍 OSM abfragen'; running=false;
    });

    g('o-fsel').addEventListener('change',()=>renderTable(osmPOIs,osmFilt,{tbody:'o-tbody',count:'o-count',fsel:'o-fsel',chkall:'o-chkall'}));
    g('o-tall').addEventListener('click',()=>{osmPOIs.forEach(p=>p.checked=true);g('o-chkall').checked=true;renderTable(osmPOIs,osmFilt,{tbody:'o-tbody',count:'o-count',fsel:'o-fsel',chkall:'o-chkall'});});
    g('o-tnone').addEventListener('click',()=>{osmPOIs.forEach(p=>p.checked=false);g('o-chkall').checked=false;renderTable(osmPOIs,osmFilt,{tbody:'o-tbody',count:'o-count',fsel:'o-fsel',chkall:'o-chkall'});});
    g('o-chkall').addEventListener('change',e=>{osmFilt.forEach(p=>p.checked=e.target.checked);renderTable(osmPOIs,osmFilt,{tbody:'o-tbody',count:'o-count',fsel:'o-fsel',chkall:'o-chkall'});});

    g('o-import').addEventListener('click', async () => {
      if (running) return;
      const list=osmPOIs.filter(p=>p.checked);
      if (!list.length) { showErr('o-err','Keine POIs ausgewählt.'); return; }
      running=true; showErr('o-err','');
      const btn=g('o-import'); btn.disabled=true; btn.textContent='⏳ Importiere…';
      await runImport(list, Math.max(100,parseInt(g('o-delay').value)||400),
        {prog:'o-prog',pl:'o-pl',pp:'o-pp',pb:'o-pb',st:'o-st',sok:'o-sok',sfail:'o-sfail',logs:'o-logs',log:'o-log',btn:'o-import'});
    });

    } catch(osmInitErr) {
      console.error('[LSS POI Importer] OSM-Tab Initialisierungsfehler:', osmInitErr);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // JSON TAB
    // ═══════════════════════════════════════════════════════════════════════
    const dz=g('j-dz'), fi=g('j-fi');
    dz.addEventListener('click',()=>fi.click());
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('ov');});
    dz.addEventListener('dragleave',()=>dz.classList.remove('ov'));
    dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('ov');if(e.dataTransfer.files[0])readFile(e.dataTransfer.files[0]);});
    fi.addEventListener('change',e=>{if(e.target.files[0])readFile(e.target.files[0]);});

    function readFile(f) {
      const r=new FileReader();
      r.onload=ev=>{g('j-ta').value=ev.target.result;parseJson(ev.target.result);};
      r.readAsText(f);
    }

    async function parseJson(str) {
      showErr('j-err','');
      let d; try{d=JSON.parse(str);}catch(e){showErr('j-err','JSON-Fehler: '+e.message);return;}
      const items=Array.isArray(d)?d:d.mission_positions||d.pois||null;
      if(!items){showErr('j-err','Unbekanntes Format.');return;}
      if(!items.length){showErr('j-err','Keine POIs gefunden.');return;}
      jsonPOIs=items.map((p,i)=>({idx:i,checked:true,caption:p.caption||p.name||'POI #'+i,
        latitude:p.latitude,longitude:p.longitude,poi_type:p.poi_type!=null?+p.poi_type:0,address:p.address||''}));

      // Duplikat-Check
      const dupRadius = Math.max(10, parseInt(g('j-dup-radius').value) || 100);
      await markDuplicates(jsonPOIs, dupRadius, 'j-err');
      jsonPOIs.forEach(p => { if (p.duplicate) p.checked = false; });

      jsonFilt=[];
      buildTypeFilter(jsonPOIs,'j-fsel');
      renderTable(jsonPOIs,jsonFilt,{tbody:'j-tbody',count:'j-count',fsel:'j-fsel',chkall:'j-chkall'});
      g('j-res').style.display='flex';
      g('j-prog').style.display='none'; g('j-logs').style.display='none';
    }

    g('j-parse').addEventListener('click',()=>parseJson(g('j-ta').value.trim()));
    g('j-clear').addEventListener('click',()=>{jsonPOIs=[];jsonFilt=[];g('j-ta').value='';g('j-res').style.display='none';showErr('j-err','');});
    g('j-fsel').addEventListener('change',()=>renderTable(jsonPOIs,jsonFilt,{tbody:'j-tbody',count:'j-count',fsel:'j-fsel',chkall:'j-chkall'}));
    g('j-tall').addEventListener('click',()=>{jsonPOIs.forEach(p=>p.checked=true);g('j-chkall').checked=true;renderTable(jsonPOIs,jsonFilt,{tbody:'j-tbody',count:'j-count',fsel:'j-fsel',chkall:'j-chkall'});});
    g('j-tnone').addEventListener('click',()=>{jsonPOIs.forEach(p=>p.checked=false);g('j-chkall').checked=false;renderTable(jsonPOIs,jsonFilt,{tbody:'j-tbody',count:'j-count',fsel:'j-fsel',chkall:'j-chkall'});});
    g('j-chkall').addEventListener('change',e=>{jsonFilt.forEach(p=>p.checked=e.target.checked);renderTable(jsonPOIs,jsonFilt,{tbody:'j-tbody',count:'j-count',fsel:'j-fsel',chkall:'j-chkall'});});
    g('j-import').addEventListener('click', async()=>{
      if(running) return;
      const list=jsonPOIs.filter(p=>p.checked);
      if(!list.length){showErr('j-err','Keine POIs ausgewählt.');return;}
      running=true; showErr('j-err','');
      const btn=g('j-import'); btn.disabled=true; btn.textContent='⏳ Importiere…';
      await runImport(list,Math.max(50,parseInt(g('j-delay').value)||400),
        {prog:'j-prog',pl:'j-pl',pp:'j-pp',pb:'j-pb',st:'j-st',sok:'j-sok',sfail:'j-sfail',logs:'j-logs',log:'j-log',btn:'j-import'});
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DEL TAB
    // ═══════════════════════════════════════════════════════════════════════
    let allServerPOIs = [];
    let delFiltered = [];
    let dupPOIs = []; // gefundene Duplikat-Paare zum Löschen

    // ── Duplikat-Check ───────────────────────────────────────────────────
    g('d-dup-check').addEventListener('click', async () => {
      if (running) return;
      showErr('d-err','');
      const btn = g('d-dup-check');
      btn.disabled = true; btn.textContent = '⏳ Lade POIs…';
      existingPOIs = null; existingPOIsLimitReached = false; // immer frisch laden

      try {
        const all = await getExistingPOIs('d-err');
        const radius = Math.max(10, parseInt(g('d-dup-radius').value) || 100);
        btn.textContent = '⏳ Prüfe Duplikate…';

        // Für jeden POI prüfen ob ein anderer POI desselben Typs näher als radius ist
        // Wir markieren immer den mit der höheren ID als Duplikat (der neuere)
        const toDelete = []; // {poi, nearPoi, dist}
        const processed = new Set();

        for (let i = 0; i < all.length; i++) {
          if (processed.has(all[i].id)) continue;
          for (let j = i + 1; j < all.length; j++) {
            if (all[i].poi_type !== all[j].poi_type) continue;
            const dist = haversineM(
              parseFloat(all[i].latitude), parseFloat(all[i].longitude),
              parseFloat(all[j].latitude), parseFloat(all[j].longitude)
            );
            if (dist <= radius) {
              // Neueren (höhere ID) zum Löschen vorschlagen
              const newer = all[i].id > all[j].id ? all[i] : all[j];
              const older = all[i].id > all[j].id ? all[j] : all[i];
              if (!processed.has(newer.id)) {
                toDelete.push({ poi: newer, nearPoi: older, dist: Math.round(dist) });
                processed.add(newer.id);
              }
            }
          }
        }

        dupPOIs = toDelete;
        const tbody = g('d-dup-tbody');

        if (!toDelete.length) {
          g('d-dup-summary').innerHTML = '✅ Keine Duplikate gefunden.';
          g('d-dup-wrap').style.display = 'none';
          g('d-dup-result').style.display = 'flex';
        } else {
          g('d-dup-summary').innerHTML =
            `🟡 <strong>${toDelete.length} mögliche Duplikate</strong> gefunden (Radius: ${radius}m). ` +
            `Der neuere POI jedes Paares ist vorausgewählt.`;
          tbody.innerHTML = toDelete.map((item, idx) => `
            <tr>
              <td><input type="checkbox" data-di="${idx}" checked></td>
              <td class="e" title="${item.poi.caption||''}">${item.poi.caption||'–'}</td>
              <td class="e m" style="font-size:11px">${POI_TYPES[item.poi.poi_type]||'Typ '+item.poi.poi_type}</td>
              <td class="e m" style="font-size:11px" title="Nahe: ${item.nearPoi.caption||''}">${item.poi.address||'–'}</td>
              <td style="text-align:center;font-size:11px;color:#777">${item.dist}m</td>
            </tr>`).join('');
          tbody.querySelectorAll('input[type=checkbox]').forEach(chk => {
            chk.addEventListener('change', () => updateDupCount());
          });
          g('d-dup-wrap').style.display = 'block';
          g('d-dup-result').style.display = 'flex';
          updateDupCount();
        }
      } catch(e) { showErr('d-err', 'Fehler: ' + e.message); }
      btn.disabled = false; btn.textContent = '🔍 Duplikate prüfen';
    });

    function updateDupCount() {
      const checked = g('d-dup-tbody').querySelectorAll('input:checked').length;
      g('d-dup-summary').querySelector('strong').textContent =
        `${checked} von ${dupPOIs.length} möglichen Duplikaten ausgewählt`;
    }

    g('d-dup-chkall').addEventListener('change', e => {
      g('d-dup-tbody').querySelectorAll('input[type=checkbox]').forEach(c => c.checked = e.target.checked);
      updateDupCount();
    });
    g('d-dup-sel-all').addEventListener('click', () => {
      g('d-dup-tbody').querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true);
      g('d-dup-chkall').checked = true; updateDupCount();
    });
    g('d-dup-sel-none').addEventListener('click', () => {
      g('d-dup-tbody').querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
      g('d-dup-chkall').checked = false; updateDupCount();
    });

    g('d-dup-delete').addEventListener('click', () => {
      if (running) return;
      const checked = [...g('d-dup-tbody').querySelectorAll('input:checked')];
      const toDelete = checked.map(c => dupPOIs[parseInt(c.dataset.di)].poi);
      if (!toDelete.length) { showErr('d-err', 'Keine Duplikate ausgewählt.'); return; }
      showErr('d-err','');
      // Nutze normalen Lösch-Workflow über delPOIs + Bestätigung
      delPOIs = toDelete;
      g('d-conf').classList.add('on');
      g('d-ctext').textContent = `${toDelete.length} Duplikate werden unwiderruflich gelöscht. Fortfahren?`;
      g('d-cbtns').style.display = 'flex';
    });

    function renderDelTable() {
      const search = g('d-search').value.trim().toLowerCase();
      const typeFilter = g('d-type-filter').value;
      delFiltered = allServerPOIs.filter(p => {
        if (typeFilter && p.poi_type != typeFilter) return false;
        if (search) {
          const haystack = ((p.caption||'') + ' ' + (p.address||'')).toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });
      const tbody = g('d-tbody');
      tbody.innerHTML = delFiltered.map(p => `
        <tr>
          <td><input type="checkbox" data-id="${p.id}" ${p._checked!==false?'checked':''}></td>
          <td class="e" title="${p.caption||''}">${p.caption||'–'}</td>
          <td class="e m" style="font-size:11px" title="${POI_TYPES[p.poi_type]||''}">${POI_TYPES[p.poi_type]||'Typ '+p.poi_type}</td>
          <td class="e m" style="font-size:11px" title="${p.address||''}">${p.address||'–'}</td>
        </tr>`).join('');
      tbody.querySelectorAll('input[type=checkbox]').forEach(chk => {
        chk.addEventListener('change', e => {
          const id = parseInt(e.target.dataset.id);
          const p = allServerPOIs.find(x => x.id === id);
          if (p) p._checked = e.target.checked;
          updateDelCount();
        });
      });
      updateDelCount();
    }

    function updateDelCount() {
      const sel = delFiltered.filter(p => p._checked !== false).length;
      g('d-count').textContent = `${delFiltered.length} POIs · ${sel} ausgewählt`;
    }

    g('d-load').addEventListener('click', async () => {
      if (running) return;
      showErr('d-err','');
      g('d-load').disabled = true;
      g('d-load').textContent = '⏳ Lade…';
      try {
        const result = await fetchAllPOIs();
        allServerPOIs = result.pois;
        allServerPOIs.forEach(p => p._checked = true);
        if (!allServerPOIs.length) { showErr('d-err','Keine POIs auf dem Server gefunden.\nTipp: POI-Ebene in den Kartenfiltern aktivieren!'); g('d-load').disabled=false; g('d-load').textContent='📥 POIs laden & filtern'; return; }
        if (result.limitReached) showErr('d-err',
          '⚠ Es wurden exakt 10.000 POIs geladen – möglicherweise sind weitere vorhanden. ' +
          'Duplikat-Filter und Löschfunktion sind eventuell unvollständig.'
        );
        renderDelTable();
        g('d-preview').style.display = 'flex';
        g('d-conf').classList.remove('on');
        g('d-prog').style.display = 'none';
        g('d-logs').style.display = 'none';
      } catch(e) { showErr('d-err','Fehler: '+e.message); }
      g('d-load').disabled = false;
      g('d-load').textContent = '📥 POIs laden & filtern';
    });

    g('d-search').addEventListener('input', renderDelTable);
    g('d-type-filter').addEventListener('change', renderDelTable);

    g('d-sel-all').addEventListener('click', () => {
      delFiltered.forEach(p => p._checked = true);
      g('d-chkall').checked = true;
      renderDelTable();
    });
    g('d-sel-none').addEventListener('click', () => {
      delFiltered.forEach(p => p._checked = false);
      g('d-chkall').checked = false;
      renderDelTable();
    });
    g('d-chkall').addEventListener('change', e => {
      delFiltered.forEach(p => p._checked = e.target.checked);
      renderDelTable();
    });

    g('d-start').addEventListener('click', () => {
      if (running) return;
      delPOIs = delFiltered.filter(p => p._checked !== false);
      if (!delPOIs.length) { showErr('d-err','Keine POIs ausgewählt.'); return; }
      showErr('d-err','');
      g('d-conf').classList.add('on');
      g('d-ctext').textContent = `${delPOIs.length} POIs werden unwiderruflich gelöscht. Fortfahren?`;
      g('d-cbtns').style.display = 'flex';
    });

    g('d-cancel').addEventListener('click', () => {
      delPOIs = [];
      g('d-conf').classList.remove('on');
      g('d-cbtns').style.display = 'none';
    });

    g('d-exec').addEventListener('click', async () => {
      if (running || !delPOIs.length) return;
      running = true;
      g('d-conf').classList.remove('on');
      g('d-start').disabled = true;
      g('d-prog').style.display = 'block';
      g('d-logs').style.display = 'block';
      g('d-log').innerHTML = '';
      const token = getCsrfToken(), total = delPOIs.length;
      const delay = Math.max(50, parseInt(g('d-delay').value) || 50);
      let ok = 0, fail = 0;
      const stats = () => {
        const done=ok+fail, pct=Math.round(done/total*100);
        g('d-pl').textContent=`${done}/${total}`; g('d-pp').textContent=pct+'%';
        g('d-pb').style.width=pct+'%';
        g('d-st').textContent=total; g('d-sok').textContent=ok; g('d-sfail').textContent=fail;
        updateMiniProgress(done, total, '#d9534f');
      };
      addLog('d-log',`▶ Lösche ${total} POIs…`,'linfo'); stats();
      for (let i = 0; i < delPOIs.length; i++) {
        const p = delPOIs[i];
        try {
          if (await deletePOI(p.id, token)) {
            ok++;
            addLog('d-log',`✓ [${i+1}/${total}] ${p.caption||'ID '+p.id}`,'lok');
            allServerPOIs = allServerPOIs.filter(x => x.id !== p.id);
          } else {
            fail++;
            addLog('d-log',`✗ [${i+1}/${total}] ${p.caption||'ID '+p.id} – Fehler`,'lfail');
          }
        } catch(e) { fail++; addLog('d-log',`✗ [${i+1}/${total}] – ${e.message}`,'lfail'); }
        stats();
        if (i < delPOIs.length-1) await sleep(delay);
      }
      addLog('d-log',`■ Fertig: ${ok} gelöscht, ${fail} Fehler`,'linfo');
      delPOIs = []; running = false;
      existingPOIs = null; existingPOIsLimitReached = false;
      hideMiniProgress();
      if (ok > 0) refreshMap();
      g('d-start').disabled = false;
      renderDelTable();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // MANUELL TAB
    // ═══════════════════════════════════════════════════════════════════════
    let manActive = false;
    let manMarker = null;
    let manClickHandler = null;

    function manDeactivate() {
      manActive = false;
      // Kartenklick-Handler entfernen
      if (manClickHandler && typeof map !== 'undefined') {
        map.off('click', manClickHandler);
        manClickHandler = null;
      }
      // Temporären Marker entfernen
      if (manMarker && typeof map !== 'undefined') {
        map.removeLayer(manMarker);
        manMarker = null;
      }
      // Cursor zurücksetzen
      document.getElementById('map')?.style && (document.getElementById('map').style.cursor = '');
      g('man-start').style.display = '';
      g('man-active').style.display = 'none';
      g('man-coords').style.display = 'none';
      g('man-save').style.display = 'none';
      g('man-cancel').style.display = 'none';
      g('man-lat').value = '';
      g('man-lng').value = '';
    }

    g('man-start').addEventListener('click', () => {
      if (typeof map === 'undefined') {
        showErr('man-err', 'Karte nicht gefunden. Bitte auf der Kartenansicht öffnen.');
        return;
      }
      showErr('man-err', '');
      manActive = true;
      const typeName = POI_TYPES[g('man-type').value] || '';
      g('man-active').style.display = 'block';
      g('man-active-type').textContent = typeName;
      g('man-start').style.display = 'none';
      g('man-cancel').style.display = '';
      // Cursor auf Fadenkreuz
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.cursor = 'crosshair';

      manClickHandler = (e) => {
        if (!manActive) return;
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        // Koordinaten anzeigen
        g('man-lat').value = lat.toFixed(6);
        g('man-lng').value = lng.toFixed(6);
        g('man-coords').style.display = 'block';
        g('man-save').style.display = '';
        // Vorherigen Marker entfernen
        if (manMarker) map.removeLayer(manMarker);
        // Temporären Marker setzen
        if (typeof L !== 'undefined') {
          manMarker = L.marker([lat, lng]).addTo(map);
        }
      };
      map.on('click', manClickHandler);
    });

    g('man-cancel').addEventListener('click', () => {
      showErr('man-err', '');
      g('man-result').style.display = 'none';
      manDeactivate();
    });

    g('man-save').addEventListener('click', async () => {
      const lat = parseFloat(g('man-lat').value);
      const lng = parseFloat(g('man-lng').value);
      const poiType = parseInt(g('man-type').value);
      const name = g('man-name').value.trim() || POI_TYPES[poiType] || '';
      if (isNaN(lat) || isNaN(lng)) { showErr('man-err', 'Keine Koordinaten gesetzt.'); return; }
      showErr('man-err', '');
      g('man-save').disabled = true;
      g('man-save').textContent = '⏳ Speichere…';
      try {
        const poi = { caption: name, latitude: lat, longitude: lng, poi_type: poiType, address: '' };
        const ok = await createPOI(poi, getCsrfToken());
        if (ok) {
          // Auf Karte hinzufügen
          const r = await fetch('/mission_positions.json', { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (r.ok) {
            const data = await r.json();
            const sp = (data.mission_positions || []).find(p =>
              p.poi_type === poiType &&
              Math.abs(parseFloat(p.latitude) - lat) < 0.0001 &&
              Math.abs(parseFloat(p.longitude) - lng) < 0.0001
            );
            if (sp && typeof map_pois_service !== 'undefined') {
              try { map_pois_service.leafletMissionPositionMarkerAdd(sp); } catch(e) {}
            }
          }
          if (existingPOIs) existingPOIs.push({ poi_type: poiType, latitude: lat, longitude: lng });
          const res = g('man-result');
          res.style.display = 'block';
          res.innerHTML = `<div style="background:#dff0d8;border:1px solid #d6e9c6;border-radius:4px;padding:6px 10px;font-size:12px;color:#3c763d">✓ <strong>${name}</strong> gesetzt</div>`;
          // Marker bleibt auf Karte — deaktivieren für nächsten Klick
          manDeactivate();
          g('man-start').style.display = '';
        } else {
          showErr('man-err', 'Fehler beim Speichern – Server-Fehler.');
        }
      } catch(e) {
        showErr('man-err', 'Fehler: ' + e.message);
      }
      g('man-save').disabled = false;
      g('man-save').textContent = '✓ POI speichern';
    });

  } // end buildUI

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVBAR-BUTTON
  // ═══════════════════════════════════════════════════════════════════════════
  function addNavButton() {
    if (document.getElementById('lss-poi-toggle')) return;

    // Nur echte LSS-Navbar-Container akzeptieren — explizit prüfen ob es
    // eine navbar-nav in einem nav-Element ist, nicht irgendein ul
    const nav =
      document.querySelector('ul.navbar-nav.navbar-right') ||
      document.querySelector('nav ul.navbar-nav') ||
      document.querySelector('.navbar-collapse ul.navbar-nav');

    if (!nav) return; // still warten, kein Log-Spam

    const li = document.createElement('li');
    li.id = 'lss-poi-toggle-li';
    li.innerHTML = `<a href="#" id="lss-poi-toggle" title="POI Importer (Alt+Shift+P)">
      <span class="glyphicon glyphicon-map-marker"></span> POI Import
    </a>`;
    nav.appendChild(li);

    document.getElementById('lss-poi-toggle').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const existing = document.getElementById('lss-poi-importer');
      if (existing) { existing.remove(); } else { buildUI(); }
    });
  }

  // Keyboard-Shortcut: Alt+Shift+P öffnet/schließt das Panel
  document.addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      e.stopPropagation();
      const existing = document.getElementById('lss-poi-importer');
      if (existing) { existing.remove(); } else { buildUI(); }
    }
  });

  // Button einfügen — mit MutationObserver der sich selbst nach Erfolg beendet
  function tryAddButton() {
    if (document.getElementById('lss-poi-toggle')) return true;
    addNavButton();
    return !!document.getElementById('lss-poi-toggle');
  }

  if (!tryAddButton()) {
    // Navbar noch nicht im DOM — MutationObserver mit Throttle
    let obsTimer = null;
    const obs = new MutationObserver(() => {
      if (document.getElementById('lss-poi-toggle')) { obs.disconnect(); return; }
      // Throttle: max. 1x pro 200ms prüfen
      if (obsTimer) return;
      obsTimer = setTimeout(() => {
        obsTimer = null;
        if (tryAddButton()) obs.disconnect();
      }, 200);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Spätestens nach 30s aufgeben
    setTimeout(() => obs.disconnect(), 30000);
  }

})();
