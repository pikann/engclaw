/** Pure TS — no Electron/DOM imports. Shared by Pronounce and Shadowing. */
export { pyin, type PyinOptions, type PyinResult } from './pyin'
export { rms } from './energy'
export { ENERGY_MAX, extractEnergy, extractF0, interpolateF0, type ContourOptions } from './contour'
export {
  compareIntonation,
  extractContour,
  toSemitones,
  type Contour,
  type IntonationChart,
  type IntonationResult,
} from './intonation'
