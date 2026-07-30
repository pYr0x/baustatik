// Quelle: RSTAB 8.29.01 Querschnittsdatenbank (Dlubal), Ausdruck vom 29.07.2026,
//         extrahiert mit scripts/extract.ts.
// Tabellenwerte — NICHT nachgerechnet. Abweichungen gegen einen
// Integrator sind erwartet (Ausrundungsradien, Rundung der Norm).
//
// ERZEUGT UND EINGECHECKT. Nicht von Hand pflegen: `pnpm --filter
// @baustatik/steel-profiles extract` neu laufen lassen und den Diff pruefen.
//
// Einheiten: h/b/tw/tf/r [mm], A/Ay/Az [cm2], Iy/Iz/It [cm4], iy/iz [cm],
// Wel/Wpl/SyMax/SzMax [cm3], Iw [cm6], mass [kg/m].

import type { SteelProfileData } from '../types';

export const IPE = {
  'IPE 80': { h: 80, b: 46, tw: 3.8, tf: 5.2, r: 5, A: 7.64, Ay: 4.03, Az: 2.69, Iy: 80.14, Iz: 8.49, iy: 3.24, iz: 1.05, Wely: 20.03, Welz: 3.69, Wply: 23.22, Wplz: 5.82, It: 0.7, Iw: 120, SyMax: 11.61, SzMax: 1.38, mass: 6 },
  'IPE 100': { h: 100, b: 55, tw: 4.1, tf: 5.7, r: 7, A: 10.32, Ay: 5.27, Az: 3.69, Iy: 171, Iz: 15.92, iy: 4.07, iz: 1.24, Wely: 34.2, Welz: 5.79, Wply: 39.41, Wplz: 9.15, It: 1.2, Iw: 350, SyMax: 19.7, SzMax: 2.16, mass: 8.1 },
  'IPE 120': { h: 120, b: 64, tw: 4.4, tf: 6.3, r: 7, A: 13.21, Ay: 6.77, Az: 4.79, Iy: 317.8, Iz: 27.67, iy: 4.9, iz: 1.45, Wely: 52.96, Welz: 8.65, Wply: 60.73, Wplz: 13.58, It: 1.74, Iw: 890, SyMax: 30.36, SzMax: 3.23, mass: 10.4 },
  'IPE 140': { h: 140, b: 73, tw: 4.7, tf: 6.9, r: 7, A: 16.43, Ay: 8.45, Az: 5.99, Iy: 541.2, Iz: 44.92, iy: 5.74, iz: 1.65, Wely: 77.32, Welz: 12.31, Wply: 88.34, Wplz: 19.25, It: 2.45, Iw: 1980, SyMax: 44.17, SzMax: 4.6, mass: 12.9 },
  'IPE 160': { h: 160, b: 82, tw: 5, tf: 7.4, r: 9, A: 20.09, Ay: 10.17, Az: 7.33, Iy: 869.3, Iz: 68.31, iy: 6.58, iz: 1.84, Wely: 108.7, Welz: 16.66, Wply: 123.9, Wplz: 26.1, It: 3.6, Iw: 3960, SyMax: 61.95, SzMax: 6.22, mass: 15.8 },
  'IPE 180': { h: 180, b: 91, tw: 5.3, tf: 8, r: 9, A: 23.95, Ay: 12.19, Az: 8.76, Iy: 1317, Iz: 100.9, iy: 7.42, iz: 2.05, Wely: 146.3, Welz: 22.16, Wply: 166.4, Wplz: 34.6, It: 4.79, Iw: 7430, SyMax: 83.2, SzMax: 8.28, mass: 18.8 },
  'IPE 200': { h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12, A: 28.48, Ay: 14.23, Az: 10.35, Iy: 1943, Iz: 142.4, iy: 8.26, iz: 2.24, Wely: 194.3, Welz: 28.47, Wply: 220.6, Wplz: 44.61, It: 6.98, Iw: 12990, SyMax: 110.3, SzMax: 10.63, mass: 22.4 },
  'IPE 220': { h: 220, b: 110, tw: 5.9, tf: 9.2, r: 12, A: 33.37, Ay: 16.93, Az: 12.01, Iy: 2772, Iz: 204.9, iy: 9.11, iz: 2.48, Wely: 252, Welz: 37.25, Wply: 285.4, Wplz: 58.11, It: 9.07, Iw: 22670, SyMax: 142.7, SzMax: 13.92, mass: 26.2 },
  'IPE 240': { h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15, A: 39.12, Ay: 19.65, Az: 13.82, Iy: 3892, Iz: 283.6, iy: 9.97, iz: 2.69, Wely: 324.3, Welz: 47.27, Wply: 366.6, Wplz: 73.92, It: 12.88, Iw: 37390, SyMax: 183.3, SzMax: 17.64, mass: 30.7 },
  'IPE 270': { h: 270, b: 135, tw: 6.6, tf: 10.2, r: 15, A: 45.95, Ay: 23, Az: 16.57, Iy: 5790, Iz: 419.9, iy: 11.23, iz: 3.02, Wely: 428.9, Welz: 62.2, Wply: 484, Wplz: 96.95, It: 15.94, Iw: 70580, SyMax: 242, SzMax: 23.24, mass: 36.1 },
  'IPE 300': { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, A: 53.81, Ay: 26.81, Az: 19.82, Iy: 8356, Iz: 603.8, iy: 12.46, iz: 3.35, Wely: 557.1, Welz: 80.5, Wply: 628.4, Wplz: 125.2, It: 20.12, Iw: 125900, SyMax: 314.2, SzMax: 30.09, mass: 42.2 },
  'IPE 330': { h: 330, b: 160, tw: 7.5, tf: 11.5, r: 18, A: 62.61, Ay: 30.72, Az: 23.15, Iy: 11770, Iz: 788.1, iy: 13.71, iz: 3.55, Wely: 713.1, Welz: 98.52, Wply: 804.3, Wplz: 153.7, It: 28.15, Iw: 199100, SyMax: 402.15, SzMax: 36.8, mass: 49.1 },
  'IPE 360': { h: 360, b: 170, tw: 8, tf: 12.7, r: 18, A: 72.73, Ay: 36.05, Az: 26.92, Iy: 16270, Iz: 1043, iy: 14.95, iz: 3.79, Wely: 903.6, Welz: 122.8, Wply: 1019, Wplz: 191.1, It: 37.32, Iw: 313600, SyMax: 509.5, SzMax: 45.88, mass: 57.1 },
  'IPE 400': { h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21, A: 84.46, Ay: 40.59, Az: 32.33, Iy: 23130, Iz: 1318, iy: 16.55, iz: 3.95, Wely: 1156, Welz: 146.4, Wply: 1307, Wplz: 229, It: 51.08, Iw: 490000, SyMax: 653.5, SzMax: 54.67, mass: 66.3 },
  'IPE 450': { h: 450, b: 190, tw: 9.4, tf: 14.6, r: 21, A: 98.82, Ay: 46.36, Az: 39.79, Iy: 33740, Iz: 1676, iy: 18.48, iz: 4.12, Wely: 1500, Welz: 176.4, Wply: 1702, Wplz: 276.4, It: 66.87, Iw: 791000, SyMax: 851, SzMax: 65.88, mass: 77.6 },
  'IPE 500': { h: 500, b: 200, tw: 10.2, tf: 16, r: 21, A: 115.5, Ay: 53.55, Az: 48.06, Iy: 48200, Iz: 2142, iy: 20.43, iz: 4.31, Wely: 1928, Welz: 214.2, Wply: 2194, Wplz: 335.9, It: 89.29, Iw: 1249000, SyMax: 1097, SzMax: 80, mass: 90.7 },
  'IPE 550': { h: 550, b: 210, tw: 11.1, tf: 17.2, r: 24, A: 134.4, Ay: 60.47, Az: 57.65, Iy: 67120, Iz: 2668, iy: 22.35, iz: 4.45, Wely: 2441, Welz: 254.1, Wply: 2787, Wplz: 400.5, It: 123.2, Iw: 1884000, SyMax: 1393.5, SzMax: 94.82, mass: 105.5 },
  'IPE 600': { h: 600, b: 220, tw: 12, tf: 19, r: 24, A: 156, Ay: 70.04, Az: 67.99, Iy: 92080, Iz: 3387, iy: 24.3, iz: 4.66, Wely: 3069, Welz: 307.9, Wply: 3512, Wplz: 485.6, It: 165.4, Iw: 2846000, SyMax: 1756, SzMax: 114.95, mass: 122.5 },
} as const satisfies Record<string, SteelProfileData>;
