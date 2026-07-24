import { type Node, type Beam, type NodeSupport } from '@baustatik/fem';
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/fem-geometry';
import { defineStore, createPinia } from 'pinia';
import { viewport, screenPoint } from '@baustatik/viewport-2d';

const pinia = createPinia();

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera).
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as Node[],
        beams: [] as Beam[],
        supports: [] as NodeSupport[],
    }),
    actions: {
        addNode(position: { x: number; z: number }) {
            this.nodes.push({ id: crypto.randomUUID(), position });
        },
        addBeam(startNode: Node, endNode: Node, crossSectionId: string, materialId: string) {
            this.beams.push({ id: crypto.randomUUID(), startNodeId: startNode.id, endNodeId: endNode.id, crossSectionId, materialId });
        },
        addSupport(node: Node, ux: 'fixed' | 'free', uz: 'fixed' | 'free', phiY: 'fixed' | 'free') {
            this.supports.push({ id: crypto.randomUUID(), nodeId: node.id, ux, uz, phiY });
        },
    },
});
const store = useStore(pinia);

store.addNode(Point.make(0, 0));
store.addNode(Point.make(100, 0));
store.addBeam(store.nodes[0], store.nodes[1], 'default', 'default');
store.addSupport(store.nodes[0], 'fixed', 'fixed', 'free');

// Schraeger Stab als Sichttest: frame global/local und die Bezugslaengen
// unterscheiden sich nur am schraegen Stab sichtbar.
store.addNode(Point.make(160, 40));
store.addBeam(store.nodes[1], store.nodes[2], 'default', 'default');

// ---------------------------------------------------------------------------
// PSEUDOCODE v4 — Eingabe vollstaendig. Feldnamen englisch (Handoff-Vokabular),
// Kommentare deutsch wie im Rest des Repos.
// Quellen: Knotenlast1.png, Stablast1..7.png und die Antworten aus v2/v3.
//
// Zwei Eingabeformen, nicht dieselbe mit anderem Ziel:
//
//   Knotenlast: KOMPONENTENWEISE — fx, fz, my global in EINER Last.
//   Stablast:   RICHTUNG + BETRAG — eine Achse per Radiobutton, dazu ein
//               Skalar. Zwei Richtungen = zwei Lasten. Kraft ODER Moment.
//
// VORZEICHEN: z zeigt nach unten (scene.ts:44 und das Achsenkreuz in den
// Dialogen). Nach unten wirkende Last ist POSITIV.
//
// BEZUGSLAENGE — nachgeprueft an Stablast4.png / Stablast5.png:
//   Der Dialogtext nennt die BLICKRICHTUNG, nicht die gemessene Achse.
//   "Projektion in X" -> Blick entlang X (von der Seite); die Bemassung im
//     Bild ist SENKRECHT, gemessen wird also die z-Ausdehnung des Stabes.
//   "Projektion in Z" -> Blick entlang Z (von oben, Grundriss); die Bemassung
//     ist WAAGRECHT, gemessen wird die x-Ausdehnung. Das ist der Schneefall.
//   Deshalb heissen die Werte hier nach dem, was GEMESSEN wird:
//     'trueLength' | 'verticalProjection' | 'horizontalProjection'
//   Mapping zur UI: "Projektion in X" = verticalProjection,
//                   "Projektion in Z" = horizontalProjection.
//   ('projectionX' aus v3 war zu leicht zu verwechseln — ich bin in v2 selbst
//   auf die Umkehrung reingefallen.)
//
// Alle Lasten treffen eine LISTE von Knoten bzw. Staeben: ein Lastobjekt,
// n Ziele. Loeschen loescht die Last auf allen Zielen.
// ---------------------------------------------------------------------------

// --- A) KNOTENLAST (Knotenlast1.png) ---------------------------------------
// Dialoggruppen "Kraft" (Px, Py, Pz) und "Moment" (Mx, My, Mz); in 2D bleiben
// fx, fz, my. Alle drei gehoeren zu EINER Last: loeschen loescht die ganze
// Last, eine Komponente entfaellt durch Weglassen oder 0.
// Nur komponentenweise — "Richtungsweise" (Betrag + Richtungstyp) faellt weg.

// A1 Vertikale Einzellast nach unten — der Regelfall
// store.addNodeLoad([store.nodes[1]], { fz: 10 });

// A2 Horizontale Einzellast (Wind auf Rahmenecke)
// store.addNodeLoad([store.nodes[1]], { fx: 5 });

// A3 Schraege Einzellast — zwei Komponenten derselben Last
// store.addNodeLoad([store.nodes[1]], { fx: 5, fz: 10 });

// A4 Reine Momentenlast (Bogensymbol, kein Pfeil)
// store.addNodeLoad([store.nodes[1]], { my: 12 });

// A5 Kraft und Moment gemeinsam — bei der Knotenlast erlaubt
// store.addNodeLoad([store.nodes[1]], { fx: 5, fz: 10, my: 12 });
// -> Darstellung: bis zu drei Symbole (2 Pfeile + Bogen) mit je eigener
//    Beschriftung, aber EINE Last-id. Spec-IDs: load:{id}:fx / :fz / :my

// A6 Dieselbe Last auf mehrere Knoten, mit Kommentar
// store.addNodeLoad([store.nodes[1], store.nodes[2]], {
//   fz: 10,
//   comment: 'Auflagerkraft Nebentraeger',
// });

// --- B) STABLAST: zwei Zweige, nicht einer -----------------------------------
// Stablast6.png/Stablast7.png zeigen: bei kind 'moment' sind im Dialog
// ALLE Richtungen ausser "Lokal y" ausgegraut — auch "Global Y". Und die
// Bezugslaenge ist auf "Wahre Stablaenge" festgenagelt. Ein ebenes Moment hat
// keine Richtungswahl. Damit hat der Momentzweig zwei Felder WENIGER:
//
//   kind 'force'                        kind 'moment'
//   ------------------------------      ------------------------------
//   distribution  point|constant|       distribution  point|constant|
//                 trapezoidal                         trapezoidal
//   frame         global|local          (entfaellt — immer lokal y)
//   axis          x|z                   (entfaellt)
//   referenceLength trueLength|         (entfaellt — immer wahre Stablaenge)
//                 vertical-|horizontalProjection
//   Werte  p [kN] / q [kN/m] /          Werte  m [kNm] / m [kNm/m] /
//          q1,q2 [kN/m]                        m1,m2 [kNm/m]
//
// Getrennte Wertnamen (p/q/q1/q2 vs. m/m1/m2), weil die Einheit eine andere
// ist. Siehe I1, falls dir das zu breit wird.
//
// referenceLength gibt es nur im 2D-FEM. Im 1D-FEM (Durchlauftraeger, alle
// Staebe waagrecht) bietet die UI nur 'trueLength' an — ein Typ, kein zweiter.

// --- C) KRAFT, PUNKTUELL (Stablast2.png) -----------------------------------
// Parameter: p [kN], distanceFromStart (Dialog: A). B ist gesperrt.
// KEINE Bezugslaenge: p ist eine Gesamtkraft in kN, nicht je Laenge — es gibt
// nichts zu skalieren. Der Typ traegt das Feld deshalb gar nicht erst.

// C1 Einzellast 50 vom Stabanfang, global nach unten
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'point',
//   frame: 'global', axis: 'z',
//   p: 10,
//   distanceFromStart: 50,
// });

// C2 Dieselbe Last relativ zur Stablaenge ("Relativer Abstand in %").
//    Das Flag gilt fuer ALLE Abstaende der Last, nicht pro Wert.
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'point',
//   frame: 'global', axis: 'z',
//   p: 10,
//   distanceFromStart: 50, relativeDistances: true,   // 50 % = Stabmitte
// });

// C3 Einzellast senkrecht zur Stabachse (lokal z) — z.B. Radlast
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'point',
//   frame: 'local', axis: 'z',
//   p: 10, distanceFromStart: 50,
// });

// --- D) KRAFT, KONSTANT (Stablast3.png) ------------------------------------
// Parameter: nur q [kN/m]. A, B, "Relativer Abstand" und "Last ueber gesamte
// Laenge" sind im Dialog ALLE gesperrt — die Konstante liegt immer auf dem
// ganzen Stab. Ein konstanter Teilabschnitt ist ein Trapez mit q1 === q2 (E5).

// D1 Gleichlast global nach unten (Eigengewicht, Nutzlast) — der Regelfall
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q: 5,
// });

// D2 Gleichlast global horizontal (Wind auf Stuetze)
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'global', axis: 'x', referenceLength: 'trueLength',
//   q: 2,
// });

// D3 Gleichlast senkrecht zur Stabachse (Wind auf Dachflaeche)
// store.addBeamLoad([store.beams[1]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'local', axis: 'z', referenceLength: 'trueLength',
//   q: 2,
// });

// D4 Schneelast: wirkt global nach unten, bezogen auf die Grundrisslaenge
//    (Stablast5.png, "Projektion in Z"). Nur beim schraegen Stab von D1
//    verschieden.
// store.addBeamLoad([store.beams[1]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'global', axis: 'z', referenceLength: 'horizontalProjection',
//   q: 0.85,
// });

// D5 Gegenprobe: auf die senkrechte Ausdehnung bezogen (Stablast4.png,
//    "Projektion in X") — z.B. Winddruck auf eine geneigte Flaeche
// store.addBeamLoad([store.beams[1]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'global', axis: 'x', referenceLength: 'verticalProjection',
//   q: 1.2,
// });

// D6 Gleichlast auf mehrere Staebe gleichzeitig
// store.addBeamLoad([store.beams[0], store.beams[1]], {
//   kind: 'force', distribution: 'constant',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q: 5, comment: 'Eigengewicht Aufbau',
// });

// --- E) KRAFT, TRAPEZFOERMIG (Stablast1.png) -------------------------------
// Parameter: q1, q2 [kN/m] und die Abstaende from (Dialog: A, gehoert zu q1)
// und to (Dialog: B, gehoert zu q2). Checkbox "Last ueber gesamte Laenge des
// Stabes" sperrt beide — dann liegt q1 am Stabanfang und q2 am Stabende.
// .___|------|___.   . = Knoten, _ = Stab, |--| = Last von `from` bis `to`

// E1 Trapez ueber den ganzen Stab (Erddruck, Wasserdruck)
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'trapezoidal',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q1: 2, q2: 8,
//   fullLength: true,
// });

// E2 Dreieckslast — Sonderfall von E1 mit einem Wert 0
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'trapezoidal',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q1: 0, q2: 8,
//   fullLength: true,
// });

// E3 Trapez auf einem Teilabschnitt, absolut
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'trapezoidal',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q1: 10, q2: 100,
//   from: 0, to: 33.333,
// });

// E4 Derselbe Fall relativ — exakt der Screenshot Stablast1.png
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'trapezoidal',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q1: 10, q2: 100,
//   from: 0, to: 33.333, relativeDistances: true,
// });

// E5 Konstanter Teilabschnitt — im Dialog nur ueber das Trapez erreichbar
// store.addBeamLoad([store.beams[0]], {
//   kind: 'force', distribution: 'trapezoidal',
//   frame: 'global', axis: 'z', referenceLength: 'trueLength',
//   q1: 5, q2: 5,
//   from: 20, to: 60,
// });

// --- F) MOMENT (Stablast6.png, Stablast7.png) ------------------------------
// Kein frame, kein axis, kein referenceLength — im Dialog alles ausgegraut
// ausser "Lokal y" und "Wahre Stablaenge". Felder, die genau einen zulaessigen
// Wert haetten, tauchen hier deshalb gar nicht erst auf.

// F1 Einzelmoment, absolut vom Stabanfang (Stablast6.png)
// store.addBeamLoad([store.beams[0]], {
//   kind: 'moment', distribution: 'point',
//   m: 12,                      // [kNm]
//   distanceFromStart: 50,
// });

// F2 Einzelmoment relativ — so steht es im Screenshot (A in %)
// store.addBeamLoad([store.beams[0]], {
//   kind: 'moment', distribution: 'point',
//   m: 12,
//   distanceFromStart: 50, relativeDistances: true,
// });

// F3 Konstante Momenten-Streckenlast ueber den ganzen Stab
// store.addBeamLoad([store.beams[0]], {
//   kind: 'moment', distribution: 'constant',
//   m: 2,                       // [kNm/m]
// });

// F4 Trapezfoermige Momenten-Streckenlast, ganzer Stab (Stablast7.png)
// store.addBeamLoad([store.beams[0]], {
//   kind: 'moment', distribution: 'trapezoidal',
//   m1: 2, m2: 8,               // [kNm/m]
//   fullLength: true,
// });

// F5 Dieselbe auf einem Teilabschnitt
// store.addBeamLoad([store.beams[0]], {
//   kind: 'moment', distribution: 'trapezoidal',
//   m1: 2, m2: 8,
//   from: 20, to: 60,
// });

// --- G) Regeln, die der Dialog erzwingt ------------------------------------
// Vorlage fuer die Union bzw. validate.ts:
//   - distribution 'point'       -> p bzw. m, distanceFromStart ;
//                                   kein from/to, kein fullLength
//   - distribution 'constant'    -> q bzw. m ; keine Abstaende,
//                                   kein relativeDistances
//   - distribution 'trapezoidal' -> q1,q2 bzw. m1,m2 ; ENTWEDER fullLength
//                                   ODER from + to
//   - kind 'moment' -> weder frame noch axis noch referenceLength
//   - 0 <= from <= to <= Stablaenge (bzw. <= 100 bei relativeDistances)
//   - Knotenlast: mindestens eine Komponente != 0
//   - referenceLength 'verticalProjection' bei waagrechtem Stab -> gemessene
//     Laenge 0 -> ablehnen. Analog 'horizontalProjection' bei senkrechtem Stab.
//   - Ziel-Liste darf nicht leer sein; unbekannte id -> Fehler ("dangling
//     references throw", vgl. UnknownNodeReferenceError)

// --- H) Beantwortet — nicht neu aufrollen ----------------------------------
// - keine nutzersichtbare Nr., crypto.randomUUID() genuegt
// - Lasten treffen LISTEN von Knoten/Staeben, ein Lastobjekt
// - comment?: string wird mitgefuehrt
// - Feldnamen englisch, Handoff-Vokabular
// - Knotenlast: alle Komponenten in einer Last; Stablast: Kraft ODER Moment
// - Konstante liegt immer auf dem ganzen Stab
// - 1D und 2D teilen sich einen Typ; die 1D-UI bietet nur 'trueLength'
// - Momenten-Streckenlasten gibt es (konstant und trapezfoermig)

// --- I) Einzige offene Frage -----------------------------------------------
// I1 Union-Breite: sechs Varianten (kind x distribution) mit eigenen Wertnamen
//    p/q/q1/q2 bzw. m/m1/m2 — oder drei Varianten mit neutralen Namen
//    (value / value1,value2) und `kind` als Einheiten-Diskriminante?
//    Sechs Varianten lesen sich wie der Dialog und machen die Einheit im Namen
//    sichtbar; drei sind kompakter, aber `value: 12` sagt nicht mehr, ob kNm
//    oder kN. Empfehlung: sechs. Der Zeichencode verzweigt ohnehin ueber
//    distribution, und `q1/q2` sind die Handoff-Namen.

// --- J) Was NICHT in diesen Schritt gehoert --------------------------------
// - Lastarten Temperatur, Laengenaenderung, Laengsversetzung, Vorkruemmung,
//   Anfangsvorspannung und die Verlaeufe Viereckfoermig, Parabolisch,
//   Veraenderlich
// - "Beziehen auf: Stabliste / Stabsaetze", benutzerdefinierte Koordinatensysteme
// - "Richtungsweise" bei der Knotenlast (Betrag + Richtungstyp)
// - Lastfaelle / Kombinationen, Eigengewicht-Generator
// - Ersatzknotenlasten / Solver
// - Lasteingabe per Mausklick auf den Stab (braucht Hit-Testing im Viewer)
// ---------------------------------------------------------------------------

// 1. Driver bauen (kennt Konva). Kein onViewIntent hier — der Viewer haengt sich selbst dran.
const stageSize = { width: window.innerWidth, height: window.innerHeight };
const driver = createKonvaDriver({
    container: document.getElementById('container') as HTMLDivElement,
    width: stageSize.width,
    height: stageSize.height,
    layers: FEM_LAYERS,
});

// 2. Viewer: Driver injizieren, Segmente per PULL aus dem Store.
const viewer = createFEMViewer({
    driver,
    initialViewport: viewport(screenPoint(stageSize.width / 2, stageSize.height / 2,), 1),
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    getScreenSize: () => stageSize,
    grid: { spacing: 10 }, // Weltkoordinaten; Segmente sind 60–100 Einheiten gross
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => viewer.requestRender());
