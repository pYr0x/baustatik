// Zeichenbaender einer Querschnitts-Szene, in Malreihenfolge — HINTEN = OBEN.
//
// Ohne Baender stapeln sich Gridlinien mit der Zeit UEBER dem Querschnitt: die
// Grid-IDs sind welt-indiziert, beim Zoom-Out kommen neue Weltpositionen in den
// Sichtbereich, und der Renderer haengt neu gebaute Shapes ans Ende. Die
// Querschnittsteile behalten ihre stabile seg.id, werden nie neu gebaut und
// sinken dadurch effektiv immer tiefer.
export const CROSS_SECTION_LAYERS = ['grid', 'section'] as const;

export type CrossSectionLayer = (typeof CROSS_SECTION_LAYERS)[number];
