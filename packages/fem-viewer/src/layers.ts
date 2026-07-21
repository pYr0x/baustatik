// Zeichenbaender einer FEM-Szene, in Malreihenfolge — HINTEN = OBEN.
//
// Dieses Tupel ist gleichzeitig Namensliste, Typquelle und z-Reihenfolge: eine
// Deklaration, eine Wahrheit. Die Aufzaehlung lebt bewusst hier und nicht in
// render-core — welche Baender eine FEM-Szene hat, ist Fachwissen, und
// render-core bedient auch den Querschnitt, der von 'beams' nichts weiss.
//
// Knoten stehen hinter Staeben, damit sie IMMER darueber liegen — auch wenn ein
// Stab erst nach den Knoten ins Modell kommt. Ueber die Array-Reihenfolge allein
// waere das nicht garantiert, weil der Renderer neue Shapes sonst obenauf haengt.
export const FEM_LAYERS = ['grid', 'supports', 'beams', 'nodes'] as const;

export type FEMLayer = (typeof FEM_LAYERS)[number];
