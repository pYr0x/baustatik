import {
    createSectionGeometry,
    createSectionPolicy,
    type CrossSection,
    DEFAULT_SECTION_POLICY,
    type Idealisation,
    InvalidSectionPolicyError,
    type SectionGeometry,
    type SectionNode,
    type SectionProperties,
    sectionProperties,
    type SectionValidationResult,
    validateSectionGeometry,
    validateSectionProperties,
    type Wall,
} from '@baustatik/cross-section';
import { createCrossSectionViewer, CROSS_SECTION_LAYERS } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { convert } from '@baustatik/units';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { createPinia, defineStore } from 'pinia';
import { SECTION_PRESETS, type SectionPreset } from './section-presets';

// ---------------------------------------------------------------------------
// Was diese Seite zeigt: den WEG vom Wandgraphen zu den Zahlen, in zwei
// getrennten Schritten.
//
//   1. Ein Klick links laedt einen vorgegebenen Querschnitt in den Store. Zu
//      sehen sind dann nur die Wandmittellinien — die EINGABE.
//   2. „Berechnen" leitet den Umriss ab (`createSectionGeometry`, ADR 0037),
//      rechnet die Querschnittswerte aus ihm (Green, ADR 0035) und fragt das
//      Gate (ADR 0032). Erst danach steht die orange Umrisslinie im Bild.
//
// Die Trennung ist Absicht: der Umriss reist zwar IM Satz mit (ADR 0030), ist
// aber ABGELEITET. Wer ihn erst auf Knopfdruck entstehen sieht, verwechselt ihn
// nicht mit der Eingabe.
//
// Jeder Querschnitt ist `kind: 'midline'`; die Idealisierung ist WAEHLBAR.
// `thin-walled` laesst den Wandweg laufen, `solid` behandelt dieselbe Figur
// als Vollquerschnitt — der Umriss faellt daraus, aber κ, der Schubmittelpunkt
// und `It` bleiben „nicht ermittelt" (Grashof ist erst P4; ADR 0029).
// Die Abmessungen stehen in `section-presets.ts` und stammen aus
// `packages/cross-section/examples` — die Zahlen dieser Seite lassen sich damit
// gegen die Seite „Parametrische Querschnitte" halten.
// ---------------------------------------------------------------------------

const pinia = createPinia();

/**
 * Der Store haelt ROHDATEN: den Wandgraphen, den daraus abgeleiteten Umriss und
 * die Erzeugungs-Einstellung — genau das, was nach ADR 0030 und ADR 0033
 * gespeichert wird. Keine Kamera, keine Querschnittswerte: die einen gehoeren
 * dem Viewer, die anderen sind ein ERGEBNIS und stehen weiter unten.
 */
const useStore = defineStore('midline-sections', {
    state: () => ({
        presetId: '',
        nodes: [] as SectionNode[],
        walls: [] as Wall[],
        outline: [] as SectionGeometry['outline'],
        // Je Querschnitt, nicht projektweit: die Idealisierung ist Teil des
        // Modellsatzes (ADR 0029) und hier umschaltbar, damit dieselbe Figur
        // als duennwandig und als Vollquerschnitt berechenbar steht.
        idealisation: 'thin-walled' as Idealisation,
        // Projektebene, nicht je Querschnitt: dieselbe Zahl beurteilt alle.
        sectionPolicy: DEFAULT_SECTION_POLICY,
    }),
    getters: {
        geometry(state): SectionGeometry {
            return {
                kind: 'midline',
                idealisation: state.idealisation,
                nodes: state.nodes,
                walls: state.walls,
                outline: state.outline,
            };
        },
    },
    actions: {
        /**
         * Laedt einen vorgegebenen Querschnitt — und WIRFT DEN UMRISS WEG.
         *
         * Ein Umriss, der zu einem anderen Wandgraphen gehoert, waere eine
         * Behauptung ueber die neue Figur; das Gate melde ihn beim naechsten
         * Lauf als `OutlineDriftWarning`. Leer heisst „noch nicht abgeleitet",
         * und der Viewer zeichnet dann eben nur die Waende.
         *
         * KOPIERT WIRD JEDER SATZ, damit die Vorgaben unberuehrt bleiben: der
         * Store ist reaktiv, und ein Klick auf denselben Querschnitt soll
         * dieselbe Figur laden wie beim ersten Mal.
         */
        load(preset: SectionPreset) {
            this.presetId = preset.id;
            this.nodes = preset.nodes.map((node) => ({ ...node }));
            this.walls = preset.walls.map((wall) => ({ ...wall }));
            this.outline = [];
        },
        /**
         * Die Miter-Schranke setzen — als NEUE Policy, nicht als Feldzuweisung.
         *
         * `createSectionPolicy` ist die einzige Tuer, die die Werteregel kennt:
         * `miterLimit > 1`, weil Clipper2 jeden Wert bis `1` STILL durch `2`
         * ersetzt. Ein direkt gesetztes Feld umginge sie — und die Policy ist
         * ohnehin eingefroren.
         *
         * WIRFT bei einem unzulaessigen Wert (`InvalidSectionPolicyError`). Der
         * Aufrufer faengt und zeigt die Meldung; der Store fuehrt weiter die
         * alte Zahl, denn eine zurueckgewiesene Zahl ist keine Einstellung.
         */
        setMiterLimit(miterLimit: number) {
            this.sectionPolicy = createSectionPolicy({ ...this.sectionPolicy, miterLimit });
        },
        /**
         * Der Umriss wird ABGELEITET, unter genau der Policy, die daneben im
         * Store steht (ADR 0033). Von Hand gesetzt waere er eine zweite
         * Wahrheit ueber dieselbe Figur.
         */
        deriveOutline() {
            this.outline = createSectionGeometry(
                {
                    kind: 'midline',
                    idealisation: this.idealisation,
                    nodes: this.nodes,
                    walls: this.walls,
                },
                this.sectionPolicy,
            ).outline;
        },
        /**
         * Die Deutung der Figur umschalten — als Feldschreibung, denn beide
         * Werte von `Idealisation` sind zulaessig und es gibt keine eigene
         * Werteregel wie beim `miterLimit`.
         */
        setIdealisation(idealisation: Idealisation) {
            this.idealisation = idealisation;
        },
    },
});
const store = useStore(pinia);

const first = SECTION_PRESETS[0];
if (first === undefined) throw new Error('Keine Vorgaben in section-presets.ts.');
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
 * Querschnitt ist 400 mm hoch. Damit dessen Mitte in der Bildmitte landet, muss
 * der Weltursprung um `200 · scale` DARUEBER sitzen. Ohne das haenge jeder
 * Querschnitt unter dem Bildrand.
 */
const SCALE = 1.6;
const VIEW_CENTRE_Z = 200;

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
    // wird beim Laden eines anderen Querschnitts verworfen. Damit erscheinen
    // Schwerpunkt und — wo bestimmt — Schubmittelpunkt erst nach „Berechnen"
    // und verschwinden wieder, sobald das Ergebnis nicht mehr gilt.
    //
    // Spannungspunkte und Netz bleiben hier aus: fuer eine freie
    // `SectionGeometry` liefert `stressPoints` heute `undefined`, und vernetzt
    // wird auf dieser Seite nicht.
    getProperties: () => result?.properties,
    grid: { spacing: 10 }, // Weltkoordinaten in mm
});

// Pan und Zoom laufen intern; neu gezeichnet wird ausserdem bei jeder
// Store-Aenderung — Laden eines Querschnitts und Ableiten des Umrisses.
store.$subscribe(() => viewer.requestRender());

// ---------------------------------------------------------------------------
// Die rechte Spalte.
//
// Das Ergebnis liegt NICHT im Store: Querschnittswerte und Befunde sind kein
// Eingabedatum. Sie gehoeren zu genau dem Wandgraphen, aus dem sie entstanden
// sind, und werden deshalb beim Laden eines anderen Querschnitts verworfen —
// dieselbe Ueberlegung wie bei den Auflagerkraeften in `fem-viewer.ts`.
//
// Verworfen wird HIER und nicht in einem `$subscribe`: die einzigen beiden
// Aenderungen am Store sind `load` (dann ist das Ergebnis hinfaellig) und
// `deriveOutline` (dann entsteht es gerade). Ein Abonnement muesste die zweite
// vom ersten unterscheiden.
// ---------------------------------------------------------------------------

/**
 * Ein Befund mit seiner HERKUNFT und seinem KANAL.
 *
 * `source` sagt, welche Tuer des Gates gesprochen hat — die Figur
 * (`validateSectionGeometry`) oder der Zahlensatz
 * (`validateSectionProperties`). `kind` trennt die beiden Sorten, die ADR 0032
 * ausdruecklich auseinanderhaelt: ein Fehler heisst „nicht rechenbar", eine
 * Warnung heisst „rechenbar, aber unter einer Annahme".
 */
type Finding = {
    source: 'Figur' | 'Werte';
    kind: 'error' | 'warning';
    message: string;
};

type Result = {
    /** `undefined` heisst: aus diesem Umriss faellt keine Flaeche. */
    properties: SectionProperties | undefined;
    /** Ein Eintrag je Ring des abgeleiteten Umrisses: seine Punktzahl. */
    rings: number[];
    findings: Finding[];
};

let result: Result | undefined;

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
const calculateButton = element<HTMLButtonElement>('calculate');
const outlineStatus = element<HTMLDivElement>('outline-status');
const propertiesField = element<HTMLDivElement>('properties');
const warningList = element<HTMLUListElement>('warnings');
const errorList = element<HTMLUListElement>('errors');
const warningCount = element<HTMLSpanElement>('warning-count');
const errorCount = element<HTMLSpanElement>('error-count');
const miterLimitField = element<HTMLInputElement>('miter-limit');
const miterLimitSlider = element<HTMLInputElement>('miter-limit-slider');
const miterLimitNote = element<HTMLDivElement>('miter-limit-note');
const idealisationThin = element<HTMLInputElement>('idealisation-thin');
const idealisationSolid = element<HTMLInputElement>('idealisation-solid');

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`Element #${id} fehlt in midline-sections.html.`);
    return found as T;
}

// Die Auswahlliste steht einmal; markiert wird sie bei jedem Neuaufbau der
// Spalte ueber `aria-pressed`.
for (const preset of SECTION_PRESETS) {
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
        // Das Ergebnis gehoerte zum vorigen Querschnitt.
        result = undefined;
        renderPanel();
    });

    line.append(button);
    presetList.append(line);
}

/**
 * Rechnet den angezeigten Querschnitt: Umriss ableiten, Werte ermitteln, Gate
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

    const geometry = store.geometry;
    const section: CrossSection = { kind: 'section-geometry', id: store.presetId, geometry };
    const properties = sectionProperties(section);

    const shape = validateSectionGeometry(geometry, store.sectionPolicy);
    const values: SectionValidationResult =
        properties === undefined
            ? { errors: [], warnings: [] }
            : validateSectionProperties(properties, store.sectionPolicy);

    result = {
        properties,
        rings: geometry.outline.map((polygon) => polygon.points.length),
        findings: [
            ...findings('Figur', shape),
            ...findings('Werte', values),
        ],
    };

    // Neu zeichnen, weil jetzt der Umriss im Satz steht. Das Store-Abonnement
    // hat das bereits getan — der Aufruf hier schadet nicht und macht die
    // Abhaengigkeit sichtbar, falls das Abonnement einmal wegfaellt.
    viewer.requestRender();
    renderPanel();
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

calculateButton.addEventListener('click', calculate);

// ---------------------------------------------------------------------------
// Die Miter-Schranke zum Anfassen.
//
// ZWEI FELDER AUF EINER ZAHL: der Schieber zum Ausprobieren, das Zahlenfeld
// fuer den genauen Wert — und fuer den Blick auf die Werteregel, denn eine `1`
// weist `createSectionPolicy` zurueck, statt sie wie Clipper2 still durch `2`
// zu ersetzen.
//
// Zum Zusehen taugen die Saetze mit spitzem Stoss: das Dreieck (Innenwinkel
// 53,1°) kappt unter der Voreinstellung und laesst seine Spitze erst ab
// `miterLimit > 2,24` stehen; das Y-Profil (120°) bleibt bis `1,15` unberuehrt.
// Am rechten Winkel — Kasten, I, T — passiert bis `1,41` gar nichts.
// ---------------------------------------------------------------------------

for (const input of [miterLimitField, miterLimitSlider]) {
    input.addEventListener('input', () => applyMiterLimit(input.value));
}

for (const input of [idealisationThin, idealisationSolid]) {
    input.addEventListener('change', () => {
        // Dieselbe Nachzieh-Regel wie beim miterLimit: steht schon ein
        // Ergebnis, gehoert es zur bisherigen Deutung — umschalten rechnet neu
        // (`calculate` leitet den Umriss ohnehin neu ab; er bleibt derselbe,
        // denn `idealisation` aendert die Deutung, nicht die Figur).
        store.setIdealisation(input.value as Idealisation);
        renderIdealisation();
        if (result !== undefined) calculate();
    });
}

/**
 * Die neue Schranke in den Store — und den Umriss NACHZIEHEN, falls schon einer
 * da ist.
 *
 * Der gezeichnete Umriss ist unter der ALTEN Zahl entstanden. Ihn stehen zu
 * lassen waere genau die Drift, gegen die ADR 0033 die Policy neben den Umriss
 * legt: das Bild zeigte eine Figur, die zur angezeigten Einstellung nicht
 * gehoert. Also entweder verwerfen oder neu ableiten — hier wird neu
 * abgeleitet, weil „Berechnen" schon einmal gedrueckt war und man den
 * Unterschied SEHEN will. Vorher aendert der Regler nur die Zahl; der
 * Zwei-Schritt der Seite bleibt.
 */
function applyMiterLimit(raw: string): void {
    try {
        store.setMiterLimit(Number(raw.replace(',', '.')));
    } catch (error) {
        if (!(error instanceof InvalidSectionPolicyError)) throw error;
        renderMiterLimit(error.message);
        return;
    }

    renderMiterLimit();
    if (result !== undefined) calculate();
}

/**
 * Die beiden Felder und die Notiz darunter — aus dem STORE gelesen, nicht aus
 * dem Ereignis: gezeigt wird die Zahl, die gilt.
 *
 * GLEICHGEZOGEN WIRD NUR BEI GUELTIGER ZAHL. Sonst risse man dem Tippenden die
 * halb geschriebene Zahl unter den Fingern weg — und die zurueckgewiesene steht
 * ja gerade zur Ansicht da.
 */
function renderMiterLimit(problem?: string): void {
    const { miterLimit } = store.sectionPolicy;

    if (problem === undefined) {
        const text = String(miterLimit);
        for (const input of [miterLimitField, miterLimitSlider]) {
            if (input.value !== text) input.value = text;
        }
    }

    miterLimitNote.className = problem === undefined ? 'note' : 'note problem';
    miterLimitNote.textContent =
        problem ??
        `Gekappt wird der Spitz unter ${cutoffAngle(miterLimit).toFixed(1)}° Innenwinkel — ` +
            'darueber bleibt die Ecke stehen.';
}

/**
 * Der Innenwinkel, ab dem Clipper2 kappt [°].
 *
 * Der Ueberstand des ungekappten Spitzes ist `1/sin(α/2)`; gekappt wird, sobald
 * er `miterLimit` uebersteigt, also unter `α = 2·asin(1/miterLimit)`. Bei der
 * Voreinstellung `2` sind das 60°.
 */
function cutoffAngle(miterLimit: number): number {
    return (2 * Math.asin(1 / miterLimit) * 180) / Math.PI;
}

function renderPanel(): void {
    const preset = SECTION_PRESETS.find((candidate) => candidate.id === store.presetId);
    for (const button of presetList.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.preset === store.presetId));
    }

    renderIdealisation();
    presetName.textContent = preset?.name ?? '–';
    presetDimensions.textContent = preset === undefined ? '' : `${preset.dimensions} [mm]`;
    presetNote.textContent = preset?.note ?? '';

    if (result === undefined) {
        outlineStatus.textContent =
            `${store.nodes.length} Knoten, ${store.walls.length} Waende — Umriss noch nicht abgeleitet.`;
        propertiesField.innerHTML = '<p class="muted">Noch nicht berechnet.</p>';
        fillFindings([]);
        return;
    }

    outlineStatus.textContent =
        result.rings.length === 0
            ? 'Kein Umriss abgeleitet.'
            : `Umriss: ${result.rings.length} Ring(e) mit ${result.rings.join(' / ')} Punkten ` +
              `(discretisationTolerance ${store.sectionPolicy.discretisationTolerance} mm, ` +
              `miterLimit ${store.sectionPolicy.miterLimit}, ` +
              `idealisation ${store.idealisation}).`;
    propertiesField.innerHTML =
        result.properties === undefined
            ? '<p class="muted">sectionProperties &rarr; undefined — aus diesem Umriss faellt keine Flaeche.</p>'
            : propertyTable(result.properties);
    fillFindings(result.findings);
}

/**
 * Die beiden Umschalter aus dem STORE vorladen.
 *
 * Am Ereignis ist das ein No-op (die geklickte Option stimmt schon), es haelt
 * aber die Radiogruppe mit programmatischen Aenderungen zusammen — dieselbe
 * Figur wie renderMiterLimit.
 */
function renderIdealisation(): void {
    for (const input of [idealisationThin, idealisationSolid]) {
        input.checked = input.value === store.idealisation;
    }
}

/**
 * Die Werte in Katalogeinheiten — dieselbe Tabelle wie auf der Seite
 * „Parametrische Querschnitte", damit sich die beiden Wege vergleichen lassen.
 *
 * κ, der Schubmittelpunkt und `It` kommen seit P5 aus dem WANDWEG — aber nur
 * bei `idealisation: 'thin-walled'`. Als Vollquerschnitt (`solid`) bleiben sie
 * „nicht ermittelt" (Grashof ist erst P4, ADR 0029), und das gehoert ins Bild
 * — eine weggelassene Zeile saehe aus wie eine Null. `kappa` zeigt diesen
 * Zustand als „schubstarr", weil der Loeser dann `GAs: 'rigid'` rechnet.
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
    ${row('kappaY', kappa(p.kappaY))}
    ${row('kappaZ', kappa(p.kappaZ))}
  </tbody>
</table>`;
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

renderMiterLimit();
renderPanel();
// ERST HIER, nicht direkt nach dem Aufbau des Viewers: `getProperties` liest
// `result`, und das steht in diesem Modul weiter unten. Ein Frame davor liefe
// in dessen temporale tote Zone.
viewer.requestRender();

// Zum Ausprobieren in der Konsole:
//
//   store.geometry                       der Satz, wie er gespeichert wuerde
//   store.walls                          der Wandgraph — die Eingabe
//   store.outline                        leer, bis „Berechnen" gedrueckt ist
//   store.deriveOutline()                dasselbe ohne Knopf, zeichnet neu
//   store.sectionPolicy                  die Einstellung, unter der er entstand
//   store.setMiterLimit(3)               dasselbe ohne Regler (Feld nachziehen:
//                                        renderMiterLimit(), dann calculate())
//   SECTION_PRESETS.map((p) => p.id)     die Auswahl
Object.assign(globalThis, { store, viewer, SECTION_PRESETS, calculate, renderMiterLimit });
