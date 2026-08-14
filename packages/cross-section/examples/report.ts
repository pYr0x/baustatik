import {
  type CrossSection,
  sectionProperties,
  stressPoints,
} from '@baustatik/cross-section';
import { convert } from '@baustatik/units';

/**
 * Die Ausgabe-Helfer der Beispiele — KEIN Teil der Package-Oberflaeche.
 *
 * Hier steht nur Formatierung. Gerechnet wird ausschliesslich in den
 * Beispieldateien daneben, und zwar mit genau den beiden Funktionen, die das
 * Package exportiert: `sectionProperties` und `stressPoints`.
 */

// Die Umrechnung geht hier in die GEGENRICHTUNG zu `src/calculation/units.ts`: das Package
// liefert SI, gedruckt wird die Katalogeinheit, in der man die Zahl gegen eine
// Profiltabelle haelt. Faktoren aus `@baustatik/units`, nicht als Literal.
const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');
const M_TO_MM = convert(1).from('m').toExact('mm');

function line(
  symbol: string,
  si: number,
  siUnit: string,
  factor: number,
  printUnit: string,
): string {
  const left = `${si.toExponential(6)} ${siUnit}`.padEnd(20);
  const right = (si * factor).toFixed(2).padStart(12);
  return `  ${symbol.padEnd(6)} = ${left} = ${right} ${printUnit}`;
}

function kappa(value: number | undefined): string {
  // `undefined` heisst SCHUBSTARR, nicht „null Schubflaeche" — deshalb steht
  // hier ein Wort und keine 0.
  return value === undefined ? 'schubstarr' : value.toFixed(4);
}

/**
 * Druckt einen Querschnitt vollstaendig: Querschnittswerte, kappa und
 * Spannungspunkte.
 */
export function report(title: string, cs: CrossSection): void {
  console.log(`\n=== ${title} ===`);

  const p = sectionProperties(cs);
  if (p === undefined) {
    // `sectionProperties` wirft nicht. `undefined` heisst „unsinnige
    // Abmessungen"; der FEM-Strang macht daraus einen Modellfehler im Bericht.
    console.log('  sectionProperties -> undefined (unsinnige Abmessungen)');
    return;
  }

  console.log('Querschnittswerte [SI = Rechenwert, rechts die Druckform]');
  console.log(line('A', p.A, 'm2', M2_TO_CM2, 'cm2'));
  console.log(line('Iy', p.Iy, 'm4', M4_TO_CM4, 'cm4'));
  console.log(line('Iz', p.Iz, 'm4', M4_TO_CM4, 'cm4'));
  console.log(line('Iyz', p.Iyz, 'm4', M4_TO_CM4, 'cm4'));
  // ys/zs liegen im EINGABESYSTEM der Quelle: bei den parametrischen Formen
  // z = 0 an der Oberkante, beim Walzprofil bereits schwerpunktsbezogen (0/0).
  console.log(line('ys', p.ys, 'm', M_TO_MM, 'mm'));
  console.log(line('zs', p.zs, 'm', M_TO_MM, 'mm'));
  // `It` steht nur beim duennwandigen Modell und beim Walzprofil; kompakt ist
  // es ein Randwertproblem und bleibt „nicht ermittelt" (ADR 0040).
  console.log(
    p.It === undefined
      ? '  It     = nicht ermittelt'
      : line('It', p.It, 'm4', M4_TO_CM4, 'cm4'),
  );
  console.log(
    `  kappaY = ${kappa(p.kappaY)}   kappaZ = ${kappa(p.kappaZ)}   [-]`,
  );

  const points = stressPoints(cs);
  if (points === undefined) {
    console.log('Spannungspunkte -> undefined (fuer diese Form keine Vorlage)');
    return;
  }

  console.log(`Spannungspunkte (${points.length}) — y/z/t in mm, S in cm3:`);
  console.table(
    points.map((sp) => ({
      Nr: sp.nr,
      'y [mm]': +sp.y.toFixed(2),
      'z [mm]': +sp.z.toFixed(2),
      't [mm]': +sp.t.toFixed(2),
      'Sy [cm3]': +sp.Sy.toFixed(3),
      'Sz [cm3]': +sp.Sz.toFixed(3),
    })),
  );
}
