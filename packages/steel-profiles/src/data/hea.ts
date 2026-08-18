// Quelle: Querschnittsdatenbank, Ausdruck vom 29.07.2026,
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

export const HEA = {
  'HEA 100': { h: 96, b: 100, tw: 5, tf: 8, r: 12, A: 21.24, Ay: 13.34, Az: 4.03, Iy: 349.2, Iz: 133.8, iy: 4.06, iz: 2.51, Wely: 72.76, Welz: 26.76, Wply: 83, Wplz: 41.1, It: 5.24, Iw: 2580, SyMax: 41.5, SzMax: 10, mass: 16.7 },
  'HEA 120': { h: 114, b: 120, tw: 5, tf: 8, r: 12, A: 25.34, Ay: 16, Az: 4.86, Iy: 606.2, Iz: 230.9, iy: 4.89, iz: 3.02, Wely: 106.3, Welz: 38.48, Wply: 119.5, Wplz: 58.9, It: 5.99, Iw: 6470, SyMax: 59.75, SzMax: 14.4, mass: 19.9 },
  'HEA 140': { h: 133, b: 140, tw: 5.5, tf: 8.5, r: 12, A: 31.42, Ay: 19.83, Az: 6.25, Iy: 1033, Iz: 389.3, iy: 5.73, iz: 3.52, Wely: 155.4, Welz: 55.62, Wply: 173.5, Wplz: 84.9, It: 8.13, Iw: 15060, SyMax: 86.75, SzMax: 20.83, mass: 24.7 },
  'HEA 160': { h: 152, b: 160, tw: 6, tf: 9, r: 15, A: 38.77, Ay: 23.99, Az: 7.85, Iy: 1673, Iz: 615.6, iy: 6.57, iz: 3.98, Wely: 220.1, Welz: 76.95, Wply: 245.1, Wplz: 117.6, It: 12.19, Iw: 31410, SyMax: 122.55, SzMax: 28.8, mass: 30.4 },
  'HEA 180': { h: 171, b: 180, tw: 6, tf: 9.5, r: 15, A: 45.25, Ay: 28.48, Az: 8.89, Iy: 2510, Iz: 924.6, iy: 7.45, iz: 4.52, Wely: 293.6, Welz: 102.7, Wply: 324.9, Wplz: 156.5, It: 14.8, Iw: 60210, SyMax: 162.45, SzMax: 38.47, mass: 35.5 },
  'HEA 200': { h: 190, b: 200, tw: 6.5, tf: 10, r: 18, A: 53.83, Ay: 33.3, Az: 10.77, Iy: 3692, Iz: 1336, iy: 8.28, iz: 4.98, Wely: 388.6, Welz: 133.6, Wply: 429.5, Wplz: 203.8, It: 20.98, Iw: 108000, SyMax: 214.75, SzMax: 50, mass: 42.3 },
  'HEA 220': { h: 210, b: 220, tw: 7, tf: 11, r: 18, A: 64.34, Ay: 40.3, Az: 12.8, Iy: 5410, Iz: 1955, iy: 9.17, iz: 5.51, Wely: 515.2, Welz: 177.7, Wply: 568.5, Wplz: 270.6, It: 28.46, Iw: 193300, SyMax: 284.25, SzMax: 66.55, mass: 50.5 },
  'HEA 240': { h: 230, b: 240, tw: 7.5, tf: 12, r: 21, A: 76.84, Ay: 47.96, Az: 15.1, Iy: 7763, Iz: 2769, iy: 10.05, iz: 6, Wely: 675.1, Welz: 230.7, Wply: 744.6, Wplz: 351.7, It: 41.55, Iw: 328500, SyMax: 372.3, SzMax: 86.4, mass: 60.3 },
  'HEA 260': { h: 250, b: 260, tw: 7.5, tf: 12.5, r: 24, A: 86.82, Ay: 54.08, Az: 16.58, Iy: 10450, Iz: 3668, iy: 10.97, iz: 6.5, Wely: 836.4, Welz: 282.1, Wply: 919.8, Wplz: 430.2, It: 52.37, Iw: 516400, SyMax: 459.9, SzMax: 105.63, mass: 68.2 },
  'HEA 280': { h: 270, b: 280, tw: 8, tf: 13, r: 24, A: 97.26, Ay: 60.6, Az: 19.05, Iy: 13670, Iz: 4763, iy: 11.86, iz: 7, Wely: 1013, Welz: 340.2, Wply: 1112, Wplz: 518.1, It: 62.1, Iw: 785400, SyMax: 556, SzMax: 127.4, mass: 76.3 },
  'HEA 300': { h: 290, b: 300, tw: 8.5, tf: 14, r: 27, A: 112.5, Ay: 69.89, Az: 21.83, Iy: 18260, Iz: 6310, iy: 12.74, iz: 7.49, Wely: 1260, Welz: 420.6, Wply: 1383, Wplz: 641.2, It: 85.17, Iw: 1200000, SyMax: 691.5, SzMax: 157.5, mass: 88.3 },
  'HEA 320': { h: 310, b: 300, tw: 9, tf: 15.5, r: 27, A: 124.4, Ay: 77.42, Az: 24.79, Iy: 22930, Iz: 6985, iy: 13.58, iz: 7.49, Wely: 1479, Welz: 465.7, Wply: 1628, Wplz: 709.7, It: 108, Iw: 1512000, SyMax: 814, SzMax: 174.38, mass: 97.7 },
  'HEA 340': { h: 330, b: 300, tw: 9.5, tf: 16.5, r: 27, A: 133.5, Ay: 82.43, Az: 27.93, Iy: 27690, Iz: 7436, iy: 14.4, iz: 7.46, Wely: 1678, Welz: 495.7, Wply: 1850, Wplz: 755.9, It: 127.2, Iw: 1824000, SyMax: 925, SzMax: 185.63, mass: 104.8 },
  'HEA 360': { h: 350, b: 300, tw: 10, tf: 17.5, r: 27, A: 142.8, Ay: 87.45, Az: 31.33, Iy: 33090, Iz: 7887, iy: 15.22, iz: 7.43, Wely: 1891, Welz: 525.8, Wply: 2088, Wplz: 802.3, It: 148.8, Iw: 2177000, SyMax: 1044, SzMax: 196.88, mass: 112.1 },
  'HEA 400': { h: 390, b: 300, tw: 11, tf: 19, r: 27, A: 159, Ay: 94.99, Az: 38.67, Iy: 45070, Iz: 8564, iy: 16.84, iz: 7.34, Wely: 2311, Welz: 570.9, Wply: 2562, Wplz: 872.9, It: 189, Iw: 2942000, SyMax: 1281, SzMax: 213.75, mass: 124.8 },
  'HEA 450': { h: 440, b: 300, tw: 11.5, tf: 21, r: 27, A: 178, Ay: 105.01, Az: 45.98, Iy: 63720, Iz: 9465, iy: 18.92, iz: 7.29, Wely: 2896, Welz: 631, Wply: 3216, Wplz: 965.5, It: 243.8, Iw: 4148000, SyMax: 1608, SzMax: 236.25, mass: 139.7 },
  'HEA 500': { h: 490, b: 300, tw: 12, tf: 23, r: 27, A: 197.5, Ay: 115.05, Az: 53.82, Iy: 86970, Iz: 10370, iy: 20.98, iz: 7.24, Wely: 3550, Welz: 691.1, Wply: 3949, Wplz: 1059, It: 309.3, Iw: 5643000, SyMax: 1974.5, SzMax: 258.75, mass: 155 },
  'HEA 550': { h: 540, b: 300, tw: 12.5, tf: 24, r: 27, A: 211.8, Ay: 120.16, Az: 62.36, Iy: 111900, Iz: 10820, iy: 22.99, iz: 7.15, Wely: 4146, Welz: 721.3, Wply: 4622, Wplz: 1107, It: 351.5, Iw: 7189000, SyMax: 2311, SzMax: 270, mass: 166.3 },
  'HEA 600': { h: 590, b: 300, tw: 13, tf: 25, r: 27, A: 226.5, Ay: 125.21, Az: 71.21, Iy: 141200, Iz: 11270, iy: 24.97, iz: 7.05, Wely: 4787, Welz: 751.4, Wply: 5350, Wplz: 1156, It: 397.8, Iw: 8978000, SyMax: 2675, SzMax: 281.25, mass: 177.8 },
  'HEA 650': { h: 640, b: 300, tw: 13.5, tf: 26, r: 27, A: 241.6, Ay: 130.27, Az: 80.54, Iy: 175200, Iz: 11720, iy: 26.93, iz: 6.97, Wely: 5474, Welz: 781.6, Wply: 6136, Wplz: 1205, It: 448.3, Iw: 11030000, SyMax: 3068, SzMax: 292.5, mass: 189.7 },
  'HEA 700': { h: 690, b: 300, tw: 14.5, tf: 27, r: 27, A: 260.5, Ay: 135.38, Az: 93.45, Iy: 215300, Iz: 12180, iy: 28.75, iz: 6.84, Wely: 6241, Welz: 811.9, Wply: 7032, Wplz: 1257, It: 513.9, Iw: 13350000, SyMax: 3516, SzMax: 303.75, mass: 204.5 },
  'HEA 800': { h: 790, b: 300, tw: 15, tf: 28, r: 30, A: 285.8, Ay: 140.5, Az: 111.66, Iy: 303400, Iz: 12640, iy: 32.58, iz: 6.65, Wely: 7682, Welz: 842.6, Wply: 8699, Wplz: 1312, It: 596.9, Iw: 18290000, SyMax: 4349.5, SzMax: 315, mass: 224.4 },
  'HEA 900': { h: 890, b: 300, tw: 16, tf: 30, r: 30, A: 320.5, Ay: 150.7, Az: 134.55, Iy: 422100, Iz: 13550, iy: 36.29, iz: 6.5, Wely: 9485, Welz: 903.2, Wply: 10810, Wplz: 1414, It: 736.8, Iw: 24960000, SyMax: 5405, SzMax: 337.5, mass: 251.6 },
  'HEA 1000': { h: 990, b: 300, tw: 16.5, tf: 31, r: 30, A: 346.8, Ay: 155.86, Az: 154.85, Iy: 553800, Iz: 14000, iy: 39.96, iz: 6.35, Wely: 11190, Welz: 933.6, Wply: 12820, Wplz: 1470, It: 822.4, Iw: 32070000, SyMax: 6410, SzMax: 348.75, mass: 272.2 },
} as const satisfies Record<string, SteelProfileData>;
