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
// Lasten liegen weit oben: sie sind die Aussage der Eingabe, und ein Pfeil, den
// ein Stab verdeckt, ist keiner.
// Ergebnisse liegen NOCH darueber. Sie sind nur im Bild, wenn gerechnet wurde,
// und dann sind sie das, wofuer man hinsieht — ein Auflagerpfeil unter dem
// Lastpfeil desselben Knotens waere genau der eine, der fehlt.
//
// Die Schnittgroessenverlaeufe bekommen EIN gemeinsames Band und nicht drei: die
// z-Order unter N, V und M regelt die Array-Reihenfolge innerhalb des Bandes.
// Es liegt UNTER 'loads' und 'reactions', weil der Verlauf ueber JEDEN Stab
// laeuft und damit das eine Ding ist, das alles kreuzt — darueber toente seine
// Flaeche jeden Pfeil, und seine deckenden Labelkaesten verdeckten jedes
// Lastlabel. Ueber 'beams' und 'nodes', damit er selbst nicht verdeckt wird.
export const FEM_LAYERS = [
  'grid',
  'supports',
  'beams',
  'nodes',
  'hinges',
  'diagrams',
  'loads',
  'reactions',
] as const;

export type FEMLayer = (typeof FEM_LAYERS)[number];
