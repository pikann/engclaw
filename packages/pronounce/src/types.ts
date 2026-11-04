/** Shared recognition types. */

export interface PhoneHit {
  phone: string
  /** Max posterior over the phone's frames. */
  confidence: number
  /** Frame span, start inclusive, end exclusive. */
  start: number
  end: number
}

export interface Vocab {
  /** Token string by id. */
  tokens: string[]
  blankId: number
}
