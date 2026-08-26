import {
  createSectionGeometry,
  createSectionPolicy,
  type CrossSection,
  type FESectionState,
  kappaFromCoefficients,
  type SectionGeometry,
  type SectionPolicy,
  type SectionProperties,
  type ShapeSpec,
  sectionProperties,
} from "@baustatik/cross-section";
import {
  createCrossSectionViewer,
  type CrossSectionFEMesh,
  CROSS_SECTION_LAYERS,
} from "@baustatik/cross-section-viewer";
import type { Beam, Node, NodeSupport } from "@baustatik/fem";
import { Point } from "@baustatik/fem-geometry";
import { assertValidLoadCase, effectiveLoads, type LoadCase } from "@baustatik/fem-loads";
import { resolveSectionStiffness } from "@baustatik/fem-section-resolve";
import {
  type AnalysisPolicy,
  createAnalysisPolicy,
  createFEMSolver,
  type FEMSolver,
  type SolveResult,
} from "@baustatik/fem-solver";
import { createFEMViewer, type DiagramOptions, FEM_LAYERS } from "@baustatik/fem-viewer";
import { createKonvaAdapter as createKonvaDriver } from "@baustatik/konva-adapter";
import { lookupMaterial, type Material, type MaterialKind } from "@baustatik/material";
import { convert } from "@baustatik/units";
import { screenPoint, viewport } from "@baustatik/viewport-2d";
import { createPinia, defineStore } from "pinia";
import { computeFESection } from "../cross-section/cross-section-fe-port";
import { feGeometry, feState } from "../cross-section/section-fe-geometry";
import { solveLinearSystem } from "./linear-solver-port";
import { solveSparseSystem } from "./sparse-solver-port";

// ---------------------------------------------------------------------------
// DIE NAHT. Die beiden Querschnittsseiten zeigen die ZAHL; diese Seite zeigt,
// wo sie ins Stabwerk kommt.
//
// Es ist das erste Modell im Repo mit einem ASYNCHRONEN SCHRITT zwischen Aufbau
// und Rechnung. Bis hierher war der ganze Weg vom Querschnitt zur
// Stabsteifigkeit synchron: `sectionProperties` antwortet sofort,
// `resolveSectionStiffness` multipliziert, `solver.check()` urteilt. Mit dem
// FE-Kern kommt ein Stueck dazu, das vernetzt und faktorisiert — und das kann
// hinter keiner der beiden Tueren laufen (ADR 0039/0045).
//
// AUFGELOEST WIRD ES VON DER ANWENDUNG, an EINEM Ort zwischen „Modell steht" und
// „Modell rechnen". Das ist `resolveFESections()` weiter unten, und es sind
// sechs Zeilen: ueber die Querschnittsliste laufen, den bereits gefuellten Satz
// ueberspringen, rechnen, zurueckschreiben. Kein Helfer im Package — der
// braeuchte `CrossSection` samt IDs, um zurueckzuschreiben, und genau den
// Schluessel soll die Tuer nicht haben.
//
// DIES IST DIE ERSTE STUFE einer Kette, die spaeter mehrere haben kann:
// Querschnittswerte, dann Stabwerk, dann Bemessung — jede rechnet, schreibt ihr
// Ergebnis in den Modellsatz und ist fertig. Gebaut wird davon HIER NICHTS
// WEITER: kein Ablaufsteuerer, keine Abhaengigkeitsverwaltung, kein
// automatisches Nachziehen. Was diese Stufe erfuellt und jede weitere erfuellen
// sollte, sind drei Eigenschaften — Fingerabdruck der Eingabe, drei Zustaende
// statt zweier, und keine Stufe ruft eine andere.
//
// DER SICHERUNGSANKER: den Schritt auszulassen ist KEIN stiller Fehler. `kappaZ`
// bleibt `undefined`, `resolveSectionStiffness` liefert `GAs: 'rigid'`,
// gerechnet wird schubstarr, und `check()` meldet
// `ShearDeformationUnavailableWarning` (ADR 0035). Deshalb DARF der Schritt
// optional sein.
// ---------------------------------------------------------------------------

const pinia = createPinia();

const useStore = defineStore("fem-viewer-3", {
  state: () => ({
    nodes: [] as Node[],
    beams: [] as Beam[],
    crossSections: [] as CrossSection[],
    materials: [] as Material[],
    sectionPolicy: createSectionPolicy() as SectionPolicy,
    analysisPolicy: createAnalysisPolicy() as AnalysisPolicy,
    supports: [] as NodeSupport[],
    loadCases: [] as LoadCase[],
    activeLoadCaseId: "",
  }),
  getters: {
    activeLoadCase(state): LoadCase | undefined {
      return state.loadCases.find((loadCase) => loadCase.id === state.activeLoadCaseId);
    },
  },
  actions: {
    addNode(position: { x: number; z: number }) {
      this.nodes.push({ id: crypto.randomUUID(), position });
    },
    addMaterial(input: { kind: MaterialKind; grade: string }): Material {
      const found = lookupMaterial(input.kind, input.grade);
      if (found === undefined) {
        throw new Error(`Die Sorte "${input.grade}" steht nicht im Katalog.`);
      }
      const material: Material = {
        kind: input.kind,
        id: crypto.randomUUID(),
        grade: found.grade,
        moduli: found.moduli,
      };
      this.materials.push(material);
      return material;
    },
    /**
     * DIE ERSTE ERWEITERUNG gegenueber `fem-viewer-2.ts`: die Tuer nimmt
     * AUCH `{ kind: 'section-geometry', geometry }`.
     *
     * Bis hierher kannte sie nur `shape` und `profile` — der gezeichnete
     * Querschnitt kam nie durch diese Tuer, weil er nie gerechnet werden
     * konnte.
     *
     * SEIT ADR 0062 STEHT DIE PARAMETRISCHE FORM WIEDER DANEBEN, und diesmal
     * mit demselben Rechenweg: sie schreibt sich als Umriss aus und laeuft
     * durch dieselbe FE. Fuer den Aufloesungsschritt sind die beiden Zweige
     * ununterscheidbar.
     */
    addCrossSection(
      section:
        | { kind: "section-geometry"; geometry: SectionGeometry }
        | { kind: "shape"; shape: ShapeSpec },
    ): Readonly<CrossSection> {
      const created: CrossSection =
        section.kind === "shape"
          ? { kind: "shape", id: crypto.randomUUID(), shape: section.shape }
          : {
              kind: "section-geometry",
              id: crypto.randomUUID(),
              geometry: section.geometry,
            };
      this.crossSections.push(created);
      return created;
    },
    addBeam(startNode: Node, endNode: Node, crossSection: CrossSection, material: Material) {
      this.beams.push({
        id: crypto.randomUUID(),
        startNodeId: startNode.id,
        endNodeId: endNode.id,
        crossSectionId: crossSection.id,
        materialId: material.id,
      });
    },
    addSupport(node: Node, ux: "fixed" | "free", uz: "fixed" | "free", phiY: "fixed" | "free") {
      this.supports.push({ id: crypto.randomUUID(), nodeId: node.id, ux, uz, phiY });
    },
    addLoadCase(name: string): LoadCase {
      const loadCase: LoadCase = { id: crypto.randomUUID(), name, loads: [] };
      assertValidLoadCase(loadCase);
      this.loadCases.push(loadCase);
      this.activeLoadCaseId = loadCase.id;
      return loadCase;
    },
    addNodeLoad(node: Node, fz: number) {
      const target = this.loadCases.find((c) => c.id === this.activeLoadCaseId);
      if (target === undefined) throw new Error("Kein aktiver Lastfall.");
      target.loads = [
        ...target.loads,
        {
          id: crypto.randomUUID(),
          target: "node",
          nodeIds: [node.id],
          fz,
        },
      ];
    },
    /**
     * DIE ZWEITE ERWEITERUNG: die EINE Schreibstelle des FE-Blocks.
     *
     * SIE ERSETZT DIE GEOMETRIE, sie mutiert sie nicht — und sie schlaegt
     * ueber `this.crossSections` nach, damit die Zuweisung den Pinia-Proxy
     * trifft. Ein Schreibzugriff auf das rohe Objekt ginge am Proxy vorbei,
     * und nichts zeichnete neu. Genau die Falle, vor der `addRelease` und
     * `requireActiveCase` in `fem-viewer-2.ts` bereits warnen.
     */
    setFEValues(sectionId: string, state: FESectionState) {
      const target = this.crossSections.find((section) => section.id === sectionId);
      if (target === undefined || target.kind === "profile") {
        throw new Error(`Kein rechenbarer Querschnitt "${sectionId}" im Modell.`);
      }
      // ZWEI ORTE, EIN BLOCK (ADR 0062): die gezeichnete Figur traegt ihn in
      // ihrer Geometrie, die parametrische Form unmittelbar am Satz. Beide
      // ERSETZEN, damit die Zuweisung den Pinia-Proxy trifft.
      if (target.kind === "shape") {
        target.feValues = state;
      } else {
        target.geometry = { ...target.geometry, feValues: state };
      }
    },
  },
});

const store = useStore(pinia);

// ---------------------------------------------------------------------------
// Das Modell — so klein wie moeglich. Die Seite erklaert einen ABLAUF, keinen
// Lastfall.
// ---------------------------------------------------------------------------

/**
 * Rechteck 200 × 300 als `kind: 'outline'` — dieselben Ringe wie die Vorgabe
 * `rechteck-200x300` in `apps/demo/cross-section/outline-presets.ts`.
 *
 * EIN VOLLQUERSCHNITT ALS UMRISS, und das ist der Punkt: er hat keine
 * Wandstaerke, also gibt es keinen Wandweg, also kommt κ nur aus der FE.
 */
const RECHTECK: SectionGeometry = createSectionGeometry(
  {
    kind: "outline",
    rings: [
      {
        vertices: [
          { y: -100, z: 0 },
          { y: 100, z: 0 },
          { y: 100, z: 300 },
          { y: -100, z: 300 },
        ],
      },
    ],
  },
  store.sectionPolicy,
);

const section = store.addCrossSection({ kind: "section-geometry", geometry: RECHTECK });
const S235 = store.addMaterial({ kind: "steel", grade: "S235" });

store.addNode(Point.make(0, 0));
store.addNode(Point.make(1, 0));
store.addNode(Point.make(2, 0));
store.addBeam(store.nodes[0] as Node, store.nodes[1] as Node, section, S235);
store.addBeam(store.nodes[1] as Node, store.nodes[2] as Node, section, S235);
store.addSupport(store.nodes[0] as Node, "fixed", "fixed", "free");
store.addSupport(store.nodes[2] as Node, "free", "fixed", "free");

// Ein kurzer, gedrungener Traeger: `L/h = 6,7`. Der Schubanteil an der
// Durchbiegung ist dort gross genug, um ihn ohne Lupe zu sehen — bei `L/h = 20`
// laege er unter einem Prozent, und die Seite haette nichts zu zeigen.
store.addLoadCase("Einzellast in Feldmitte");
store.addNodeLoad(store.nodes[1] as Node, 10000);

// ---------------------------------------------------------------------------
// Zwei Bilder: links das Stabwerk, daneben der Querschnitt mit seinem Netz.
// ---------------------------------------------------------------------------

const container = element<HTMLDivElement>("container");
const frameBounds = container.getBoundingClientRect();
const frameSize = {
  width: Math.floor(frameBounds.width),
  height: Math.floor(frameBounds.height),
};

/**
 * WELCHE Verlaeufe sichtbar sind, und wie hoch — reiner ANSICHTSzustand, wie
 * der Viewport. Er gehoert nicht in den Store: er beschreibt weder das Modell
 * noch sein Ergebnis, und er ueberlebt kein Neuladen.
 *
 * Die ANWESENHEIT eines Feldes in `DiagramOptions` ist der Schalter; ein Haken
 * raus heisst „Feld weg", nicht „Hoehe null".
 *
 * Steht VOR dem Viewer, nicht dahinter: `getDiagrams` liest ihn beim ersten
 * Zeichnen, und eine `const` hinter der Nutzung waere die zeitliche Totzone.
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

const viewer = createFEMViewer({
  driver: createKonvaDriver({
    container,
    width: frameSize.width,
    height: frameSize.height,
    layers: FEM_LAYERS,
  }),
  initialViewport: viewport(screenPoint(frameSize.width / 2 - 100, frameSize.height / 2), 100),
  getNodes: () => store.nodes,
  getBeams: () => store.beams,
  getSupports: () => store.supports,
  getLoads: () => {
    const active = store.activeLoadCase;
    return active === undefined ? [] : effectiveLoads(active);
  },
  // EIN Pull fuer das ganze Ergebnis: die Auflagerkraefte stehen darin, und die
  // Schnittgroessenverlaeufe kaemen aus demselben Stueck.
  getResult: () => result,
  // Ein PULL wie alles andere: der Viewer haelt keinen Zustand ausser dem
  // Viewport, und diese drei Haken sind Ansicht, nicht Modell.
  getDiagrams: diagramOptions,
  getScreenSize: () => frameSize,
  grid: { spacing: 0.5 },
});

const sectionContainer = element<HTMLDivElement>("section");
const sectionBounds = sectionContainer.getBoundingClientRect();
const sectionSize = {
  width: Math.floor(sectionBounds.width),
  height: Math.floor(sectionBounds.height),
};
const SECTION_SCALE = 0.7;

const sectionViewer = createCrossSectionViewer({
  driver: createKonvaDriver({
    container: sectionContainer,
    width: sectionSize.width,
    height: sectionSize.height,
    layers: CROSS_SECTION_LAYERS,
  }),
  initialViewport: viewport(
    screenPoint(sectionSize.width / 2, sectionSize.height / 2 - 150 * SECTION_SCALE),
    SECTION_SCALE,
  ),
  getGeometry: () => currentGeometry(),
  getSectionPolicy: () => store.sectionPolicy,
  getScreenSize: () => sectionSize,
  // WORAUF gerechnet wurde — das Netz aus `FEComputation`, nicht ein zweites
  // (ADR 0039).
  getFEMesh: () => mesh,
  getProperties: () => currentProperties(),
  grid: { spacing: 50 },
});

/**
 * Das Ergebnis des zuletzt gerechneten Laufs, und das Netz des zuletzt
 * gerechneten Querschnitts — BEIDE transient, beide neben dem Store.
 *
 * Ein Ergebnis ist keine Eingabe. Aendert sich das Modell, ist der
 * Aufloesungsschritt hinfaellig; das Feld `feValues` ueberlebt nur, solange der
 * Fingerabdruck traegt.
 */
let result: SolveResult | undefined;
let mesh: CrossSectionFEMesh | undefined;

store.$subscribe(() => {
  result = undefined;
  mesh = undefined;
  viewer.requestRender();
  sectionViewer.requestRender();
  renderPanel();
});

// ---------------------------------------------------------------------------
// Der Rechenkopf. Unveraendert gegenueber `fem-viewer-2.ts` — er sieht den
// FE-Block nicht und muss es nicht: er faellt in `sectionProperties` an, und der
// Resolver setzt das ν des Stabmaterials ein.
// ---------------------------------------------------------------------------

function buildSolver(): FEMSolver {
  return createFEMSolver({
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    getLoadCases: () => store.loadCases,
    getSectionStiffness: (beam) => resolveSectionStiffness(beam, store),
    solveLinearSystem,
    solveSparseSystem,
    analysisPolicy: store.analysisPolicy,
  });
}

const solver = buildSolver();

// ---------------------------------------------------------------------------
// DER AUFLOESUNGSSCHRITT. Sechs Zeilen, und vier Dinge daran sind Vertrag:
//
//   - Die Schleife IST die Deduplizierung: je distinktem Querschnitt einmal,
//     nicht je Stab. Der Waechter ist `feValues` im Satz selbst — kein
//     Schluessel, kein Zwischenspeicher.
//   - Geschrieben wird durch eine Store-Aktion, und sie ERSETZT.
//   - Das Netz geht NICHT in den Store. Es liegt daneben — und seit ADR 0061
//     liegen die geloesten Felder mit ihm da. Diese Seite ruehrt sie nicht an:
//     eine Spannung braucht eine Schnittgroesse, und die kommt erst aus dem
//     Solver.
//   - Der Schritt kennt KEIN Material. Derselbe Querschnitt darf an einem
//     Stahl- und einem Betonstab haengen — die Frage „unter welchem ν wurde das
//     gerechnet" kann gar nicht gestellt werden.
// ---------------------------------------------------------------------------

async function resolveFESections(): Promise<void> {
  for (const cs of store.crossSections) {
    // GEZEICHNET ODER PARAMETRISCH — seit ADR 0062 dieselbe Schleife: die Form
    // schreibt sich in `feGeometry` als Umriss aus, und was danach kommt, ist
    // unveraendert. Uebersprungen wird, was hier nichts zu holen hat (das
    // Katalogprofil, der duennwandige Zweig) und was schon gerechnet ist.
    if (feState(cs) !== undefined) continue; // schon gerechnet
    const geometry = feGeometry(cs, store.sectionPolicy);
    if (geometry === undefined) continue;
    const computation = await computeFESection(geometry, store.sectionPolicy);
    store.setFEValues(cs.id, computation.state);
    // NARROWT AUF `kind` (ADR 0061): der `'refused'`-Arm traegt kein Netz, und
    // dann steht hier auch keines — transient, nur zum Zeichnen.
    mesh = computation.kind === "solved" ? computation.mesh : undefined;
  }
}

// ---------------------------------------------------------------------------
// Die rechte Spalte.
// ---------------------------------------------------------------------------

const M2_TO_CM2 = convert(1).from("m^2").toExact("cm^2");
const M4_TO_CM4 = convert(1).from("m^4").toExact("cm^4");
const M_TO_MM = convert(1).from("m").toExact("mm");

const computeFEButton = element<HTMLButtonElement>("compute-fe");
const solveButton = element<HTMLButtonElement>("solve");
const statusField = element<HTMLDivElement>("status");
const feStateField = element<HTMLDivElement>("fe-state");
const sectionValuesField = element<HTMLDivElement>("section-values");
const resultField = element<HTMLDivElement>("result");
const warningList = element<HTMLUListElement>("warnings");
const warningCount = element<HTMLSpanElement>("warning-count");

/** Beide Knoepfe sind gesperrt, solange gerechnet wird — wie `solving` in v2. */
let busy = false;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Element #${id} fehlt in fem-viewer-3.html.`);
  return found as T;
}

function currentGeometry(): SectionGeometry {
  // DIESELBE FIGUR, DIE IN DIE FE GEHT — auch bei einer parametrischen Form
  // (ADR 0062). Der Viewer zeichnet damit genau das, was gerechnet wurde, und
  // nicht eine zweite Beschreibung daneben.
  const cs = store.crossSections[0];
  return (cs === undefined ? undefined : feGeometry(cs, store.sectionPolicy)) ?? RECHTECK;
}

function currentSection(): CrossSection | undefined {
  return store.crossSections[0];
}

function currentProperties(): SectionProperties | undefined {
  const cs = currentSection();
  return cs === undefined ? undefined : sectionProperties(cs, store.sectionPolicy);
}

computeFEButton.addEventListener("click", () => void runFE());
solveButton.addEventListener("click", () => void runSolve());

// ---------------------------------------------------------------------------
// Die Schnittgroessen-Schalter.
//
// Sie schreiben in `diagrams` und NICHT in den Store: was man ansieht, ist keine
// Eingabe. Deshalb raeumen sie auch kein Ergebnis weg — nur ein Neuzeichnen.
// ---------------------------------------------------------------------------
const diagramMCheckbox = element<HTMLInputElement>("diagram-m");
const diagramVCheckbox = element<HTMLInputElement>("diagram-v");
const diagramNCheckbox = element<HTMLInputElement>("diagram-n");
const diagramExaggerationInput = element<HTMLInputElement>("diagram-exaggeration");
const diagramExaggerationValue = element<HTMLSpanElement>("diagram-exaggeration-value");

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
  control.addEventListener("input", applyDiagramOptions);
}

// Die Controls tragen den Anfangsstand von `diagrams` — einmal angleichen.
diagramMCheckbox.checked = diagrams.M;
diagramVCheckbox.checked = diagrams.V;
diagramNCheckbox.checked = diagrams.N;
diagramExaggerationInput.value = String(diagrams.exaggeration);
diagramExaggerationValue.textContent = String(diagrams.exaggeration);

async function runFE(): Promise<void> {
  busy = true;
  renderPanel();
  statusField.textContent = "Vernetzt und löst das Querschnittsproblem …";
  try {
    await resolveFESections();
    statusField.textContent =
      'Der Querschnittssatz ist gefüllt. Jetzt „Rechnen" — die Durchbiegung ' +
      "muss GRÖSSER werden und die Warnung verschwinden.";
  } catch (error) {
    // Der Fehlerzweig ist sichtbar, und der Satz bleibt LEER statt halb
    // gefuellt.
    mesh = undefined;
    statusField.textContent = `Fehlgeschlagen: ${
      error instanceof Error ? error.message : String(error)
    }`;
  } finally {
    busy = false;
    sectionViewer.requestRender();
    renderPanel();
  }
}

async function runSolve(): Promise<void> {
  const active = store.activeLoadCase;
  if (active === undefined) return;

  busy = true;
  renderPanel();
  result = undefined;
  statusField.textContent = "Rechnet das Stabwerk …";

  try {
    const solved = await solver.solve(active.id);
    result = solved;
    const midspan = solved.displacements.get((store.nodes[1] as Node).id);
    lastDeflection = midspan?.uz;
    statusField.textContent = "";
  } catch (error) {
    statusField.textContent = `Fehlgeschlagen: ${
      error instanceof Error ? error.message : String(error)
    }`;
  } finally {
    busy = false;
    viewer.requestRender();
    renderPanel();
  }
}

/** Die zuletzt gerechnete Durchbiegung, damit der Unterschied dastehen kann. */
let lastDeflection: number | undefined;
let deflectionWithoutShear: number | undefined;

function renderPanel(): void {
  computeFEButton.disabled = busy;
  solveButton.disabled = busy;

  const state = feState(currentSection());

  // DREI ZUSTAENDE, und sie stehen hier ausgeschrieben nebeneinander.
  feStateField.textContent =
    state === undefined
      ? "feValues: abwesend — der Auflösungsschritt lief noch nicht."
      : state.status === "computed"
        ? "feValues: gerechnet."
        : `feValues: verweigert (${state.reason}).`;

  const properties = currentProperties();
  sectionValuesField.innerHTML =
    properties === undefined ? '<p class="muted">Keine Werte.</p>' : propertyTable(properties);

  const stiffness =
    store.beams[0] === undefined
      ? undefined
      : resolveSectionStiffness(store.beams[0] as Beam, store);

  // Die Durchbiegung OHNE Schub wird beim ersten Lauf gemerkt: der
  // Unterschied ist der Inhalt dieser Seite, und er ist nur als DIFFERENZ
  // lesbar.
  if (stiffness?.GAs === "rigid" && lastDeflection !== undefined) {
    deflectionWithoutShear = lastDeflection;
  }

  const rows: string[] = [
    row("GAs", stiffness === undefined ? "–" : formatGAs(stiffness.GAs)),
    row(
      "uz (Feldmitte)",
      lastDeflection === undefined
        ? "noch nicht gerechnet"
        : `${(lastDeflection * 1000).toFixed(4)} mm`,
    ),
  ];
  if (
    deflectionWithoutShear !== undefined &&
    lastDeflection !== undefined &&
    stiffness?.GAs !== "rigid"
  ) {
    const delta = ((lastDeflection - deflectionWithoutShear) / deflectionWithoutShear) * 100;
    rows.push(row("davon Schubanteil", `${delta.toFixed(2)} %`));
  }
  resultField.innerHTML = `<table class="values"><tbody>${rows.join("")}</tbody></table>`;

  const report =
    store.activeLoadCase === undefined ? undefined : solver.check(store.activeLoadCaseId);
  const warnings = report === undefined ? [] : report.model.warnings.map((w) => w.message);
  warningCount.textContent = String(warnings.length);
  warningList.replaceChildren(
    ...(warnings.length === 0
      ? [item("Keine Hinweise.", true)]
      : warnings.map((message) => item(message, false))),
  );
}

function formatGAs(GAs: number | "rigid"): string {
  return GAs === "rigid" ? "'rigid' — schubstarr" : `${GAs.toFixed(0)} kN`;
}

/**
 * Die Werte des Satzes — und zwar GENAU die drei Zeilen, um die es geht:
 * `It`, der Schubmittelpunkt und κ.
 *
 * κ steht als FORMEL, ausgewertet mit dem ν, das im Stabmaterial steht. Das
 * ist keine Anzeigefrage: dieselbe Zahl setzt `resolveSectionStiffness` ein.
 */
function propertyTable(p: SectionProperties): string {
  const nu = (store.materials[0] as Material | undefined)?.moduli.nu;
  return `
<table class="values">
  <tbody>
    ${row("A", `${(p.A * M2_TO_CM2).toFixed(1)} cm²`)}
    ${row("Iy", `${(p.Iy * M4_TO_CM4).toFixed(1)} cm⁴`)}
    ${row("It", p.It === undefined ? "nicht ermittelt" : `${(p.It * M4_TO_CM4).toFixed(1)} cm⁴`)}
    ${row("yM", p.yM === undefined ? "nicht ermittelt" : `${(p.yM * M_TO_MM).toFixed(2)} mm`)}
    ${row("zM", p.zM === undefined ? "nicht ermittelt" : `${(p.zM * M_TO_MM).toFixed(2)} mm`)}
    ${row("ν (Stabmaterial)", nu === undefined ? "ohne" : nu.toFixed(2))}
    ${row("kappaZ", formatKappa(p.kappaZ ?? kappaFromCoefficients(p.inverseKappaZ, nu)))}
  </tbody>
</table>`;
}

function formatKappa(value: number | undefined): string {
  return value === undefined ? "schubstarr" : value.toFixed(6);
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function item(message: string, muted: boolean): HTMLLIElement {
  const line = document.createElement("li");
  if (muted) line.className = "muted";
  line.append(message);
  return line;
}

viewer.requestRender();
sectionViewer.requestRender();
renderPanel();

// Zum Ausprobieren in der Konsole:
//
//   store.crossSections[0].geometry.feValues    der FE-Block im Satz
//   await runFE()                                der Aufloesungsschritt
//   await runSolve()                             das Stabwerk
//   resolveSectionStiffness(store.beams[0], store)
Object.assign(globalThis, { store, solver, runFE, runSolve, resolveFESections });
