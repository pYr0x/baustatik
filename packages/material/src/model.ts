/**
 * Das Material als MODELLSATZ — das, was neben `Node`, `Beam`, `NodeSupport`
 * und `CrossSection` im Modell liegt und mit ihm gespeichert wird.
 *
 * Bis hierher war `Beam.materialId` die Guete-Bezeichnung selbst (`'S235'`),
 * und der FEM-Adapter las sie mit einem ungeprueften `as SteelGrade` — was
 * jeden Stab zu Baustahl erklaerte. Ein Holz- oder Betonstab war damit gar
 * nicht modellierbar.
 *
 * Die Struktur ist die von `CrossSection`
 * ([ADR 0023](../../../docs/adr/0023-cross-sections-belong-to-the-model.md)):
 * `id` ist der selbstvergebene Modellschluessel, `grade` der Katalogverweis.
 * `Beam.materialId` bleibt ein String — genau wie `crossSectionId`.
 */

/**
 * Die Materialfamilie eines Stabs.
 *
 * KEIN `'reinforcement'`: Betonstahl ist nie das Material eines Stabs, sondern
 * die Einlage eines Stahlbetonquerschnitts. Die Variante kaeme additiv und an
 * anderer Stelle — am Querschnitt, wo das Paar Beton+Bewehrung hingehoert.
 *
 * Der Diskriminator ist nicht redundant, obwohl die Sortenlisten disjunkt
 * sind: Holz fuehrt `C24`/`C30`, Beton `C30/37`, und die Sortensuche
 * normalisiert tolerant. Ohne `kind` waere `'C30'` nicht von einem verkuerzten
 * `'C30/37'` zu unterscheiden.
 */
export type MaterialKind = 'steel' | 'concrete' | 'timber';

/**
 * Die beiden Moduln, aus denen die Steifigkeit eines Stabs entsteht. In MPa.
 *
 * `E` und nicht `Es`: `E_s` ist das Formelzeichen des Baustahls, und hier steht
 * je nach Familie `Es`, `Ecm` oder `E0,mean`. Der neutrale Name zwingt jede
 * Familie zu einer AUSGESCHRIEBENEN Abbildung — ein `Steel`-Objekt passt nicht
 * mehr zufaellig strukturell hinein.
 *
 * Der Typ lebt hier und nicht in `@baustatik/fem-section-resolve`, wo er
 * herkommt: seit [ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)
 * ist er ein FELD DES MODELLSATZES und nicht mehr nur ein Rechenzwischenwert.
 */
export type ElasticModuli = {
  /** Elastizitaetsmodul [MPa]. */
  readonly E: number;
  /** Schubmodul [MPa]. */
  readonly G: number;
  /**
   * Querdehnzahl ν [-] — OPTIONAL, und die Abwesenheit ist eine ANTWORT.
   *
   * Sie steht hier, seit der Vollquerschnitt seine FE-Werte als ν-freie
   * Koeffizienten speichert
   * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)):
   * `1/kappaZ = d0 + d2·m²` mit `m = ν/(1+ν)`, und `@baustatik/fem-section-resolve`
   * setzt genau diese Zahl ein. Kopiert beim ANLEGEN, wie `E` und `G` daneben.
   *
   * BEIM HOLZ FEHLT SIE. `E0,mean` und `G,mean` sind dort unabhaengig
   * tabelliert, weil das Material ORTHOTROP ist: es gibt kein isotropes ν, die
   * isotrope FE-Formulierung haelt nicht, und das ehrliche Ergebnis ist kein κ
   * — was das bestehende Vokabular als `kappaZ === undefined` bereits
   * ausdrueckt, also SCHUBSTARR und nicht „null Steifigkeit"
   * ([ADR 0035](../../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
   *
   * NICHT AUS `E` UND `G` ZURUECKRECHNEN. `E/(2G) − 1` gibt fuer Stahl
   * `0,30001`, wo die Norm `0,3` sagt — und beim Holz `6,97`, ohne dass
   * irgendetwas auffiele. Eine Formel, die still falsch liegt, ist schlimmer
   * als eine fehlende Zahl.
   */
  readonly nu?: number;
};

export type Material = {
  readonly kind: MaterialKind;
  /** Der vom Modell vergebene Schluessel, auf den `Beam.materialId` zeigt. */
  readonly id: string;
  /**
   * Die HERKUNFT der Werte — ein PLAIN STRING, wie `CrossSection.profile`.
   *
   * Seit ADR 0027 ist das nicht mehr der Schluessel, mit dem gerechnet wird:
   * die Zahlen stehen in `moduli`. `grade` sagt, WOHER sie kamen, und ist damit
   * das, was ein Bericht druckt und woran ein spaeterer Abgleich mit dem
   * Katalog ansetzt.
   *
   * Nicht `SteelGrade | ConcreteGrade | TimberGrade`: eine literale Union hier
   * zwaenge den Snapshot-Parser zu einem `as SteelGrade`, also genau dem Cast,
   * den dieser Record abschafft — nur an einer Stelle, die ausdruecklich Form
   * und nicht Aufloesbarkeit prueft.
   */
  readonly grade: string;
  /**
   * Die KOPIE der charakteristischen Moduln, hereingeholt beim Anlegen.
   *
   * Ohne sie rechnete ein gespeichertes Modell gegen die Tabellen der gerade
   * laufenden Programmversion: eine korrigierte Zeile, und jedes alte Modell
   * antwortet still anders. Das ist der Ausfall, den ADR 0011 fuer die
   * Analyse-Einstellungen schon verbietet; ADR 0027 zieht dieselbe Regel ueber
   * die Katalogdaten.
   *
   * NUR DIE MODULN, nicht `fyk`/`fck`/`fmk`: die liest heute niemand, und eine
   * eingefrorene Zahl ohne Leser kann nicht auffallen, wenn sie falsch ist.
   * Kommt die Bemessung, kommen die charakteristischen Festigkeiten additiv
   * dazu — je Familie, mit der Versionsstufe, die das nach sich zieht.
   */
  readonly moduli: ElasticModuli;
};
