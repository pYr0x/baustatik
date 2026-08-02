/**
 * Der Datensatz einer Profiltabellenzeile.
 *
 * INVARIANTE DIESES PACKAGES: die Zahlen sind TABELLIERT, nicht nachgerechnet.
 * `Iy` von IPE 300 stammt aus der Norm, beruecksichtigt die Ausrundungsradien
 * und ist gerundet. Wer sie gegen einen Integrator haelt, findet Abweichungen —
 * das ist erwartet und KEIN Grund, die Tabelle zu „korrigieren".
 *
 * EINHEITEN VERBATIM WIE IN DER NORM (mm, cm2, cm3, cm4, cm6), nicht in Metern.
 * Der Grund ist Pruefbarkeit: `Iy: 8356` laesst sich gegen die gedruckte
 * Tabelle diffen, `8.356e-5` nicht. Die Umrechnung nach SI passiert an genau
 * EINER Stelle, im Mapping in `@baustatik/cross-section`.
 */
export interface SteelProfileData {
  /** Profilhoehe h [mm]. */
  readonly h: number;
  /** Profilbreite b [mm]. */
  readonly b: number;
  /** Stegdicke [mm]. */
  readonly tw: number;
  /** Flanschdicke [mm]. */
  readonly tf: number;
  /** Ausrundungsradius zwischen Steg und Flansch [mm]. */
  readonly r: number;

  /** Querschnittsflaeche [cm2]. */
  readonly A: number;

  /**
   * Schubflaechen der SCHUBWEICHEN BALKENTHEORIE [cm2] — daraus kappa = A_/A.
   *
   * NICHT `Av` nach EN 1993-1-1 §6.2.6 und NICHT `Apl`: bei IPE 80 ist
   * Az = 2,69, Av,z = 3,57 und Apl,z = 2,84. Wer hier den EC3-Wert eintraegt,
   * macht den Stab um 33 % zu steif, und kein Test merkt es. Die drei sind drei
   * verschiedene Groessen mit drei verschiedenen Zwecken:
   *   Az     — Schubenergie, A_s = I^2 / integral (S/t)^2 dA (Verformung)
   *   Av,z   — wirksame Schubflaeche nach EC 3 (Tragfaehigkeit)
   *   Apl,z  — plastische Schubflaeche (Traglast)
   *
   * Optional fuer spaeter ergaenzte Reihen ohne Schubflaeche: die rechnen dann
   * schubstarr, statt dass hier ein Naeherungswert erfunden wird.
   */
  readonly Ay?: number;
  readonly Az?: number;

  /** Traegheitsmomente [cm4]. */
  readonly Iy: number;
  readonly Iz: number;
  /** Traegheitsradien [cm]. */
  readonly iy: number;
  readonly iz: number;

  /**
   * Widerstandsmomente [cm3] — elastisch und plastisch.
   *
   * `Wpl` reist mit, obwohl der Rechenkern es heute nicht benutzt: es ist
   * MATERIALFREI (`Mpl,y,d` entsteht erst durch `x fy,d`) und damit hier
   * richtig aufgehoben — allerdings nur bei HOMOGENEM Querschnitt reine
   * Geometrie.
   */
  readonly Wely: number;
  readonly Welz: number;
  readonly Wply: number;
  readonly Wplz: number;

  /** Torsionstraegheitsmoment It [cm4]. */
  readonly It: number;
  /** Woelbwiderstand Iw [cm6]. Reist als Spalte mit, wird nicht ausgewertet. */
  readonly Iw: number;

  /**
   * Statische Momente des HALBQUERSCHNITTS [cm3] — Sy,max und Sz,max.
   *
   * NICHT zu verwechseln mit `StressPoint.Sy` in `@baustatik/cross-section`,
   * das am ORT gilt. Pruefstein: das integrierte Sy im Schwerpunkt muss diesen
   * Wert treffen.
   */
  readonly SyMax: number;
  readonly SzMax: number;

  /** Querschnittsgewicht [kg/m]. */
  readonly mass: number;
}

/** Die Walzreihen, die dieses Package fuehrt. */
export type ProfileSeries = 'IPE' | 'HEA';

/** Eine Tabellenzeile samt ihrer Herkunft. */
export interface SteelProfile extends SteelProfileData {
  /** Die gedruckte Bezeichnung, z. B. `'IPE 200'` — kanonisch mit Leerzeichen. */
  readonly id: string;
  readonly series: ProfileSeries;
}

/**
 * Woraus eine Tabellenzeile besteht — die Feldnamen als Wert.
 *
 * Seit [ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md) reist
 * die Zeile IM MODELL mit, und der Snapshot-Parser muss ihre Gestalt pruefen.
 * Er braucht dafuer die Liste zur Laufzeit. Sie steht hier, weil dieses Package
 * die Zeile besitzt.
 *
 * BEIDE RICHTUNGEN sind zur Uebersetzungszeit belegt: `satisfies` verbietet
 * einen Namen, den es nicht gibt, und `NoColumnMissing` darunter verbietet eine
 * Spalte, die fehlt. Wer `SteelProfileData` erweitert und die Liste vergisst,
 * bekommt einen Typfehler und keinen Parser, der die neue Spalte stillschweigend
 * ablehnt.
 *
 * WELCHE Spalten fehlen duerfen, sagt `OPTIONAL_PROFILE_DATA_KEYS` darunter —
 * nicht der Parser. Sonst stuende die Optionalitaet als zweite Liste an einer
 * zweiten Stelle, und eine dritte optionale Spalte hier liesse den Parser
 * Snapshots ablehnen, die sie weglassen.
 */
export const PROFILE_DATA_KEYS = [
  'h',
  'b',
  'tw',
  'tf',
  'r',
  'A',
  'Ay',
  'Az',
  'Iy',
  'Iz',
  'iy',
  'iz',
  'Wely',
  'Welz',
  'Wply',
  'Wplz',
  'It',
  'Iw',
  'SyMax',
  'SzMax',
  'mass',
] as const satisfies readonly (keyof SteelProfileData)[];

/** Schlaegt fehl, sobald `SteelProfileData` eine Spalte hat, die oben fehlt. */
type NoColumnMissing<T extends never> = T;
type _ProfileDataKeysAreComplete = NoColumnMissing<
  Exclude<keyof SteelProfileData, (typeof PROFILE_DATA_KEYS)[number]>
>;

/** Die Spalten, die `SteelProfileData` mit `?` fuehrt — abgeleitet, nicht getippt. */
type OptionalColumn = {
  [K in keyof SteelProfileData]-?: Record<string, never> extends Pick<
    SteelProfileData,
    K
  >
    ? K
    : never;
}[keyof SteelProfileData];

/**
 * Welche Spalten eine Zeile weglassen darf.
 *
 * Heute `Ay`/`Az`: eine Reihe ohne tabellierte Schubflaeche rechnet schubstarr,
 * statt dass ein Naeherungswert erfunden wird (siehe `SteelProfileData`).
 *
 * Die Liste steht HIER und nicht im Snapshot-Parser, weil das `?` an
 * `SteelProfileData` haengt und sonst zwei Stellen wuessten, welche Spalte
 * fehlen darf. Sie ist an den Typ gekettet: `satisfies` verbietet eine Spalte,
 * die gar nicht optional ist, `NoColumnMissing` eine optionale, die hier fehlt.
 * Wer ein `?` setzt oder streicht, aendert genau eine Datei.
 */
export const OPTIONAL_PROFILE_DATA_KEYS = [
  'Ay',
  'Az',
] as const satisfies readonly OptionalColumn[];

type _OptionalKeysAreComplete = NoColumnMissing<
  Exclude<OptionalColumn, (typeof OPTIONAL_PROFILE_DATA_KEYS)[number]>
>;

/**
 * Die Zeile ohne ihre Herkunft — `id` und `series` bleiben zurueck.
 *
 * Der Modellsatz fuehrt die Bezeichnung bereits als eigenes Feld (`profile`),
 * und `series` ist eine Aussage ueber den KATALOG, nicht ueber den Querschnitt.
 * Beide mitzukopieren hiesse, die Bezeichnung zweimal im Satz zu haben.
 */
export function profileData(profile: SteelProfile): SteelProfileData {
  const { id: _id, series: _series, ...data } = profile;
  return data;
}
