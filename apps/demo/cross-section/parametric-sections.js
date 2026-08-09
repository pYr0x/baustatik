import {
  sectionProperties,
  stressPoints,
} from '@baustatik/cross-section';
import { convert } from '@baustatik/units';

// Druckeinheiten wie im Bericht der Beispiele: das Package liefert SI, gezeigt
// werden die Katalogeinheiten, gegen die man eine Profiltabelle haelt.
const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');
const M_TO_MM = convert(1).from('m').toExact('mm');

// Alle Beispiele mit kind: 'shape' aus packages/cross-section/examples — als
// Daten hier eingebettet, damit die Seite ohne Nachschlagen funktioniert.
const groups = [
  {
    name: 'Gültige Formen',
    sections: [
      {
        title: 'Rechteck b = 200 mm, h = 500 mm',
        spec: 'Die einzige Form ohne idealisation — ein duennwandiges Vollrechteck gibt es nicht. kappa faellt als exakt 5/6 heraus.',
        cs: {
          kind: 'shape',
          id: 'rechteck-200x500',
          shape: { kind: 'rectangle', b: 200, h: 500 },
        },
      },
      {
        title: 'I geschweisst 200 x 100 x 5,6 x 8,5 — solid',
        spec: 'Umrissmodell (Grashof): waagerechte Schnitte durch die volle Umrissfigur. 15 Spannungspunkte.',
        cs: {
          kind: 'shape',
          id: 'i-200-solid',
          shape: {
            kind: 'i-symmetric',
            h: 200,
            b: 100,
            tw: 5.6,
            tf: 8.5,
            idealisation: 'solid',
          },
        },
      },
      {
        title: 'I geschweisst 200 x 100 x 5,6 x 8,5 — thin-walled',
        spec: 'Wandmodell: der Schubfluss laeuft laengs der Wandmittellinien. Dieselben Koordinaten und Nummern, andere t, S und kappa.',
        cs: {
          kind: 'shape',
          id: 'i-200-thin-walled',
          shape: {
            kind: 'i-symmetric',
            h: 200,
            b: 100,
            tw: 5.6,
            tf: 8.5,
            idealisation: 'thin-walled',
          },
        },
      },
      {
        title: 'Plattenbalken 2000/200/250/500 — solid',
        spec: 'Stahlbeton-Plattenbalken, kompakt. Der Fall, der Steiner prueft: zs = 139,5 mm liegt IM Gurt (hf = 200 mm).',
        cs: {
          kind: 'shape',
          id: 'plattenbalken',
          shape: {
            kind: 't-section',
            bf: 2000,
            hf: 200,
            bw: 250,
            h: 500,
            idealisation: 'solid',
          },
        },
      },
      {
        title: 'Stahl-T geschweisst 200/15/10/300 — thin-walled',
        spec: 'S laeuft um den Schwerpunkt des WANDMODELLS, die Koordinaten um den der Umrissfigur — bei dieser unsymmetrischen Form fallen beide auseinander.',
        cs: {
          kind: 'shape',
          id: 'stahl-t',
          shape: {
            kind: 't-section',
            bf: 200,
            hf: 15,
            bw: 10,
            h: 300,
            idealisation: 'thin-walled',
          },
        },
      },
      {
        title: 'Kasten 200 x 400 x 10 — thin-walled',
        spec: 'Geschlossener Kasten mit umlaufend gleicher Wandstaerke. Querschnittswerte stehen, aber stressPoints liefert undefined — dem Kasten fehlen die Referenzdaten.',
        cs: {
          kind: 'shape',
          id: 'kasten-200x400x10',
          shape: {
            kind: 'hollow-rectangle',
            b: 200,
            h: 400,
            t: 10,
            idealisation: 'thin-walled',
          },
        },
      },
    ],
  },
];

const container = document.getElementById('sections');

for (const group of groups) {
  const heading = document.createElement('h2');
  heading.textContent = group.name;
  container.appendChild(heading);

  group.sections.forEach((section, index) => {
    const card = document.createElement('section');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent = section.title;
    card.appendChild(title);

    const spec = document.createElement('p');
    spec.className = 'spec';
    spec.textContent = section.spec;
    card.appendChild(spec);

    const input = document.createElement('pre');
    input.className = 'input';
    input.textContent = JSON.stringify(section.cs.shape, null, 2);
    card.appendChild(input);

    const result = document.createElement('div');
    result.className = 'result';
    result.id = `result-${index}`;
    card.appendChild(result);

    container.appendChild(card);
  });
}

document.getElementById('calculate').addEventListener('click', () => {
  let i = 0;
  for (const group of groups) {
    for (const section of group.sections) {
      document.getElementById(`result-${i}`).innerHTML = render(section.cs);
      i += 1;
    }
  }
});

function render(cs) {
  const p = sectionProperties(cs);
  if (p === undefined) {
    return '<p class="error">sectionProperties &rarr; undefined — unsinnige Abmessungen</p>';
  }

  const parts = [propertyTable(p)];

  const points = stressPoints(cs);
  if (points === undefined) {
    parts.push(
      '<p class="muted">stressPoints &rarr; undefined — fuer diese Form gibt es keine Vorlage</p>',
    );
  } else {
    parts.push(stressTable(points));
  }

  return parts.join('\n');
}

function propertyTable(p) {
  return `
<table class="values">
  <tbody>
    ${row('A', num(p.A * M2_TO_CM2, 'cm²'))}
    ${row('Iy', num(p.Iy * M4_TO_CM4, 'cm⁴'))}
    ${row('Iz', num(p.Iz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iyz', num(p.Iyz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iu', num(p.Iu * M4_TO_CM4, 'cm⁴'))}
    ${row('Iv', num(p.Iv * M4_TO_CM4, 'cm⁴'))}
    ${row('ys', num(p.ys * M_TO_MM, 'mm'))}
    ${row('zs', num(p.zs * M_TO_MM, 'mm'))}
    ${row('yM', maybe(p.yM, 'mm'))}
    ${row('zM', maybe(p.zM, 'mm'))}
    ${row('alpha', `${p.alpha.toFixed(4)} rad`)}
    ${row('kappaY / kappaZ', `${kappa(p.kappaY)} / ${kappa(p.kappaZ)}`)}
  </tbody>
</table>`;
}

function stressTable(points) {
  const body = points
    .map(
      (sp) => `<tr>
        <td>${sp.nr}</td>
        <td>${sp.y.toFixed(2)}</td>
        <td>${sp.z.toFixed(2)}</td>
        <td>${sp.t.toFixed(2)}</td>
        <td>${sp.Sy.toFixed(3)}</td>
        <td>${sp.Sz.toFixed(3)}</td>
      </tr>`,
    )
    .join('');

  return `
<p class="muted">Spannungspunkte (${points.length}) — y/z/t in mm, S in cm³:</p>
<table class="points">
  <thead>
    <tr>
      <th>Nr</th>
      <th>y [mm]</th>
      <th>z [mm]</th>
      <th>t [mm]</th>
      <th>Sy [cm³]</th>
      <th>Sz [cm³]</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
}

function row(label, value) {
  return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function num(value, unit, digits = 2) {
  return `${value.toFixed(digits)} ${unit}`;
}

function maybe(value, unit) {
  return value === undefined ? '&ndash;' : num(value, unit);
}

function kappa(value) {
  return value === undefined ? 'schubstarr' : value.toFixed(4);
}
