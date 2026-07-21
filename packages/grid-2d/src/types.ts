// Strichbreiten sind Screen-px: der Konva-Adapter setzt strokeScaleEnabled:false,
// die Breite zoomt also NICHT mit.
export type GridLineStyle = {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
};

export type GridOptions = {
  // Linienabstand in Weltkoordinaten. Pflicht — ein Default waere
  // domaenenabhaengig willkuerlich; zoomabhaengige Wahl kommt spaeter.
  readonly spacing: number;
  // Achsen (u = 0 / v = 0) hervorgehoben zeichnen. Default true.
  readonly showAxes?: boolean;
  readonly gridStyle?: GridLineStyle;
  readonly axisStyle?: GridLineStyle;
  // Sicherung gegen absurde Linienmengen (spacing << Sichtbereich). Default 2000.
  readonly maxLines?: number;
  // Zeichenband, auf das Linien UND Achsen gestempelt werden. Default 'grid'.
  // Stempeln passiert hier statt im Aufrufer, damit nicht pro Frame bis zu
  // maxLines Specs durch ein { ...spec, layer } kopiert werden muessen.
  readonly layer?: string;
};
