import {
    createSectionGeometry,
    createSectionPolicy,
    type CrossSection,
    DEFAULT_SECTION_POLICY,
    type FESectionState,
    InvalidSectionPolicyError,
    kappaFromCoefficients,
    type ReinforcementLayer,
    type Ring,
    type SectionGeometry,
    type SectionProperties,
    sectionProperties,
    type SectionValidationResult,
    validateReinforcement,
    validateSectionGeometry,
    validateSectionProperties,
} from '@baustatik/cross-section';
import type { FEComputation } from '@baustatik/cross-section-fe';
import {
    createCrossSectionViewer,
    type CrossSectionFEMesh,
    CROSS_SECTION_LAYERS,
} from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { convert } from '@baustatik/units';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { createPinia, defineStore } from 'pinia';
import { computeFESection } from './cross-section-fe-port';
import { OUTLINE_PRESETS, type OutlinePreset } from './outline-presets';

// ---------------------------------------------------------------------------
// Was diese Seite zeigt: den ZWEITEN Weg zum Umriss — den, bei dem es nichts
// abzuleiten gibt.
//
// Die Schwesterseite „Mittellinien-Querschnitte" faehrt `kind: 'midline'`: dort
// ist die Eingabe ein Wandgraph, und der Umriss entsteht durch Aufweitung um
// `t/2` (ADR 0037). Hier ist die Eingabe `kind: 'outline'` — Ringe, die den
// Umriss BEREITS beschreiben. `deriveOutlineFromRings` tut nur noch eines: die
// Boegen in Sehnen zerlegen.
//
// DARAUS FOLGEN DREI UNTERSCHIEDE, und sie sind der Grund, warum diese Seite
// neben der anderen steht:
//
//   1. DER „BERECHNEN"-KNOPF IST ZURUECK — ABER FUER ETWAS ANDERES. Hier stand
//      bisher, es gebe keinen: „ein Knopf, der eine Figur in sich selbst
//      verwandelt, waere Zeremonie". Das Argument war richtig und ist mit dem
//      NETZ hinfaellig. Der Umriss entsteht weiterhin sofort — daran hat sich
//      nichts geaendert. Was jetzt einen Klick braucht, ist die FE-Rechnung des
//      Vollquerschnitts: sie vernetzt und faktorisiert, laeuft im Worker und
//      liefert κ, `It` und den Schubmittelpunkt (ADR 0045/0047). Der Knopf
//      heisst deshalb nicht „Berechnen", sondern nennt, was er tut.
//   2. `discretisationTolerance` STATT `miterLimit`. Aufgeweitet wird nichts, also
//      entsteht keine Miter-Ecke, und die Schranke dafuer wirkt schlicht nicht.
//      Was wirkt, ist die Sehnenabweichung der Bogenzerlegung — bei den
//      geraden Saetzen sichtbar dadurch, dass sich NICHTS aendert.
//   3. EINE VERGLEICHSZAHL JE SATZ. Jeder Querschnitt hier hat eine zweite
//      Quelle fuer dieselben Werte: Handrechnung, Mittellinienmodell oder
//      Katalogzeile. Die Abweichung rechnet die Seite aus, nicht der Leser.
//
// Die Abmessungen stehen in `outline-presets.ts`.
// ---------------------------------------------------------------------------

const pinia = createPinia();

/**
 * Der Store haelt ROHDATEN: die Ringe, den daraus erzeugten Umriss und die
 * Erzeugungs-Einstellung — genau das, was nach ADR 0030 und ADR 0033
 * gespeichert wird. Keine Kamera, keine Querschnittswerte: die einen gehoeren
 * dem Viewer, die anderen sind ein ERGEBNIS und stehen weiter unten.
 */
const useStore = defineStore('outline-sections', {
    state: () => ({
        presetId: '',
        rings: [] as Ring[],
        outline: [] as SectionGeometry['outline'],
        // EINGABE und kein Ergebnis (ADR 0064) — deshalb steht sie im Store
        // neben den Ringen und nicht bei `result` weiter unten. ABWESEND
        // heisst "keine Bewehrung", der Regelfall der Stahlfiguren hier.
        reinforcement: undefined as readonly ReinforcementLayer[] | undefined,
        // Der FE-Block gehoert zum SATZ und nicht zum Ergebnis — anders als das
        // Netz daneben (ADR 0039/0045). ABWESEND heisst „noch nicht gerechnet".
        feValues: undefined as FESectionState | undefined,
        // Projektebene, nicht je Querschnitt: dieselbe Zahl beurteilt alle.
        sectionPolicy: DEFAULT_SECTION_POLICY,
    }),
    getters: {
        geometry(state): SectionGeometry {
            return {
                kind: 'outline',
                rings: state.rings,
                outline: state.outline,
                ...(state.feValues === undefined ? {} : { feValues: state.feValues }),
            };
        },
    },
    actions: {
        /**
         * Laedt einen vorgegebenen Querschnitt — und WIRFT DEN UMRISS WEG.
         *
         * Ein Umriss, der zu anderen Ringen gehoert, waere eine Behauptung
         * ueber die neue Figur; das Gate melde ihn beim naechsten Lauf als
         * `OutlineDriftWarning`. Wer laedt, leitet gleich danach neu ab —
         * `calculate()` tut das, und dazwischen liegt kein Bild.
         *
         * KOPIERT WIRD BIS AUF DEN VERTEX, damit die Vorgaben unberuehrt
         * bleiben: der Store ist reaktiv, und ein Klick auf denselben
         * Querschnitt soll dieselbe Figur laden wie beim ersten Mal. Ein
         * flaches `map` ueber die Ringe reichte dafuer NICHT — die Punkte
         * laegen dann weiter in den eingefrorenen Vorgaben.
         */
        load(preset: OutlinePreset) {
            this.presetId = preset.id;
            this.rings = preset.rings.map((ring) => ({
                vertices: ring.vertices.map((vertex) => ({ ...vertex })),
            }));
            this.outline = [];
            // Die Bewehrung gehoert zu DIESEN Ringen — sie wandert mit dem
            // Satz und wird nicht aus dem vorigen uebernommen. Kopiert bis auf
            // das Element, aus demselben Grund wie die Vertices oben.
            this.reinforcement = preset.reinforcement?.map((layer) => ({
                id: layer.id,
                elements: layer.elements.map((element) => ({ ...element })),
            }));
            // Der FE-Block gehoert zu DIESEN Ringen. Ihn stehen zu lassen waere
            // eine Behauptung ueber die neue Figur — das Gate meldete ihn beim
            // naechsten Lauf als Drift gegen den Fingerabdruck (ADR 0045).
            this.feValues = undefined;
        },
        /** Der gerechnete Block in den Satz — ERSETZEND, nicht mutierend. */
        setFEValues(state: FESectionState) {
            this.feValues = state;
        },
        /**
         * Die Sehnenabweichung setzen — als NEUE Policy, nicht als
         * Feldzuweisung.
         *
         * `createSectionPolicy` ist die einzige Tuer, die die Werteregel kennt:
         * `discretisationTolerance > 0`, weil `Arc.toPolyline` die 0 zu Recht zurueckweist
         * (sie verlangte unendlich viele Punkte) und eine negative Toleranz die
         * Gerade abschaffte — `Bulge.isStraight` wuerde nie mehr wahr. Ein
         * direkt gesetztes Feld umginge sie, und die Policy ist ohnehin
         * eingefroren.
         *
         * WIRFT bei einem unzulaessigen Wert (`InvalidSectionPolicyError`). Der
         * Aufrufer faengt und zeigt die Meldung; der Store fuehrt weiter die
         * alte Zahl, denn eine zurueckgewiesene Zahl ist keine Einstellung.
         */
        setArcTolerance(discretisationTolerance: number) {
            this.sectionPolicy = createSectionPolicy({ ...this.sectionPolicy, discretisationTolerance });
            // Andere Toleranz, anderer Umriss, anderer Fingerabdruck.
            this.feValues = undefined;
        },
        /**
         * Die Netzdichte setzen. Sie aendert den Umriss NICHT — sie erzeugt
         * Zahlen, die im Satz gespeichert werden (die dritte Sorte Policy-Feld,
         * ADR 0045). Der bereits gerechnete Block wird trotzdem verworfen: er
         * entstand unter einer anderen Dichte.
         */
        setFEElements(FEElements: number) {
            this.sectionPolicy = createSectionPolicy({ ...this.sectionPolicy, FEElements });
            this.feValues = undefined;
        },
        /**
         * Der Umriss wird ERZEUGT, unter genau der Policy, die daneben im Store
         * steht (ADR 0033).
         *
         * ER STEHT TROTZDEM NEBEN DEN RINGEN UND NICHT AN IHRER STELLE, obwohl
         * er sie in diesem Zweig fast wiederholt: die Ringe tragen `bulge`, der
         * Umriss nicht. Aus dem Umriss fallen die Zahlen, aus den Ringen laesst
         * sich weiterzeichnen — beides wird gebraucht.
         */
        deriveOutline() {
            this.outline = createSectionGeometry(
                { kind: 'outline', rings: this.rings },
                this.sectionPolicy,
            ).outline;
        },
    },
});
const store = useStore(pinia);

const first = OUTLINE_PRESETS[0];
if (first === undefined) throw new Error('Keine Vorgaben in outline-presets.ts.');
store.load(first);

// ---------------------------------------------------------------------------
// Der Viewer. Driver bauen (kennt Konva), Geometrie per PULL aus dem Store.
// ---------------------------------------------------------------------------

const container = element<HTMLDivElement>('container');
const bounds = container.getBoundingClientRect();
const stageSize = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };

/**
 * Massstab und Bildmitte sind FEST — der Viewer kann heute nicht einpassen
 * (`fit` steht als `todo` in `cross-section-viewer/src/viewer.ts`).
 *
 * Der Ursprung der Vorgaben liegt auf der OBERKANTE (`z = 0`), der hoechste
 * Querschnitt ist 500 mm hoch (der Plattenbalken). Damit dessen Mitte in der
 * Bildmitte landet, muss der Weltursprung um `250 · scale` DARUEBER sitzen.
 * Die Skalierung ist dieselbe wie auf der Schwesterseite, damit derselbe
 * Querschnitt dort und hier gleich gross erscheint.
 */
const SCALE = 1.6;
const VIEW_CENTRE_Z = 250;

const driver = createKonvaDriver({
    container,
    width: stageSize.width,
    height: stageSize.height,
    layers: CROSS_SECTION_LAYERS,
});

const viewer = createCrossSectionViewer({
    driver,
    initialViewport: viewport(
        screenPoint(stageSize.width / 2, stageSize.height / 2 - VIEW_CENTRE_Z * SCALE),
        SCALE,
    ),
    getGeometry: () => store.geometry,
    getSectionPolicy: () => store.sectionPolicy,
    getScreenSize: () => stageSize,
    // PULL DES ERGEBNISSES, nicht des Stores: `result` steht weiter unten und
    // wird bei jedem Lauf neu gesetzt. Der Schwerpunkt erscheint damit
    // zusammen mit der Werteliste daneben.
    //
    // Spannungspunkte bleiben aus: fuer eine freie `SectionGeometry` liefert
    // `stressPoints` heute `undefined`.
    //
    // DAS NETZ IST DA, SOBALD DIE FE GELAUFEN IST, und es ist GENAU DAS Netz,
    // auf dem gerechnet wurde — es kommt aus `FEComputation` und wird nicht ein
    // zweites Mal erzeugt (ADR 0039). `Mesh2DResult` passt ohne Umformung in
    // `CrossSectionFEMesh`; der Viewer lernt dadurch keine WASM-Abhaengigkeit.
    // Ob es ZU SEHEN ist, entscheidet die Checkbox darunter — ein `undefined`
    // hier ist der Aus-Zustand desselben Pulls.
    getFEMesh: () => (showMesh ? mesh : undefined),
    // DER VIERTE PULL, und er ist kein Ergebnis-Pull: `undefined` heisst hier
    // "keine Bewehrung" (ADR 0064). Die Checkbox schaltet ihn nach demselben
    // Muster aus wie die Netz-Checkbox darueber.
    getReinforcement: () => (showRebar ? store.reinforcement : undefined),
    getProperties: () => result?.properties,
    grid: { spacing: 10 }, // Weltkoordinaten in mm
});

// Neu gezeichnet wird bei jeder Store-Aenderung; Pan und Zoom laufen intern.
store.$subscribe(() => viewer.requestRender());

// ---------------------------------------------------------------------------
// Die rechte Spalte.
//
// Das Ergebnis liegt NICHT im Store: Querschnittswerte und Befunde sind kein
// Eingabedatum. Sie gehoeren zu genau den Ringen, aus denen sie entstanden
// sind, und werden deshalb bei jedem Lauf neu gesetzt — dieselbe Ueberlegung
// wie bei den Auflagerkraeften in `fem-viewer.ts`.
// ---------------------------------------------------------------------------

/**
 * Ein Befund mit seiner HERKUNFT und seinem KANAL.
 *
 * `source` sagt, welche Tuer des Gates gesprochen hat — die Figur
 * (`validateSectionGeometry`), der Zahlensatz (`validateSectionProperties`)
 * oder die Bewehrung (`validateReinforcement`, ADR 0064). `kind` trennt die
 * beiden Sorten, die ADR 0032
 * ausdruecklich auseinanderhaelt: ein Fehler heisst „nicht rechenbar", eine
 * Warnung heisst „rechenbar, aber unter einer Annahme".
 */
type Finding = {
    source: 'Figur' | 'Werte' | 'Bewehrung';
    kind: 'error' | 'warning';
    message: string;
};

type Result = {
    /** `undefined` heisst: aus diesem Umriss faellt keine Flaeche. */
    properties: SectionProperties | undefined;
    /** Ein Eintrag je Ring des erzeugten Umrisses: seine Punktzahl. */
    rings: number[];
    findings: Finding[];
};

let result: Result | undefined;

/**
 * Das Netz, unter dem gerechnet wurde — TRANSIENT, neben dem Satz und nicht in
 * ihm (ADR 0039).
 *
 * VERWORFEN, sobald sich `discretisationTolerance`, `FEElements` oder die
 * Vorgabe aendert. Dieselbe Regel wie `reactions = undefined` in
 * `fem-viewer.ts`: ein Ergebnis ist keine Eingabe, und ein Netz zur alten
 * Einstellung behauptete etwas ueber die gerade gezeigte Figur.
 */
let mesh: CrossSectionFEMesh | undefined;

/** Der Zustand des FE-Knopfs. Gehoert der Oberflaeche, nicht dem Store. */
let computing = false;

/**
 * Ob das gerechnete Netz zu sehen ist — der Schalter NEben dem FE-Knopf.
 *
 * Gehoert wie `computing` der Oberflaeche, nicht dem Store: das Netz selbst
 * bleibt ein transientes Ergebnis (ADR 0039), und die Sichtbarkeitsfrage ist
 * keine Frage an die gespeicherte Figur. Ein `undefined` im `getFEMesh`-Pull
 * ist genau der Aus-Zustand, den der Viewer kennt.
 */
let showMesh = true;
let showRebar = true;

// Druckeinheiten wie im Bericht der Beispiele: das Package liefert SI
// (ADR 0024), gezeigt werden die Katalogeinheiten, gegen die man eine
// Profiltabelle haelt. Die Faktoren stehen an EINER Stelle.
const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');
const M_TO_MM = convert(1).from('m').toExact('mm');

const presetList = element<HTMLUListElement>('presets');
const presetName = element<HTMLDivElement>('preset-name');
const presetDimensions = element<HTMLDivElement>('preset-dimensions');
const presetNote = element<HTMLParagraphElement>('preset-note');
const outlineStatus = element<HTMLDivElement>('outline-status');
const propertiesField = element<HTMLDivElement>('properties');
const comparisonField = element<HTMLDivElement>('comparison');
const warningList = element<HTMLUListElement>('warnings');
const errorList = element<HTMLUListElement>('errors');
const warningCount = element<HTMLSpanElement>('warning-count');
const errorCount = element<HTMLSpanElement>('error-count');
const discretisationToleranceField = element<HTMLInputElement>('discretisation-tolerance');
const discretisationToleranceSlider = element<HTMLInputElement>('discretisation-tolerance-slider');
const discretisationToleranceNote = element<HTMLDivElement>('discretisation-tolerance-note');
const feElementsField = element<HTMLInputElement>('fe-elements');
const computeFEButton = element<HTMLButtonElement>('compute-fe');
const feStatus = element<HTMLDivElement>('fe-status');
const showMeshToggle = element<HTMLInputElement>('show-mesh');
const showRebarToggle = element<HTMLInputElement>('show-rebar');
const reinforcementField = element<HTMLDivElement>('reinforcement');

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`Element #${id} fehlt in outline-sections.html.`);
    return found as T;
}

// Die Auswahlliste steht einmal; markiert wird sie bei jedem Neuaufbau der
// Spalte ueber `aria-pressed`.
for (const preset of OUTLINE_PRESETS) {
    const line = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preset = preset.id;
    button.append(preset.name);

    const dimensions = document.createElement('span');
    dimensions.className = 'dim';
    dimensions.textContent = preset.dimensions;
    button.append(dimensions);

    button.addEventListener('click', () => {
        store.load(preset);
        calculate();
    });

    line.append(button);
    presetList.append(line);
}

/**
 * Rechnet den angezeigten Querschnitt: Umriss erzeugen, Werte ermitteln, Gate
 * fragen.
 *
 * DIE REIHENFOLGE IST DIE DER KETTE. Der Umriss entsteht zuerst, weil aus ihm
 * die Zahlen fallen; das Gate kommt zuletzt, weil es beide beurteilt — die
 * Figur mit `validateSectionGeometry`, den Zahlensatz mit
 * `validateSectionProperties`. Geworfen wird nirgends: ein Querschnitt, aus dem
 * sich nichts rechnen laesst, liefert `undefined` und einen Befund, keine
 * Ausnahme.
 */
function calculate(): void {
    store.deriveOutline();
    // DAS NETZ WIRD VERWORFEN, sobald die Figur oder die Einstellung sich
    // bewegt. Der Toleranzregler feuert auf jedem `input`-Ereignis; ein `await`
    // hier hiesse ein Netz je Tastendruck — deshalb rechnet die FE nur auf
    // Klick, und dazwischen steht kein Netz im Bild.
    mesh = undefined;
    feStatus.textContent = '';
    recompute();

    // Neu zeichnen, weil jetzt der Umriss im Satz steht. Das Store-Abonnement
    // hat das bereits getan — der Aufruf hier schadet nicht und macht die
    // Abhaengigkeit sichtbar, falls das Abonnement einmal wegfaellt.
    viewer.requestRender();
    renderPanel();
}

// ---------------------------------------------------------------------------
// Der FE-Lauf.
//
// EIN KLICK, EIN LAUF, KEINE VERFEINERUNG. Was hier passiert, ist der
// Aufloesungsschritt aus ADR 0045 in seiner kleinsten Fassung: EIN Querschnitt,
// kein Modell. Der Port schickt die Geometrie in den Worker, dort laufen Mesher
// und Loeser, und zurueck kommen zwei Dinge — der Satz-Anteil (`feValues`, geht
// IN den Store) und das Netz (bleibt daneben).
// ---------------------------------------------------------------------------

computeFEButton.addEventListener('click', () => void runFE());

/** Der Netz-Schalter: umschalten, neu zeichnen — das Ergebnis bleibt stehen. */
showRebarToggle.addEventListener('change', () => {
    showRebar = showRebarToggle.checked;
    viewer.requestRender();
});

showMeshToggle.addEventListener('change', () => {
    showMesh = showMeshToggle.checked;
    viewer.requestRender();
});

async function runFE(): Promise<void> {
    computing = true;
    computeFEButton.disabled = true;
    feStatus.textContent = 'Vernetzt und löst …';
    // Erst weg, dann rechnen: kein Zweig, in dem ein altes Netz eine
    // fehlgeschlagene Rechnung ueberlebt.
    mesh = undefined;
    viewer.requestRender();

    try {
        const computation = await computeFESection(store.geometry, store.sectionPolicy);
        store.setFEValues(computation.state);
        // NARROWT AUF `kind` (ADR 0061): der `'refused'`-Arm traegt weder Netz
        // noch Felder, und das steht seit ADR 0061 im TYP statt in einem `?`.
        mesh =
            computation.kind === 'solved' ? toSceneMesh(computation.mesh) : undefined;
        feStatus.textContent = feSummary(computation);
    } catch (error) {
        // Der Fehlerzweig ist sichtbar, und der Satz bleibt LEER statt halb
        // gefuellt.
        mesh = undefined;
        feStatus.textContent = `Fehlgeschlagen: ${
            error instanceof Error ? error.message : String(error)
        }`;
    } finally {
        computing = false;
        // Neu rechnen mit dem gefuellten Satz: `sectionProperties` liest den
        // FE-Block, und erst danach stehen `It`, `yM`/`zM` in der Tabelle.
        store.deriveOutline();
        recompute();
        viewer.requestRender();
        renderPanel();
    }
}

/**
 * Was der Lauf ergeben hat, in einem Satz.
 *
 * ZWEI ACHSEN, UND SIE FALLEN NICHT ZUSAMMEN: `kind` sagt, ob VERNETZT UND
 * GELOEST wurde, `state.status`, ob ein SATZ herauskam. Ein Abbruch nach dem
 * Vernetzen laesst `kind: 'solved'` stehen und traegt trotzdem
 * `status: 'unsupported'` — genau der Fall, wegen dem die Union nicht auf
 * `status` diskriminiert (ADR 0061).
 */
function feSummary(computation: FEComputation): string {
    const state = computation.state;
    const elements =
        computation.kind === 'solved' ? computation.mesh.elements.length / 6 : 0;
    if (state.status === 'unsupported') {
        const reason = 'Zwei getrennte Materialflächen — das Stabmodell trägt sie nicht.';
        const withIt =
            state.It === undefined
                ? ''
                : ` It bleibt unberührt: ${(state.It * M4_TO_CM4).toFixed(2)} cm⁴.`;
        return `Verweigert. ${reason}${withIt}`;
    }
    const nu = 0.3;
    const kappaZ = kappaFromCoefficients(state.values.inverseKappaZ, nu);
    const kappaZero = kappaFromCoefficients(state.values.inverseKappaZ, 0);
    return (
        `${elements} Tri6-Elemente. ` +
        `κ_z(ν=0) = ${kappaZero?.toFixed(6)}, κ_z(ν=0,3) = ${kappaZ?.toFixed(6)}.`
    );
}

/**
 * Das Netz in die Bildebene bringen: M eine Umrechnung, und die ist es.
 *
 * `computeFESection` rechnet in SI (ADR 0024) — die Koordinaten des Netzes
 * sind Meter. Der Viewer zeichnet `CrossSectionFEMesh.points` dagegen direkt
 * als Millimeter (dort heisst es „liegen bereits in y/z-Millimetern"). Ohne
 * die Umrechnung kollabierte der ganze Drahtgitter zu einem Punkt: eine
 * 500 mm-Figur schriebe sich als 0,5 Welt-Einheit.
 *
 * Die Faktoren stehen an der einen Stelle oben (`M_TO_MM`), NICHT als
 * Literal hier.
 */
function toSceneMesh(mesh: CrossSectionFEMesh): CrossSectionFEMesh {
    const points = new Float64Array(mesh.points.length);
    for (let index = 0; index < mesh.points.length; index += 1) {
        points[index] = mesh.points[index]! * M_TO_MM;
    }
    return { ...mesh, points };
}

/** Die Werte und Befunde neu bilden, ohne den Umriss anzufassen. */
function recompute(): void {
    const geometry = store.geometry;
    const section: CrossSection = {
        kind: 'section-geometry',
        id: store.presetId,
        geometry,
        ...(store.reinforcement === undefined
            ? {}
            : { reinforcement: store.reinforcement }),
    };
    const properties = sectionProperties(section, store.sectionPolicy);

    const shape = validateSectionGeometry(geometry, store.sectionPolicy);
    const values: SectionValidationResult =
        properties === undefined
            ? { errors: [], warnings: [] }
            : validateSectionProperties(properties, store.sectionPolicy);

    // DIE DRITTE TUER, und sie nimmt den SATZ und nicht die Geometrie
    // (ADR 0064): das Feld sitzt eine Ebene ueber `SectionGeometry`.
    const rebar = validateReinforcement(section, store.sectionPolicy);

    result = {
        properties,
        rings: geometry.outline.map((polygon) => polygon.points.length),
        findings: [
            ...findings('Figur', shape),
            ...findings('Werte', values),
            ...findings('Bewehrung', rebar),
        ],
    };
}

/** Beide Kanaele einer Gate-Tuer, mit ihrer Herkunft versehen. */
function findings(source: Finding['source'], from: SectionValidationResult): Finding[] {
    return [
        ...from.errors.map((error): Finding => ({ source, kind: 'error', message: error.message })),
        ...from.warnings.map(
            (warning): Finding => ({ source, kind: 'warning', message: warning.message }),
        ),
    ];
}

// ---------------------------------------------------------------------------
// Die Sehnenabweichung zum Anfassen.
//
// ZWEI FELDER AUF EINER ZAHL: der Schieber zum Ausprobieren, das Zahlenfeld
// fuer den genauen Wert — und fuer den Blick auf die Werteregel, denn eine `0`
// weist `createSectionPolicy` zurueck.
//
// ZUM ZUSEHEN TAUGEN DIE SAETZE MIT BOGEN. Rechteck und geschweisstes I haben
// keinen einzigen: ihre Punktzahl steht fest, ihre Zahlen ruehren sich nicht,
// und dass sie sich NICHT ruehren, ist die halbe Aussage. Beim IPE 300 und beim
// Hohlkasten wandern Punktzahl und Abweichung sichtbar mit.
// ---------------------------------------------------------------------------

for (const input of [discretisationToleranceField, discretisationToleranceSlider]) {
    input.addEventListener('input', () => applyArcTolerance(input.value));
}

// `change` statt `input`: die Elementzahl wird getippt, und bei jedem
// Zwischenstand eine Policy zu bauen hiesse, `1` und `40` abzuweisen, bevor die
// `4000` fertig ist.
feElementsField.addEventListener('change', () => {
    try {
        store.setFEElements(Number(feElementsField.value));
        feStatus.textContent = '';
    } catch (error) {
        if (!(error instanceof InvalidSectionPolicyError)) throw error;
        feStatus.textContent = error.message;
        return;
    }
    calculate();
});

/**
 * Die neue Toleranz in den Store — und den Umriss NACHZIEHEN.
 *
 * Der gezeichnete Umriss ist unter der ALTEN Zahl entstanden. Ihn stehen zu
 * lassen waere genau die Drift, gegen die ADR 0033 die Policy neben den Umriss
 * legt: das Bild zeigte eine Figur, die zur angezeigten Einstellung nicht
 * gehoert. Auf dieser Seite wird deshalb SOFORT neu erzeugt — es gibt keinen
 * Zwei-Schritt, den man abwarten muesste.
 */
function applyArcTolerance(raw: string): void {
    try {
        store.setArcTolerance(Number(raw.replace(',', '.')));
    } catch (error) {
        if (!(error instanceof InvalidSectionPolicyError)) throw error;
        renderArcTolerance(error.message);
        return;
    }

    renderArcTolerance();
    calculate();
}

/**
 * Die beiden Felder und die Notiz darunter — aus dem STORE gelesen, nicht aus
 * dem Ereignis: gezeigt wird die Zahl, die gilt.
 *
 * GLEICHGEZOGEN WIRD NUR BEI GUELTIGER ZAHL. Sonst risse man dem Tippenden die
 * halb geschriebene Zahl unter den Fingern weg — und die zurueckgewiesene steht
 * ja gerade zur Ansicht da.
 */
function renderArcTolerance(problem?: string): void {
    const { discretisationTolerance } = store.sectionPolicy;

    if (problem === undefined) {
        const text = String(discretisationTolerance);
        for (const input of [discretisationToleranceField, discretisationToleranceSlider]) {
            if (input.value !== text) input.value = text;
        }
    }

    discretisationToleranceNote.className = problem === undefined ? 'note' : 'note problem';
    discretisationToleranceNote.textContent =
        problem ??
        `Ein Viertelkreis mit r = 15 mm bekommt darunter ${quarterSegments(15, discretisationTolerance)} ` +
            `Sehnen, einer mit r = 30 mm ${quarterSegments(30, discretisationTolerance)}. ` +
            'miterLimit wirkt auf dieser Seite nicht — es wird nichts aufgeweitet.';
}

/**
 * Wie viele Sehnen ein VIERTELKREIS unter dieser Toleranz bekommt.
 *
 * Der Stich einer Sehne ueber dem Winkel `δ` ist `r·(1 − cos(δ/2))`; zulaessig
 * ist er bis `tolerance`, also `δ = 2·acos(1 − tolerance/r)`. Aufgeteilt wird
 * ein Viertelkreis in `ceil((π/2)/δ)` gleiche Stuecke.
 *
 * NACHGERECHNET UND NICHT ABGELESEN: die Zahl steht hier nur zur Anschauung
 * neben dem Regler. Was tatsaechlich erzeugt wurde, sagt die Punktzahl der
 * Ringe weiter oben — sie kommt aus `Arc.toPolyline` selbst.
 *
 * Bei `tolerance >= r` ist der Stich nie zu gross; dann bleibt es bei einer
 * Sehne, und die Kante gilt ohnehin als gerade.
 */
function quarterSegments(radius: number, tolerance: number): number {
    if (tolerance >= radius) return 1;
    const delta = 2 * Math.acos(1 - tolerance / radius);
    return Math.ceil(Math.PI / 2 / delta);
}

function renderPanel(): void {
    const preset = OUTLINE_PRESETS.find((candidate) => candidate.id === store.presetId);
    for (const button of presetList.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.preset === store.presetId));
    }

    computeFEButton.disabled = computing;
    if (feElementsField.value !== String(store.sectionPolicy.FEElements)) {
        feElementsField.value = String(store.sectionPolicy.FEElements);
    }

    presetName.textContent = preset?.name ?? '–';
    presetDimensions.textContent = preset === undefined ? '' : `${preset.dimensions} [mm]`;
    presetNote.textContent = preset?.note ?? '';

    const vertexCount = store.rings.map((ring) => ring.vertices.length);
    if (result === undefined) {
        outlineStatus.textContent =
            `${store.rings.length} Ring(e) mit ${vertexCount.join(' / ')} Punkten — ` +
            'noch nicht erzeugt.';
        propertiesField.innerHTML = '<p class="muted">Noch nicht berechnet.</p>';
        comparisonField.innerHTML = '';
        reinforcementField.innerHTML = reinforcementTable(store.reinforcement);
        fillFindings([]);
        return;
    }

    // ZWEI PUNKTZAHLEN NEBENEINANDER, und der Unterschied ist die ganze
    // Zerlegung: links die Eingabe mit `bulge`, rechts das Ergebnis in Sehnen.
    // Bei den geraden Saetzen sind beide Zahlen gleich.
    outlineStatus.textContent =
        result.rings.length === 0
            ? 'Kein Umriss erzeugt.'
            : `Eingabe: ${vertexCount.join(' / ')} Vertices — Umriss: ${result.rings.join(' / ')} ` +
              `Punkte (discretisationTolerance ${store.sectionPolicy.discretisationTolerance} mm).`;
    propertiesField.innerHTML =
        result.properties === undefined
            ? '<p class="muted">sectionProperties &rarr; undefined — aus diesem Umriss faellt keine Flaeche.</p>'
            : propertyTable(result.properties);
    comparisonField.innerHTML =
        preset === undefined || result.properties === undefined
            ? '<p class="muted">Kein Vergleich.</p>'
            : comparisonTable(preset, result.properties);
    reinforcementField.innerHTML = reinforcementTable(store.reinforcement);
    fillFindings(result.findings);
}

/**
 * Die Werte in Katalogeinheiten — dieselbe Tabelle wie auf den beiden anderen
 * Seiten, damit sich die Wege vergleichen lassen.
 *
 * `It`, der Schubmittelpunkt und kappa stehen als „nicht ermittelt", solange der
 * FE-Lauf nicht stattgefunden hat — das gehoert ins Bild, eine weggelassene
 * Zeile saehe aus wie eine Null.
 *
 * kappa STEHT ALS FORMEL, nicht als Zahl: der Vollquerschnitt speichert
 * `1/kappa = d0 + d2·m²` mit `m = ν/(1+ν)`, und ν gehoert dem Stabmaterial und
 * nicht dem Querschnitt (ADR 0045). Gezeigt wird deshalb ausgewertet fuer zwei
 * Werte — ν = 0 und ν = 0,3 —, und der Unterschied dazwischen ist genau die
 * Groesse, die eine einzelne gespeicherte Zahl verschluckt haette.
 */
function propertyTable(p: SectionProperties): string {
    return `
<table class="values">
  <tbody>
    ${row('A', number(p.A * M2_TO_CM2, 'cm²'))}
    ${row('Iy', number(p.Iy * M4_TO_CM4, 'cm⁴'))}
    ${row('Iz', number(p.Iz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iyz', number(p.Iyz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iu', number(p.Iu * M4_TO_CM4, 'cm⁴'))}
    ${row('Iv', number(p.Iv * M4_TO_CM4, 'cm⁴'))}
    ${row('alpha', `${((p.alpha * 180) / Math.PI).toFixed(3)} °`)}
    ${row('ys', number(p.ys * M_TO_MM, 'mm'))}
    ${row('zs', number(p.zs * M_TO_MM, 'mm'))}
    ${row('yM', maybe(p.yM === undefined ? undefined : p.yM * M_TO_MM, 'mm'))}
    ${row('zM', maybe(p.zM === undefined ? undefined : p.zM * M_TO_MM, 'mm'))}
    ${row('It', maybe(p.It === undefined ? undefined : p.It * M4_TO_CM4, 'cm⁴'))}
    ${row('kappaY (ν=0)', kappa(p.kappaY ?? kappaFromCoefficients(p.inverseKappaY, 0)))}
    ${row('kappaZ (ν=0)', kappa(p.kappaZ ?? kappaFromCoefficients(p.inverseKappaZ, 0)))}
    ${row('kappaY (ν=0,3)', kappa(p.kappaY ?? kappaFromCoefficients(p.inverseKappaY, 0.3)))}
    ${row('kappaZ (ν=0,3)', kappa(p.kappaZ ?? kappaFromCoefficients(p.inverseKappaZ, 0.3)))}
  </tbody>
</table>`;
}

/**
 * Der Vergleich gegen die zweite Quelle — DER ZWECK DIESER SEITE.
 *
 * Drei Spalten: was aus dem Umriss faellt, was die zweite Quelle sagt, und die
 * relative Abweichung. Sie steht in Prozent und nicht als Differenz, weil
 * `600 cm²` und `8356 cm⁴` sonst nicht nebeneinander lesbar waeren.
 *
 * DIE ABWEICHUNG WIRD NICHT BEWERTET, nur gezeigt. Ob `0,02 %` gegen eine
 * gerundete Katalogzeile in Ordnung sind, sagt der `note`-Text des Satzes —
 * eine Ampel hier behauptete eine Schranke, die es nicht gibt.
 */
function comparisonTable(preset: OutlinePreset, p: SectionProperties): string {
    const { reference } = preset;
    const lines = [
        line('A', p.A * M2_TO_CM2, reference.A, 'cm²'),
        line('Iy', p.Iy * M4_TO_CM4, reference.Iy, 'cm⁴'),
        line('Iz', p.Iz * M4_TO_CM4, reference.Iz, 'cm⁴'),
    ];

    return `
<table class="values compare">
  <thead>
    <tr><th></th><td>Umriss</td><td>Vergleich</td><td>Δ</td></tr>
  </thead>
  <tbody>${lines.join('')}</tbody>
</table>
<p class="note">Vergleich: ${reference.label}</p>`;

    function line(label: string, computed: number, expected: number, unit: string): string {
        const delta = ((computed - expected) / expected) * 100;
        return (
            `<tr><th scope="row">${label} <span class="unit">${unit}</span></th>` +
            `<td>${computed.toFixed(2)}</td>` +
            `<td>${expected.toFixed(2)}</td>` +
            `<td>${percent(delta)}</td>` +
            `</tr>`
        );
    }
}

/**
 * Die Abweichung in Prozent — mit einer eigenen Schreibweise fuer die NULL.
 *
 * Eine exakte Uebereinstimmung als `0,000 %` zu drucken laedt zu der Frage ein,
 * ob da nur gerundet wurde. `exakt` sagt, was gemeint ist: der Umriss und die
 * Vergleichsquelle liefern dieselbe Gleitkommazahl bis auf das letzte Bit —
 * beim Rechteck gegen die Formel ist das der Fall.
 */
function percent(delta: number): string {
    if (delta === 0) return 'exakt';
    if (Math.abs(delta) < 0.0005) return `${delta > 0 ? '+' : '−'}0,000 %`;
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)} %`;
}

/**
 * Eine Tabelle je Lage — `id · y · z · As · Asmax`
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * EINGABEEINHEITEN OHNE UMRECHNUNG: die Lage in mm, die Flaechen in cm² — genau
 * so, wie sie im Satz stehen und wie ein Bewehrungsplan sie schreibt. Zwischen
 * dem Geschriebenen und dem Gelesenen sitzt damit kein Faktor.
 *
 * `Asmax` ABWESEND STEHT ALS "unbegrenzt" DA und nicht als leere Zelle: eine
 * leere Zelle saehe aus wie eine vergessene Eingabe. Ist sie gleich `As`, sagt
 * die Zeile "eingefroren" — das ist die Bedeutung, nicht die Zahl.
 *
 * EINE LAGE IST DER BEWEHRUNGSRANG, es gibt keine zweite Gruppierung; die
 * Ueberschrift je Tabelle ist deshalb die `id`, an der die Bemessung dreht.
 */
function reinforcementTable(
    layers: readonly ReinforcementLayer[] | undefined,
): string {
    if (layers === undefined || layers.length === 0) {
        return '<p class="muted">Keine Bewehrung — der Regelfall jedes Stahl- und Holzquerschnitts.</p>';
    }

    return layers
        .map((layer) => {
            const rows = layer.elements
                .map(
                    (element) =>
                        `<tr><th scope="row">${element.id}</th>` +
                        `<td>${element.y.toFixed(0)}</td>` +
                        `<td>${element.z.toFixed(0)}</td>` +
                        `<td>${element.As.toFixed(2)}</td>` +
                        `<td>${ceiling(element.As, element.Asmax)}</td></tr>`,
                )
                .join('');
            const sum = layer.elements.reduce(
                (total, element) => total + element.As,
                0,
            );
            return `
<h3 class="layer">Lage ${layer.id}</h3>
<table class="values compare">
  <thead>
    <tr><th></th><td>y [mm]</td><td>z [mm]</td><td>As [cm²]</td><td>Asmax [cm²]</td></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p class="note">Summe As = ${sum.toFixed(2)} cm² — der ANFANGSWERT der Bemessung.</p>`;
        })
        .join('');
}

/** Was in der `Asmax`-Spalte steht: eine Zahl, "unbegrenzt" oder "eingefroren". */
function ceiling(As: number, Asmax: number | undefined): string {
    if (Asmax === undefined) return 'unbegrenzt';
    return Asmax === As ? `${Asmax.toFixed(2)} (eingefroren)` : Asmax.toFixed(2);
}
function row(label: string, value: string): string {
    return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function number(value: number, unit: string, digits = 2): string {
    return `${value.toFixed(digits)} ${unit}`;
}

function maybe(value: number | undefined, unit: string): string {
    return value === undefined ? 'nicht ermittelt' : number(value, unit);
}

function kappa(value: number | undefined): string {
    return value === undefined ? 'schubstarr' : value.toFixed(4);
}

/** Warnungen und Fehler in ihre Listen, getrennt nach Kanal. */
function fillFindings(all: readonly Finding[]): void {
    const warnings = all.filter((finding) => finding.kind === 'warning');
    const errors = all.filter((finding) => finding.kind === 'error');
    fill(warningList, warningCount, warnings, 'Keine Hinweise.');
    fill(errorList, errorCount, errors, 'Keine Fehler.');
}

function fill(
    list: HTMLUListElement,
    counter: HTMLSpanElement,
    entries: readonly Finding[],
    empty: string,
): void {
    counter.textContent = String(entries.length);
    list.replaceChildren(
        ...(entries.length === 0
            ? [item(empty, undefined)]
            : entries.map((entry) => item(entry.message, entry.source))),
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

renderArcTolerance();
calculate();

// Zum Ausprobieren in der Konsole:
//
//   store.geometry                       der Satz, wie er gespeichert wuerde
//   store.rings                          die Ringe mit bulge — die Eingabe
//   store.reinforcement                  die Bewehrungslagen (ADR 0064)
//   store.outline                        die Sehnenzuege — das Ergebnis
//   store.sectionPolicy                  die Einstellung, unter der es entstand
//   store.setArcTolerance(0.5)           groebere Zerlegung (dann calculate())
//   store.setFEElements(20000)           feineres Netz (dann runFE())
//   calculate()                          neu erzeugen, rechnen, zeichnen
//   await runFE()                        vernetzen, loesen, feValues fuellen
//   store.feValues                       der FE-Block, wie er gespeichert wuerde
//   OUTLINE_PRESETS.map((p) => p.id)     die Auswahl
Object.assign(globalThis, {
    store,
    viewer,
    OUTLINE_PRESETS,
    calculate,
    renderArcTolerance,
    runFE,
});
