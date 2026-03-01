import { AssertionError } from './errors';

/** Interner Guard für bereits geprüfte Array-Zugriffe */
export function at<T>(arr: T[], i: number): T {
  const v = arr[i];
  if (v === undefined)
    throw new AssertionError(`at(${i}): Index außerhalb des Arrays`);
  return v;
}
