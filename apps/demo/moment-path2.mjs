/**
 * Pfad-Generator fuer das Momentsymbol — zweite Fassung.
 *
 * Der Unterschied zur ersten: der Bogen endet an der BASIS der Spitze, nicht an
 * der Spitze selbst. Sonst steht die stumpfe Strichkappe des Bogens genau dort,
 * wo das Dreieck spitz sein soll — und weil der Kopf tangential rueckwaerts
 * konstruiert war, lag seine Basis ausserhalb des Kreises statt darauf.
 *
 * Zusaetzlich wird der Bogen um den Winkel gekuerzt, den die Spitze selbst
 * einnimmt (headAngle = pointerLength / r, Bogenlaengen-Naeherung). Sonst
 * ueberstreichen Bogen + Spitze zusammen mehr als `sweep` und die Figur wirkt
 * asymmetrisch: Bogenanfang und Pfeilspitze sollen auf der gleichen "Hoehe"
 * liegen, also den vollen `sweep` gemeinsam ausfuellen, nicht Bogen(sweep) +
 * Spitze obendrauf.
 *
 * Konstruktion, ausgemessen am Konva-Fundstueck:
 *   Basiswinkel = endAngle - headAngle (in Bogenrichtung zurueckgesetzt)
 *   Basismitte  = auf dem Kreis, beim Basiswinkel
 *   Spitze      = Basismitte + Tangente * pointerLength   (~ endAngle)
 *   Bogen       = startAngle -> Basiswinkel                (endet unter der Basis)
 *
 * Winkel wie gehabt: von +u aus, wachsend Richtung +v, auf dem Schirm also im
 * Uhrzeigersinn. `sweep` traegt das Vorzeichen des Umlaufs.
 */

const f = (n) => Number(n.toFixed(3));

function onCircle(cu, cv, r, a) {
  return [cu + r * Math.cos(a), cv + r * Math.sin(a)];
}

/** Winkel, den die Spitze (Bogenlaengen-Naeherung) am Radius r einnimmt. */
function headAngle(r, pointerLength) {
  return pointerLength / r / 1.1;
}

/**
 * Nur Strich, keine Fuellung. Endet an der Basis der Spitze, also um
 * headAngle(r, pointerLength) vor dem nominellen Endwinkel startAngle+sweep.
 */
export function momentArcPath(cu, cv, r, startAngle, sweep, pointerLength = 0) {
  const s = Math.sign(sweep);
  const effSweep = sweep - s * headAngle(r, pointerLength);
  const [u0, v0] = onCircle(cu, cv, r, startAngle);
  const [u1, v1] = onCircle(cu, cv, r, startAngle + effSweep);
  const largeArc = Math.abs(effSweep) > Math.PI ? 1 : 0;
  const sweepFlag = effSweep > 0 ? 1 : 0;
  return `M ${f(u0)} ${f(v0)} A ${f(r)} ${f(r)} 0 ${largeArc} ${sweepFlag} ${f(u1)} ${f(v1)}`;
}

/**
 * Nur Fuellung, kein Strich. Die BASISMITTE sitzt auf dem Kreis, um headAngle
 * vor `endAngle` zurueckgesetzt (dort, wo der gekuerzte Bogen endet), die
 * Spitze steht tangential davor bei ~endAngle — die Strichkappe des Bogens
 * verschwindet damit unter dem Dreieck.
 *
 * `tiltDeg` kippt die Achse nach aussen; das Fundstueck hat 3 Grad. 0 ist rein
 * tangential.
 */
export function momentHeadPath(
  cu,
  cv,
  r,
  endAngle,
  sweep,
  pointerLength,
  pointerWidth,
  tiltDeg = 0,
) {
  const s = Math.sign(sweep);
  const baseAngle = endAngle - s * headAngle(r, pointerLength);
  const [bu, bv] = onCircle(cu, cv, r, baseAngle);
  // Tangente in Laufrichtung: Ableitung des Kreispunkts nach dem Winkel,
  // danach um tiltDeg nach aussen gedreht.
  const tx0 = -Math.sin(baseAngle) * s;
  const ty0 = Math.cos(baseAngle) * s;
  const phi = (tiltDeg * Math.PI * s) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const tx = tx0 * cosPhi - ty0 * sinPhi;
  const ty = tx0 * sinPhi + ty0 * cosPhi;
  const nu = -ty;
  const nv = tx;
  const h = pointerWidth / 2;
  return (
    `M ${f(bu + tx * pointerLength)} ${f(bv + ty * pointerLength)} ` +
    `L ${f(bu + nu * h)} ${f(bv + nv * h)} ` +
    `L ${f(bu - nu * h)} ${f(bv - nv * h)} Z`
  );
}
