import { type Node, type Beam, type NodeSupport, BeamEndReleases } from '@baustatik/fem';
import { createSectionPolicy, sectionProperties, type CrossSection, type SectionPolicy, type ShapeSpec } from '@baustatik/cross-section';
import { resolveSectionStiffness } from '@baustatik/fem-section-resolve';
import { lookupMaterial, type Material, type MaterialKind } from '@baustatik/material';
import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import {
    assertValidLoadCase,
    type BeamLoad,
    effectiveLoads,
    type LoadCase,
    type NodeLoad,
} from '@baustatik/fem-loads';
import {
    createAnalysisPolicy,
    type AnalysisPolicy,
    type AnalysisPolicyOverrides,
    type CheckState,
    createFEMSolver,
    type FEMSolver,
    type LinearSystemKind,
    type SolveResult,
} from '@baustatik/fem-solver';
import { createFEMViewer, type DiagramOptions, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/fem-geometry';
import { defineStore, createPinia } from 'pinia';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { solveLinearSystem } from './linear-solver-port';
import { solveSparseSystem } from './sparse-solver-port';
import { round } from '@baustatik/round';

const pinia = createPinia();

// Eine Last ohne die Felder, die der Store selbst setzt. Verteilt ueber die
// Union, damit `kind`/`distribution` weiter narrowen — ein blankes
// `Omit<BeamLoad, ...>` wuerde die sechs Varianten zu einem Typ verschmelzen.
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NodeLoadInput = Without<NodeLoad, 'id' | 'target' | 'nodeIds'>;
type BeamLoadInput = Without<BeamLoad, 'id' | 'target' | 'beamIds'>;

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera).
//
// Es gibt KEINE flache Lastmenge mehr: eine Last existiert nur innerhalb eines
// Lastfalls, und der Lastfall besitzt sie.
//
// `activeLoadCaseId` ist der Lastfall, in dem der Anwender gerade arbeitet: er
// entscheidet, was gezeichnet wird UND wohin neue Lasten gehen. Der Solver liest
// ihn nicht — dem wird gesagt, was er rechnen soll.
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as Node[],
        beams: [] as Beam[],
        crossSections: [] as CrossSection[],
        materials: [] as Material[],
        // Die Erzeugungs-Policy gehoert zum Datensatz und nicht zum Code
        // (ADR 0033): unter ihr entsteht der Umriss eines gezeichneten
        // Querschnitts, und unter ihr zerlegt der Wandweg seine Bogenwaende
        // (ADR 0040). Sie reist deshalb mit dem Modell zum Resolver.
        sectionPolicy: createSectionPolicy() as SectionPolicy,
        // Die Analyse-Einstellung ist DATEN (als JSON schreibbar, ADR 0011) und
        // liegt deshalb im Store wie die sectionPolicy. Der Rechenkopf liest sie
        // beim BAUEN einmal; wer sie aendert, baut ihn neu (`buildSolver`).
        analysisPolicy: createAnalysisPolicy() as AnalysisPolicy,
        supports: [] as NodeSupport[],
        loadCases: [] as LoadCase[],
        activeLoadCaseId: '',
    }),
    getters: {
        // `undefined`, solange kein Lastfall angelegt ist. Der Viewer zeichnet
        // dann keine Last, statt beim Rendern zu scheitern.
        activeLoadCase(state): LoadCase | undefined {
            return state.loadCases.find((loadCase) => loadCase.id === state.activeLoadCaseId);
        },
    },
    actions: {
        addNode(position: { x: number; z: number }) {
            this.nodes.push({ id: crypto.randomUUID(), position });
        },
        /**
         * Das Material kommt als MODELLSATZ herein, nicht als Guete-String
         * (ADR 0026) — genau wie der Querschnitt. Vorher stand hier `'S235'`,
         * und am Ende der Kette las ein ungeprueftes `as SteelGrade` das
         * wieder als Stahlsorte; ein Holz- oder Betonstab war so gar nicht
         * modellierbar.
         *
         * HIER wird der Sortenkatalog befragt und NIRGENDS SONST (ADR 0027):
         * die Moduln gehen als Kopie in den Satz. Ein Nationaler Anhang wird
         * dafuer nicht gebraucht — `E` und `G` sind charakteristische Werte.
         */
        addMaterial(input: { kind: MaterialKind; grade: string }): Material {
            const found = lookupMaterial(input.kind, input.grade);
            if (found === undefined) throw new Error(`Die Sorte "${input.grade}" steht nicht im Katalog.`);
            const material: Material = { kind: input.kind, id: crypto.randomUUID(), grade: found.grade, moduli: found.moduli };
            this.materials.push(material);
            return material;
        },
        addBeam(startNode: Node, endNode: Node, crossSection: CrossSection, material: Material) {
            this.beams.push({ id: crypto.randomUUID(), startNodeId: startNode.id, endNodeId: endNode.id, crossSectionId: crossSection.id, materialId: material.id/*, releases: { start: { theta: true }, end: { theta: true } } */ });
        },
        /**
         * Das Gelenk ist ein EIGENER Modellierschritt — wie `addSupport` am
         * Knoten, nur am STABENDE (ADR 0017). Deshalb bleibt `addBeam` schmal:
         * ein Stab hat zwei Enden mit je drei Freiheitsgraden, das passt in
         * keine Argumentliste, und interaktiv setzt der Anwender Gelenke ohnehin
         * erst nach dem Zeichnen.
         *
         * Voreinstellung `{ theta: true }`, weil das Momentengelenk der Normalfall
         * ist; `u` (Normalkraft) und `w` (Querkraft) schreibt man aus, wenn man
         * sie wirklich meint.
         *
         * Nachgeschlagen wird ueber `this.beams`, statt auf `beam` zu schreiben:
         * der von `addBeam` zurueckgegebene Stab ist das ROHE Objekt. Ein
         * Schreibzugriff darauf ginge am Pinia-Proxy vorbei, und der Viewer
         * zeichnete nicht neu — dieselbe Falle wie bei `requireActiveCase`.
         *
         * Setzt nur frei, nimmt nichts zurueck: mit `?: true` heisst „nicht
         * freigesetzt" FELD WEG, nicht `false`. Ein Gegenstueck dazu braucht
         * erst die Oberflaeche.
         */
        addRelease(beam: Beam, end: 'start' | 'end', dofs: BeamEndReleases = { theta: true }) {
            const target = this.beams.find((candidate) => candidate.id === beam.id);
            if (target === undefined) throw new Error('Stab nicht im Modell — `release` nach `addBeam` aufrufen.');
            target.releases = { ...target.releases, [end]: { ...target.releases?.[end], ...dofs } };
        },
        /**
         * Der Querschnitt gehoert zum MODELL, nicht zur Anwendung (ADR 0023):
         * er liegt im Store neben Knoten und Staeben und reist mit dem
         * Snapshot. `Beam.crossSectionId` bleibt ein String und zeigt hierher.
         */
        addCrossSection(section: { kind: 'shape'; shape: ShapeSpec } | { kind: 'profile'; profile: string }): Readonly<CrossSection> {
            const id = crypto.randomUUID();
            // Der Profilkatalog wird BEIM ANLEGEN befragt, und die Zeile geht
            // als Kopie in den Satz (ADR 0027). Ein Tippfehler faellt damit
            // hier auf statt spaeter im Bericht.
            let created: CrossSection;
            if (section.kind === 'profile') {
                const row = lookupProfile(section.profile);
                if (row === undefined) throw new Error(`Das Profil "${section.profile}" steht nicht im Katalog.`);
                created = { kind: 'profile', id, profile: row.id, data: profileData(row) };
            } else {
                created = { kind: 'shape', id, shape: section.shape };
            }
            this.crossSections.push(created);
            return created;
        },
        addSupport(node: Node, ux: 'fixed' | 'free', uz: 'fixed' | 'free', phiY: 'fixed' | 'free') {
            this.supports.push({ id: crypto.randomUUID(), nodeId: node.id, ux, uz, phiY });
        },
        // Legt an und wechselt hinein — das ist der Ablauf des Anwenders:
        // Lastfall erstellen, dann darin Lasten erzeugen.
        addLoadCase(name: string, factor?: number): LoadCase {
            const loadCase: LoadCase = { id: crypto.randomUUID(), name, loads: [], ...(factor === undefined ? {} : { factor }) };
            assertValidLoadCase(loadCase);
            this.loadCases.push(loadCase);
            this.activeLoadCaseId = loadCase.id;
            return loadCase;
        },
        selectLoadCase(loadCaseId: string) {
            this.activeLoadCaseId = loadCaseId;
        },
        /**
         * Kopiert einen Lastfall und wechselt in die Kopie — der Anlass, aus dem
         * es den Faktor gibt.
         *
         * Mit `factor: -1` entsteht aus „Wind von links" ein „Wind von rechts",
         * ohne einen einzigen Lastwert nachzuziehen.
         *
         * ZIEHT NEUE LAST-IDS. Ohne das trügen zwei Lastfälle dieselben
         * Last-ids: Meldungen wären nicht mehr zuzuordnen, und eine
         * Überlagerung würde dieselbe Last doppelt zählen. Das ist die einzige
         * Stelle im Programm, an der die Eindeutigkeit der Last-ids gefährdet
         * ist — deshalb steht die Regel hier und nicht in einer Prüfung.
         */
        copyLoadCase(source: LoadCase, name: string, factor?: number): LoadCase {
            const copy: LoadCase = {
                id: crypto.randomUUID(),
                name,
                loads: source.loads.map((load) => ({ ...load, id: crypto.randomUUID() })),
                ...(factor === undefined ? {} : { factor }),
            };
            assertValidLoadCase(copy);
            this.loadCases.push(copy);
            this.activeLoadCaseId = copy.id;
            return copy;
        },
        // Lasten entstehen im AKTIVEN Lastfall — der Anwender hat ihn gerade
        // ausgewählt, und genau dorthin gehört, was er jetzt eingibt.
        //
        // Der Lastfall wird über `this.loadCases` nachgeschlagen und nicht als
        // Objekt hereingegeben: nur so trifft die Zuweisung den Pinia-Proxy. Ein
        // Schreibzugriff auf das rohe Objekt geht am Proxy vorbei, und der Viewer
        // würde nicht neu zeichnen.
        //
        // Ein Lastobjekt, n Ziele: Loeschen loescht die Last auf allen Zielen.
        addNodeLoad(nodes: Node[], load: NodeLoadInput) {
            const target = requireActiveCase(this.loadCases, this.activeLoadCaseId);
            target.loads = [...target.loads, { id: crypto.randomUUID(), target: 'node', nodeIds: nodes.map((node) => node.id), ...load }];
        },
        addBeamLoad(beams: Beam[], load: BeamLoadInput) {
            const target = requireActiveCase(this.loadCases, this.activeLoadCaseId);
            target.loads = [...target.loads, { id: crypto.randomUUID(), target: 'beam', beamIds: beams.map((beam) => beam.id), ...load } as BeamLoad];
        },
    },
});

/**
 * Der aktive Lastfall zum SCHREIBEN. Ohne ihn gibt es keinen Ort für eine Last,
 * und das soll auffallen, statt still ins Leere zu schreiben.
 *
 * Gegenstück zum Getter `activeLoadCase`, der `undefined` liefern DARF: der
 * Viewer zeichnet dann eben nichts, statt beim Rendern zu scheitern. Zwei
 * Verträge, deshalb zwei Zugänge.
 *
 * Nimmt das Array herein statt es selbst zu holen, damit der Pinia-Proxy erhalten
 * bleibt — eine Zuweisung an das rohe Objekt löste kein Neuzeichnen aus.
 */
function requireActiveCase(loadCases: LoadCase[], activeLoadCaseId: string): LoadCase {
    const found = loadCases.find((loadCase) => loadCase.id === activeLoadCaseId);
    if (found === undefined) throw new Error('Kein aktiver Lastfall — erst addLoadCase() oder selectLoadCase().');
    return found;
}
const store = useStore(pinia);

// Der Querschnitt ist jetzt echt: IPE 300 aus dem Walzprofil-Katalog. Bis
// hierher stand im Solver ein erfundenes { EA: 1e6, EI: 1000, GAs: 500 }.
const IPE300 = store.addCrossSection({ kind: 'profile', profile: 'IPE 300' });
const rc = store.addCrossSection({ kind: 'shape', shape: { kind: 'rectangle', b: 300, h: 500 } });
const x200400 = store.addCrossSection({ kind: 'shape', shape: { kind: 'i-symmetric', h: 400, b: 200, tw: 10, tf: 10, idealisation: 'thin-walled' } });

console.log(sectionProperties(x200400));

store.addNode(Point.make(0, 0));
store.addNode(Point.make(4, 0));
const S235 = store.addMaterial({ kind: 'steel', grade: 'S235' });
store.addBeam(store.nodes[0], store.nodes[1], IPE300, S235);
store.addSupport(store.nodes[0], 'fixed', 'fixed', 'free');
store.addSupport(store.nodes[1], 'free', 'fixed', 'free');

// Schraeger Stab als Sichttest: frame global/local und die Bezugslaengen
// unterscheiden sich NUR am schraegen Stab sichtbar. Am waagrechten fallen
// lokal und global zusammen und der Schatten mit der Stabachse — dort saehe man
// nicht, ob ueberhaupt projiziert wird.
store.addNode(Point.make(6, -2));
store.addBeam(store.nodes[1], store.nodes[2], IPE300, S235);

// Repräsentative Fixtures für den Demo- und Sichttest. Die vollständige
// Sammlung der Eingabevarianten steht in
// packages/fem-loads/docs/load-examples.md.

// Ein Lastfall JE KOMBINATION aus Lastrichtung und Bezugslänge — die neun
// Bilder, gegen die `apps/demo/Linienlast1.png` … `Linienlast9.png` stehen.
// Durchgeklickt wird mit dem Knopf „nächster Lastfall".
//
// Erwartung nach ADR 0028 (die Streckenlast steht auf ihrem Schatten):
//   - lokal z sieht bei allen drei Bezugslängen GLEICH aus (Licht ⊥ Stab)
//   - die beiden Projektionen sehen bei gleicher Richtung GLEICH aus
//   - lokal x liefert den Parallelfall: Block quer, Pfeile längs darin
const DIRECTIONS = [
    { frame: 'local', axis: 'z' },
    { frame: 'local', axis: 'x' },
    { frame: 'global', axis: 'z' },
    { frame: 'global', axis: 'x' },
] as const;
const REFERENCES = ['trueLength', 'horizontalProjection', 'verticalProjection'] as const;

// for (const { frame, axis } of DIRECTIONS) {
//     for (const referenceLength of REFERENCES) {
//         store.addLoadCase(`Const ${frame} ${axis} · ${referenceLength}`);
//         // Auf BEIDEN Stäben zugleich: dieselbe Last, einmal waagrecht und einmal
//         // schräg — der Unterschied ist genau das, was man sehen will.
//         store.addBeamLoad([store.beams[0], store.beams[1]], {
//             kind: 'force', distribution: 'constant',
//             frame, axis, referenceLength,
//             q: 5,
//         });
//     }
// }

for (const { frame, axis } of DIRECTIONS) {
    for (const referenceLength of REFERENCES) {
        store.addLoadCase(`Trapez ${frame} ${axis} · ${referenceLength}`);
        // Auf BEIDEN Stäben zugleich: dieselbe Last, einmal waagrecht und einmal
        // schräg — der Unterschied ist genau das, was man sehen will.
        store.addBeamLoad([store.beams[0], store.beams[1]], {
            kind: 'force', distribution: 'trapezoidal',
            frame, axis, referenceLength,
            from: 20, to: 80, relativeDistances: true,
            q1: 5, q2: 5,
        });
    }
}

// Das Trapez zuletzt: Teilabschnitt, zwei Ordinaten, Dreieckslast. Hier zeigt
// sich, dass die Höhe JE LAST normiert ist — beide Lasten sind gleich hoch,
// obwohl die eine dreimal so gross ist.
store.addLoadCase('Trapez und Dreieck');
store.addBeamLoad([store.beams[0]], {
    kind: 'force', distribution: 'trapezoidal',
    frame: 'global', axis: 'z', referenceLength: 'trueLength',
    from: 20, to: 80, relativeDistances: true,
    q1: 5, q2: -5,
});
store.addBeamLoad([store.beams[1]], {
    kind: 'force', distribution: 'trapezoidal',
    frame: 'local', axis: 'z', referenceLength: 'trueLength',
    fullLength: true,
    q1: 5, q2: 5,
});

// Der Sichttest zum Gap und zur Marke: die Einzellast steht jetzt wie die
// Streckenlast VOR ihrem Angriffspunkt, und auf einem Stab sagt eine rote Marke,
// wo genau der liegt. Die Knotenlast bekommt keine — dort ist der Knoten selbst
// die Marke.
store.addLoadCase('Einzellasten · Gap und Marke');
/*store.addBeamLoad([store.beams[0]], {
    kind: 'force', distribution: 'point',
    frame: 'global', axis: 'z',
    distanceFromStart: 40, relativeDistances: true,
    p: 10,
});*/
// Am schraegen Stab, lokal: der Pfeil steht schraeg ab, die Marke bleibt
// achsparallel — sie zeigt eine Stelle, keine Richtung.
store.addBeamLoad([store.beams[1]], {
    kind: 'force', distribution: 'point',
    frame: 'global', axis: 'z',
    distanceFromStart: 60, relativeDistances: true,
    p: 10,
});
//store.addNodeLoad([store.nodes[2]], { fx: 8 });

store.selectLoadCase(store.loadCases[0].id);


// 1. Driver bauen (kennt Konva). Kein onViewIntent hier — der Viewer haengt sich selbst dran.
//
// Die Groesse kommt aus dem Container und nicht mehr aus `window`: rechts steht
// jetzt die Berichtspalte, und mit `window.innerWidth` laege ein Teil der
// Zeichenflaeche darunter.
const container = element<HTMLDivElement>('container');
const bounds = container.getBoundingClientRect();
const stageSize = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
const driver = createKonvaDriver({
    container,
    width: stageSize.width,
    height: stageSize.height,
    layers: FEM_LAYERS,
});

/**
 * Das Ergebnis des zuletzt gerechneten Lastfalls — oder `undefined`, solange
 * nicht gerechnet ist.
 *
 * NICHT im Store: ein Ergebnis ist keine Eingabe. Es gehoert zu genau dem
 * Modell und dem Lastfall, aus denen es entstanden ist, und wird deshalb bei
 * jeder Store-Aenderung verworfen. Das dient der Anzeige, nicht der Korrektheit
 * — ein `SolveResult` traegt alles bei sich, was es zum Auswerten braucht
 * (ADR 0019), es koennte gar nicht falsch werden. Aber ein Auflagerpfeil an
 * einem Knoten, den man gerade verschoben hat, behauptet etwas.
 */
let result: SolveResult | undefined;

/**
 * WELCHE Verlaeufe sichtbar sind, und wie hoch — reiner ANSICHTSzustand, wie
 * der Viewport. Er gehoert nicht in den Store: er beschreibt weder das Modell
 * noch sein Ergebnis, und er ueberlebt kein Neuladen.
 *
 * Die ANWESENHEIT eines Feldes in `DiagramOptions` ist der Schalter; ein Haken
 * raus heisst „Feld weg", nicht „Hoehe null".
 */
const diagrams: { N: boolean; V: boolean; M: boolean; exaggeration: number } = {
    N: false,
    V: false,
    M: true,
    exaggeration: 1,
};

function diagramOptions(): DiagramOptions | undefined {
    const options: DiagramOptions = {
        ...(diagrams.N ? { N: diagrams.exaggeration } : {}),
        ...(diagrams.V ? { V: diagrams.exaggeration } : {}),
        ...(diagrams.M ? { M: diagrams.exaggeration } : {}),
    };
    // Kein Haken gesetzt = der Pull faellt ganz weg, nicht ein leeres Objekt.
    return Object.keys(options).length === 0 ? undefined : options;
}

// 2. Viewer: Driver injizieren, Segmente per PULL aus dem Store.
const viewer = createFEMViewer({
    driver,
    initialViewport: viewport(screenPoint(stageSize.width / 2, stageSize.height / 2,), 100),
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    // Der Viewer kennt den Begriff Lastfall NICHT und muss es nicht: er zeigt
    // immer genau einen, und welcher das ist, weiss die Anwendung. Durch
    // `effectiveLoads` sieht er dieselben Zahlen wie der Solver — deshalb kann
    // am Pfeil nichts anderes stehen als in der Rechnung.
    getLoads: () => {
        const active = store.activeLoadCase;
        return active === undefined ? [] : effectiveLoads(active);
    },
    // Dasselbe PULL-Muster wie bei den Rohdaten, nur aus dem Ergebnis statt aus
    // dem Store. `undefined` heisst „noch nicht gerechnet", und dann steht im
    // Bild kein Ergebnis — es braucht keinen Schalter daneben.
    //
    // EIN Pull fuer das ganze Ergebnis. Diese Seite rundet die Auflagerkraefte
    // fuers Bild; sie baut dafuer eine KOPIE des Ergebnisses mit gerundeten
    // `reactions` statt einer zweiten Quelle daneben.
    getResult: () => {
        if (result === undefined) { return undefined }
        return {
            ...result,
            reactions: new Map(
                Array.from(result.reactions, ([id, reaction]) => [
                    id,
                    {
                        fx: round(reaction.fx).toDecimals(2),
                        fz: round(reaction.fz).toDecimals(2),
                        my: round(reaction.my).toDecimals(2)
                    }
                ])
            ),
        };
    },
    // Ein PULL wie alles andere: der Viewer haelt keinen Zustand ausser dem
    // Viewport, und diese drei Haken sind Ansicht, nicht Modell.
    getDiagrams: diagramOptions,
    getScreenSize: () => stageSize,
    grid: { spacing: 1 }, // Weltkoordinaten; Segmente sind 60–100 Einheiten gross
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => {
    // Das Verwerfen steht VOR dem Neuzeichnen und in DIESEM Abonnement, nicht im
    // zweiten weiter unten: die beiden laufen in Registrierungsreihenfolge, und
    // andersherum haenge fuer einen Frame die alte Auflagerkraft am neuen Modell.
    result = undefined;
    viewer.requestRender();
});

// 4. Rechenkopf: dasselbe PULL-Muster wie der Viewer, nur andere Fragen.
//    Er haelt keine Kopie — spaeter hinzugefuegte Knoten und Lasten sieht er
//    beim naechsten Aufruf von selbst.
//
//    Die drei Ports (Steifigkeiten, Linearsolver, Formulierung) sind das, was
//    das Package bewusst nicht selbst weiss. Hier bleiben sie schlicht: das
//    Rechnen selbst zeigt `fem-cantilever.ts` gegen die Handrechnung.
//
//    ALS FUNKTION, weil die Policy nur beim BAUEN gelesen wird (ADR 0011):
//    aendert der Anwender die Analyse-Einstellung, wird der Kopf neu gebaut
//    statt umgebaut. Er haelt keinen Zustand — das Neubauen ist billig.
function buildSolver(): FEMSolver {
    return createFEMSolver({
        getNodes: () => store.nodes,
        getBeams: () => store.beams,
        getSupports: () => store.supports,
        // ALLE Lastfälle. Welcher gerechnet wird, sagt das Argument von `check()`
        // und `solve()` — der Solver liest keinen Ansichtszustand.
        getLoadCases: () => store.loadCases,
        // Ab hier rechnet die FEM ECHT: Querschnitt x Material -> EA, EI, GAs.
        // `undefined` (unbekannter Querschnitt oder unbekanntes Material) wird vom
        // Bericht als Modellfehler gemeldet, nicht geworfen.
        // Der Store fuehrt `crossSections` UND `materials` und erfuellt damit die
        // Form von `SectionModel` strukturell — er reist als EIN Stueck hinein.
        // Ein Katalog kommt hier NICHT mehr dazu: die Saetze tragen ihre Zahlen
        // selbst (ADR 0027), und der Rechenweg sieht keinen Nationalen Anhang.
        getSectionStiffness: (beam) => resolveSectionStiffness(beam, store),
        // BEIDE Ports: welcher rechnet, sagt die `AnalysisPolicy` (ADR 0042).
        solveLinearSystem,
        solveSparseSystem,
        analysisPolicy: store.analysisPolicy,
    });
}

let solver = buildSolver();

// ---------------------------------------------------------------------------
// DER ABLAUF, wie er jetzt gebaut ist. Hier stand bis v5 ein langer
// Pseudocode-Block samt handgebauter `checkModel()`-Funktion. Beides ist
// eingeloest: die Modellregeln wohnen in `@baustatik/fem` (ADR 0008), der
// Bericht traegt einen ZUSTAND statt einer Fehlerliste (ADR 0010), und
// Reihenfolge und Kurzschluss stecken im Package statt in dieser Datei.
//
// Die fuenf Zustaende:
//   empty                kein Stab                  nichts zu pruefen
//   invalid              Modell- ODER Lastfehler    hartes Tor
//   unloaded             Modell traegt, keine Last  pruefbar, nicht rechenbar
//   ready-with-warnings  nur Hinweise               Rechnen erlaubt
//   ready                sauber                     Rechnen
//
// Was weiterhin gilt (ADR 0007): der EINGABEDIALOG geht NICHT hier durch. Er
// prueft einen Entwurf waehrend des Tippens direkt gegen `@baustatik/fem-loads`,
// weil `getLoadCases()` eine noch nicht gespeicherte Last nicht sieht.
//
// Geprueft und gerechnet wird immer EIN Lastfall, und zwar der GENANNTE. Welcher
// gerade sichtbar ist, ist Sache der Anwendung (ADR 0014).
// ---------------------------------------------------------------------------

async function run(loadCaseId: string): Promise<void> {
    const report = solver.check(loadCaseId);
    console.log('Zustand:', report.state);

    if (!report.canSolve) {
        console.warn('Noch nicht rechenbar.', {
            modell: report.model.errors.map((error) => error.message),
            lasten: report.loads.assessed
                ? report.loads.errors.map((error) => error.message)
                : 'wegen Modellfehler nicht beurteilt',
        });
        return;
    }

    const result = await solver.solve(loadCaseId);

    console.log('Auflagerkraft am ersten Knoten', result.reactions.get(store.nodes[0].id));
    console.log('Verschiebungen am ersten Knoten', result.displacements.get(store.nodes[0].id));
    console.log('Auflagerkraft am letzten Knoten', result.reactions.get(store.nodes[1].id));
}

// Alle Lastfaelle nacheinander — die zweite und letzte Rechenoperation. Bricht
// beim ersten kaputten Fall ab; welcher das ist, sagt `solver.check(id)` je Fall.
async function runAll(): Promise<void> {
    for (const result of await solver.solveAll()) {
        const name = store.loadCases.find((c) => c.id === result.loadCaseId)?.name;
        console.log(name, result.displacements.get(store.nodes[1].id));
    }
}

// ---------------------------------------------------------------------------
// 5. Die rechte Spalte: der Bericht als Oberflaeche.
//
// Sie zeigt, was `solver.check(id)` fuer den AKTIVEN Lastfall sagt. Bis hier
// ging das in die Konsole — der Unterschied ist nicht die Darstellung, sondern
// dass jetzt sichtbar wird, WANN geprueft wird: bei jeder Store-Aenderung neu,
// nicht einmal beim Laden und nicht erst beim Rechnen.
//
// Der Bericht wird NICHT zwischengespeichert. Er veraltet, sobald sich etwas
// aendert, und das zu bemerken ist Sache der Anwendung, nicht des Packages —
// deshalb haelt der Rechenkopf ihn nicht fest, und deshalb steht hier ein
// `check()` je Anzeige statt eines Feldes.
// ---------------------------------------------------------------------------

/**
 * Der Zustand des Berichts in einem Satz. Uebersetzt wird HIER und nicht im
 * Package: `CheckState` ist ein Fachbegriff, der Text daneben ist Oberflaeche.
 */
const STATE_TEXT: Record<CheckState, string> = {
    empty: 'Leer — kein Stab im Modell',
    invalid: 'Nicht rechenbar — es gibt Fehler',
    unloaded: 'Tragfaehig, aber ohne Last',
    'ready-with-warnings': 'Rechenbar — mit Hinweisen',
    ready: 'Rechenbar',
};

const loadCaseName = element<HTMLDivElement>('load-case-name');
const loadCasePosition = element<HTMLDivElement>('load-case-position');
const nextLoadCaseButton = element<HTMLButtonElement>('next-load-case');
const stateField = element<HTMLDivElement>('state');
const solveButton = element<HTMLButtonElement>('solve');
const solveStatus = element<HTMLDivElement>('solve-status');
const warningList = element<HTMLUListElement>('warnings');
const errorList = element<HTMLUListElement>('errors');
const warningCount = element<HTMLSpanElement>('warning-count');
const errorCount = element<HTMLSpanElement>('error-count');

// Waehrend gerechnet wird, ist der Knopf gesperrt. Der Zustand gehoert der
// Oberflaeche, nicht dem Store: er ueberlebt kein Neuladen und geht niemanden
// sonst etwas an.
let solving = false;

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`Element #${id} fehlt in fem-viewer.html.`);
    return found as T;
}

/** Ein Befund mit seiner Herkunft — im Bericht getrennt, in der Liste gemischt. */
type Finding = { source: 'Modell' | 'Lasten'; message: string };

function fill(list: HTMLUListElement, counter: HTMLSpanElement, findings: Finding[], empty: string) {
    counter.textContent = String(findings.length);
    list.replaceChildren(
        ...(findings.length === 0
            ? [item(empty, undefined)]
            : findings.map((finding) => item(finding.message, finding.source))),
    );
}

function item(message: string, source: Finding['source'] | undefined): HTMLLIElement {
    const line = document.createElement('li');
    if (source === undefined) {
        line.className = 'muted';
    } else {
        const tag = document.createElement('span');
        tag.className = 'source';
        tag.textContent = source;
        line.append(tag);
    }
    line.append(message);
    return line;
}

function renderPanel(): void {
    const active = store.activeLoadCase;
    // Mehr als ein Fall, sonst waere „naechster" derselbe.
    nextLoadCaseButton.disabled = store.loadCases.length < 2;

    if (active === undefined) {
        loadCaseName.textContent = '— kein Lastfall —';
        loadCasePosition.textContent = '';
        stateField.textContent = '–';
        delete stateField.dataset.state;
        solveButton.disabled = true;
        fill(warningList, warningCount, [], 'Keine.');
        fill(errorList, errorCount, [], 'Keine.');
        return;
    }

    const position = store.loadCases.findIndex((loadCase) => loadCase.id === active.id) + 1;
    loadCaseName.textContent =
        active.factor === undefined ? active.name : `${active.name} (Faktor ${active.factor})`;
    loadCasePosition.textContent = `${position} von ${store.loadCases.length} · ${active.loads.length} Last(en)`;

    const report = solver.check(active.id);
    stateField.textContent = STATE_TEXT[report.state];
    stateField.dataset.state = report.state;
    solveButton.disabled = !report.canSolve || solving;

    const warnings: Finding[] = report.model.warnings.map((hint) => ({ source: 'Modell', message: hint.message }));
    const errors: Finding[] = report.model.errors.map((problem) => ({ source: 'Modell', message: problem.message }));
    if (report.loads.assessed) {
        for (const hint of report.loads.warnings) warnings.push({ source: 'Lasten', message: hint.message });
        for (const problem of report.loads.errors) errors.push({ source: 'Lasten', message: problem.message });
    }

    fill(warningList, warningCount, warnings, 'Keine Hinweise.');
    // `assessed: false` ist eine Aussage und kein Fehlen von Daten: die Lasten
    // wurden wegen eines Modellfehlers gar nicht angesehen. Das muss dastehen,
    // sonst liest sich „keine Lastfehler" wie „geprueft und sauber".
    fill(
        errorList,
        errorCount,
        errors,
        report.loads.assessed ? 'Keine Fehler.' : 'Lasten wegen Modellfehler nicht beurteilt.',
    );
}

nextLoadCaseButton.addEventListener('click', () => {
    const current = store.loadCases.findIndex((loadCase) => loadCase.id === store.activeLoadCaseId);
    const next = store.loadCases[(current + 1) % store.loadCases.length];
    if (next !== undefined) store.selectLoadCase(next.id);
});

solveButton.addEventListener('click', () => {
    void solveActive();
});

/**
 * Rechnet den aktiven Lastfall und schreibt das Ergebnis in die Spalte.
 *
 * Das `check()` davor spart sich diese Funktion: `renderPanel` hat den Knopf
 * genau dann freigegeben, wenn `canSolve` galt, und `solve()` prueft ohnehin
 * selbst nach. Der `catch`-Zweig bleibt trotzdem — zwischen Freigabe und Klick
 * kann sich das Modell geaendert haben.
 */
async function solveActive(): Promise<void> {
    const active = store.activeLoadCase;
    if (active === undefined) return;

    solving = true;
    solveButton.disabled = true;
    solveStatus.textContent = 'Rechnet …';
    // Erst weg, dann rechnen: so gibt es keinen Zweig, in dem ein alter
    // Auflagerpfeil eine fehlgeschlagene Rechnung ueberlebt.
    result = undefined;

    try {
        const solved = await solver.solve(active.id);
        // Ab hier stehen die Auflagerkraefte auch IM BILD, gruen und mit der
        // Spitze am Knoten: `fz` negativ heisst „die Stuetze drueckt nach oben",
        // und die Gleichgewichtsprobe gegen die blauen Lastpfeile ist damit
        // ablesbar, ohne die Zahlen hier daneben zu lesen.
        result = solved;

        const support = solved.reactions.get(store.nodes[0].id);
        const displacement = solved.displacements.get(store.nodes[1].id);
        solveStatus.textContent = [
            `Auflager Knoten 1: Fx ${support?.fx.toFixed(2)} kN, Fz ${support?.fz.toFixed(2)} kN`,
            `Knoten 2: uz ${displacement?.uz.toExponential(3)} m`,
            ...solved.warnings.map((warning) => `⚠ ${warning.message}`),
        ].join('\n');
        console.log(active.name, solved);
    } catch (error) {
        solveStatus.textContent = `Fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        solving = false;
        // Neu zeichnen in BEIDEN Faellen: nach dem Erfolg, damit die Reaktionen
        // erscheinen, nach dem Fehlschlag, damit sie verschwinden. Der Store hat
        // sich nicht geaendert, sein Abonnement feuert also nicht.
        viewer.requestRender();
        renderPanel();
    }
}

// ---------------------------------------------------------------------------
// 5a. Die Schnittgroessen-Schalter.
//
// Sie schreiben in `diagrams` und NICHT in den Store: was man ansieht, ist keine
// Eingabe. Deshalb loesen sie auch kein `check()` aus — nur ein Neuzeichnen.
//
// Die Ueberhoehung gilt fuer alle drei zugleich. Je Schnittgroesse einen eigenen
// Regler gaebe es erst, wenn jemand N und M gleichzeitig verschieden ueberhoehen
// will; der Typ `DiagramOptions` kann es bereits.
// ---------------------------------------------------------------------------
const diagramMCheckbox = element<HTMLInputElement>('diagram-m');
const diagramVCheckbox = element<HTMLInputElement>('diagram-v');
const diagramNCheckbox = element<HTMLInputElement>('diagram-n');
const diagramExaggerationInput = element<HTMLInputElement>('diagram-exaggeration');
const diagramExaggerationValue = element<HTMLSpanElement>('diagram-exaggeration-value');

function applyDiagramOptions(): void {
    diagrams.M = diagramMCheckbox.checked;
    diagrams.V = diagramVCheckbox.checked;
    diagrams.N = diagramNCheckbox.checked;
    diagrams.exaggeration = Number(diagramExaggerationInput.value);
    diagramExaggerationValue.textContent = String(diagrams.exaggeration);
    viewer.requestRender();
}

for (const control of [
    diagramMCheckbox,
    diagramVCheckbox,
    diagramNCheckbox,
    diagramExaggerationInput,
]) {
    control.addEventListener('input', applyDiagramOptions);
}

// Die Controls tragen den Anfangsstand von `diagrams` — einmal angleichen.
diagramMCheckbox.checked = diagrams.M;
diagramVCheckbox.checked = diagrams.V;
diagramNCheckbox.checked = diagrams.N;
diagramExaggerationInput.value = String(diagrams.exaggeration);
diagramExaggerationValue.textContent = String(diagrams.exaggeration);

// ---------------------------------------------------------------------------
// 6. Die Analyse-Einstellung: ansehen und aendern.
//
// Die Policy ist DATEN (als JSON schreibbar, ADR 0011) und liegt deshalb im
// Store wie die sectionPolicy. Aendern heisst: die Controls lesen den
// aktuellen Stand und schicken ihn ALS GANZES Paket durch
// `createAnalysisPolicy` — die Factory mischt gegen die DEFAULTs, nicht gegen
// den bisherigen Stand, sonst ueberschriebe eine Aenderung an Feld A still
// die fruehere an Feld B. Gesetzt wird immer die VOLLSTAENDIGE effektive
// Policy; `loads` und `schemaVersion` setzt die Factory selbst.
//
// Ein ungueltiger Wert (etwa `warn >= fail`) wirft aus der Factory: der
// Fehlertext steht dann in der Spalte, der Store behaelt den alten Stand.
//
// Der Rechenkopf wird NEU gebaut statt umgebaut: `createFEMSolver` loest die
// Konfiguration einmal auf. Ein Ergebnis von vorhin gehoert nicht zu einer
// neuen Einstellung — weil die Policy im Store liegt, raeumen die bestehenden
// Store-Abonnements es von selbst weg.
// ---------------------------------------------------------------------------
const linearSystemSelect = element<HTMLSelectElement>('linear-system');
const shearDeformationCheckbox = element<HTMLInputElement>('shear-deformation');
const warnRotationInput = element<HTMLInputElement>('warn-rotation');
const warnRelativeInput = element<HTMLInputElement>('warn-relative');
const failRotationInput = element<HTMLInputElement>('fail-rotation');
const failRelativeInput = element<HTMLInputElement>('fail-relative');
const policyError = element<HTMLDivElement>('policy-error');
const policyJson = element<HTMLPreElement>('policy-json');

function policyOverrides(): AnalysisPolicyOverrides {
    return {
        linearSystem: linearSystemSelect.value as LinearSystemKind,
        shearDeformation: shearDeformationCheckbox.checked,
        deformationLimits: {
            warn: {
                rotation: Number(warnRotationInput.value),
                relativeDisplacement: Number(warnRelativeInput.value),
            },
            fail: {
                rotation: Number(failRotationInput.value),
                relativeDisplacement: Number(failRelativeInput.value),
            },
        },
    };
}

function renderPolicyJson(): void {
    policyJson.textContent = JSON.stringify(store.analysisPolicy, null, 2);
}

/** Die Controls aus dem Store-Stand fuellen — einmal beim Start. */
function syncPolicyControls(): void {
    const policy = store.analysisPolicy;
    linearSystemSelect.value = policy.linearSystem;
    shearDeformationCheckbox.checked = policy.shearDeformation;
    warnRotationInput.value = String(policy.deformationLimits.warn.rotation);
    warnRelativeInput.value = String(policy.deformationLimits.warn.relativeDisplacement);
    failRotationInput.value = String(policy.deformationLimits.fail.rotation);
    failRelativeInput.value = String(policy.deformationLimits.fail.relativeDisplacement);
    renderPolicyJson();
}

function applyAnalysisPolicy(): void {
    try {
        store.analysisPolicy = createAnalysisPolicy(policyOverrides());
        solver = buildSolver();
        policyError.textContent = '';
        renderPolicyJson();
    } catch (error) {
        policyError.textContent = error instanceof Error ? error.message : String(error);
    }
}

for (const control of [
    linearSystemSelect,
    shearDeformationCheckbox,
    warnRotationInput,
    warnRelativeInput,
    failRotationInput,
    failRelativeInput,
]) {
    control.addEventListener('change', applyAnalysisPolicy);
}

syncPolicyControls();

renderPanel();
// Dasselbe Abonnement wie beim Viewer, dieselbe Begruendung: die Spalte zeigt
// den Store, also wird sie mit ihm neu aufgebaut. Auch das Umschalten des
// Lastfalls laeuft hier durch.
store.$subscribe(() => {
    // Ein Ergebnis von vorhin gehoert nicht zu einem geaenderten Modell.
    solveStatus.textContent = '';
    renderPanel();
});

// Zum Ausprobieren in der Konsole:
//
//   store.loadCases                                 die drei Faelle
//   store.selectLoadCase(store.loadCases[2].id)      umschalten, zeichnet neu
//   store.addNodeLoad([store.nodes[1]], { fz: 3 })   landet im aktiven Fall
//   solver.check(store.activeLoadCaseId)             sieht den Store ohne Neubau
//   await run(store.activeLoadCaseId)                pruefen und EINEN rechnen
//   await runAll()                                   ALLE rechnen
//
// Es gibt genau zwei Rechenoperationen: `solver.solve(id)` und
// `solver.solveAll()`. „Wind von rechts" ist die Kopie von „Wind von links" mit
// Faktor -1 — dieselben eingegebenen Werte, gespiegelte Pfeile und gespiegelte
// Ergebnisse.
Object.assign(globalThis, { store, solver, run, runAll });
