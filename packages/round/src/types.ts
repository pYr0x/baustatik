export interface SmartOptions {
  sigDigits?: number; // default: 4
  minDecimals?: number; // default: 2
}

export interface RoundChain {
  toDecimals(n: number): number;
  toSignificant(n: number): number;
  toInteger(): number;
  smart(options?: SmartOptions): number;
  atomic(targetToBase: number, atomicToBase: number): number;
}
