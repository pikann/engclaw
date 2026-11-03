/** Pure TS port of librosa.pyin (Mauch & Dixon 2014). No Electron/DOM imports. */

export interface PyinOptions {
  sampleRate: number
  fmin?: number
  fmax?: number
  frameLength?: number
  hopLength?: number
  nThresholds?: number
  betaParameters?: [number, number]
  boltzmannParameter?: number
  resolution?: number
  maxTransitionRate?: number
  switchProb?: number
  noTroughProb?: number
}

export interface PyinResult {
  /** Hz per frame; NaN when unvoiced. */
  f0: Float32Array
  voicedFlag: Uint8Array
  voicedProb: Float32Array
  hopLength: number
}

const TINY = 1.1754943508222875e-38

/** CDF of Beta(a, b) for integer a, b via the binomial identity. */
function betaCdfInt(x: number, a: number, b: number): number {
  const n = a + b - 1
  let sum = 0
  let coeff = 1 // C(n, 0)
  const terms: number[] = []
  for (let j = 0; j <= n; j++) {
    terms.push(coeff * Math.pow(x, j) * Math.pow(1 - x, n - j))
    coeff = (coeff * (n - j)) / (j + 1)
  }
  for (let j = a; j <= n; j++) sum += terms[j]!
  return sum
}

function boltzmannPmf(k: number, lambda: number, n: number): number {
  return ((1 - Math.exp(-lambda)) * Math.exp(-lambda * k)) / (1 - Math.exp(-lambda * n))
}

/**
 * Cumulative mean normalized difference for one frame, tau in [minPeriod, maxPeriod].
 * Matches librosa >= 0.11: d(k) = 2 (acf(0) - acf(k)) - sum_{m<k} x[m]^2 over the whole frame.
 */
function cmnd(frame: Float32Array, minPeriod: number, maxPeriod: number): Float64Array {
  const n = frame.length
  const out = new Float64Array(maxPeriod - minPeriod + 1)
  let acf0 = 0
  for (let j = 0; j < n; j++) acf0 += frame[j]! * frame[j]!
  let head = 0 // sum_{m<k} x[m]^2
  let denom = 0 // sum_{j<=k} d(j)
  for (let k = 1; k <= maxPeriod; k++) {
    head += frame[k - 1]! * frame[k - 1]!
    let acf = 0
    for (let j = 0; j + k < n; j++) acf += frame[j]! * frame[j + k]!
    const d = 2 * (acf0 - acf) - head
    denom += d
    if (k >= minPeriod) out[k - minPeriod] = d / (denom / k + TINY)
  }
  return out
}

export function pyin(y: Float32Array, opts: PyinOptions): PyinResult {
  const sr = opts.sampleRate
  const fmin = opts.fmin ?? 50
  const fmax = opts.fmax ?? 300
  const frameLength = opts.frameLength ?? 2048
  const hop = opts.hopLength ?? frameLength >> 2
  const nThresholds = opts.nThresholds ?? 100
  const [betaA, betaB] = opts.betaParameters ?? [2, 18]
  const boltzmann = opts.boltzmannParameter ?? 2
  const resolution = opts.resolution ?? 0.1
  const maxRate = opts.maxTransitionRate ?? 35.92
  const switchProb = opts.switchProb ?? 0.01
  const noTroughProb = opts.noTroughProb ?? 0.01

  const minPeriod = Math.floor(sr / fmax)
  const maxPeriod = Math.min(Math.ceil(sr / fmin), frameLength - 1)

  const thresholds = Array.from({ length: nThresholds + 1 }, (_, i) => i / nThresholds)
  const betaCdf = thresholds.map((t) => betaCdfInt(t, betaA, betaB))
  const betaProbs = betaCdf.slice(1).map((v, i) => v - betaCdf[i]!)

  const binsPerSemitone = Math.ceil(1 / resolution)
  const nBins = Math.floor(12 * binsPerSemitone * Math.log2(fmax / fmin)) + 1
  const nFrames = 1 + Math.floor(y.length / hop)
  const pad = frameLength >> 1

  const obs = new Float64Array((2 * nBins + 1) * nFrames) // [state * nFrames + t]
  const voicedProb = new Float32Array(nFrames)
  const frame = new Float32Array(frameLength)

  for (let t = 0; t < nFrames; t++) {
    const start = t * hop - pad
    for (let i = 0; i < frameLength; i++) {
      const idx = start + i
      frame[i] = idx >= 0 && idx < y.length ? y[idx]! : 0
    }
    const yin = cmnd(frame, minPeriod, maxPeriod)
    const n = yin.length

    // troughs
    const troughs: number[] = []
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? yin[i - 1]! : yin[i]!
      const next = i < n - 1 ? yin[i + 1]! : yin[i]!
      let isTrough = yin[i]! < prev && yin[i]! <= next
      if (i === 0) isTrough = yin[0]! < yin[1]!
      if (isTrough) troughs.push(i)
    }

    let voiced = 0
    if (troughs.length > 0) {
      const heights = troughs.map((i) => yin[i]!)
      let globalMin = 0
      for (let k = 1; k < heights.length; k++) if (heights[k]! < heights[globalMin]!) globalMin = k
      const probs = new Float64Array(troughs.length)
      for (let ti = 0; ti < nThresholds; ti++) {
        const th = thresholds[ti + 1]!
        let count = 0
        for (const h of heights) if (h < th) count++
        if (count === 0) continue
        let pos = 0
        for (let k = 0; k < heights.length; k++) {
          if (heights[k]! < th) {
            probs[k] = probs[k]! + boltzmannPmf(pos, boltzmann, count) * betaProbs[ti]!
            pos++
          }
        }
      }
      let below = 0
      for (let ti = 0; ti < nThresholds; ti++) if (!(heights[globalMin]! < thresholds[ti + 1]!)) below++
      let cum = 0
      for (let ti = 0; ti < below; ti++) cum += betaProbs[ti]!
      probs[globalMin] = probs[globalMin]! + noTroughProb * cum

      for (let k = 0; k < troughs.length; k++) {
        const i = troughs[k]!
        const p = probs[k]!
        if (p <= 0) continue
        let shift = 0
        if (i > 0 && i < n - 1) {
          const a = (yin[i - 1]! + yin[i + 1]!) / 2 - yin[i]!
          const b = (yin[i + 1]! - yin[i - 1]!) / 2
          if (Math.abs(b) < Math.abs(a)) shift = -b / (2 * a + 0) // |b|<|a| implies a != 0
        }
        const period = minPeriod + i + shift
        const f0c = sr / period
        // librosa clips to [0, nBins] and later writes over the unvoiced rows, so bin == nBins is dropped;
        // colliding bins overwrite rather than sum.
        const bin = Math.min(Math.max(Math.round(12 * binsPerSemitone * Math.log2(f0c / fmin)), 0), nBins)
        obs[bin * nFrames + t] = p
      }
    }
    for (let s = 0; s < nBins; s++) voiced += obs[s * nFrames + t]!
    voicedProb[t] = Math.min(Math.max(voiced, 0), 1)
    const unv = (1 - voicedProb[t]!) / nBins
    for (let s = 0; s < nBins; s++) obs[(nBins + s) * nFrames + t] = unv
  }

  const states = viterbi(obs, nBins, nFrames, {
    width: Math.round((maxRate * 12 * hop) / sr) * binsPerSemitone + 1,
    switchProb,
  })

  const f0 = new Float32Array(nFrames)
  const voicedFlag = new Uint8Array(nFrames)
  for (let t = 0; t < nFrames; t++) {
    const s = states[t]!
    if (s < nBins) {
      voicedFlag[t] = 1
      f0[t] = fmin * Math.pow(2, s / (12 * binsPerSemitone))
    } else f0[t] = NaN
  }
  return { f0, voicedFlag, voicedProb, hopLength: hop }
}

/** Log-domain Viterbi over [voiced bins | unvoiced bins] with local triangular transitions. */
function viterbi(
  obs: Float64Array,
  nBins: number,
  nFrames: number,
  { width, switchProb }: { width: number; switchProb: number },
): Uint16Array {
  const half = (width - 1) >> 1
  // row-normalised triangular weights: w(d) = (2(half-|d|)+1)/width, truncated at edges
  const raw = (d: number) => (2 * (half - Math.abs(d)) + 1) / width
  const rowSum = new Float64Array(nBins)
  for (let i = 0; i < nBins; i++) {
    let s = 0
    for (let d = -half; d <= half; d++) if (i + d >= 0 && i + d < nBins) s += raw(d)
    rowSum[i] = s
  }
  const logStay = Math.log(1 - switchProb)
  const logSwitch = Math.log(switchProb)
  const logTab = new Float64Array(nBins * width)
  for (let i = 0; i < nBins; i++)
    for (let d = -half; d <= half; d++)
      logTab[i * width + d + half] = Math.log(raw(d) / rowSum[i]! + TINY)
  const logT = (i: number, d: number) => logTab[i * width + d + half]!

  const nStates = 2 * nBins
  const lo = (s: number) => Math.log(obs[s * nFrames]! + TINY)
  let prev = new Float64Array(nStates)
  let cur = new Float64Array(nStates)
  const back = new Uint16Array(nStates * nFrames)
  const pInit = Math.log(1 / nStates)
  for (let s = 0; s < nStates; s++) prev[s] = pInit + lo(s)

  for (let t = 1; t < nFrames; t++) {
    for (let j = 0; j < nStates; j++) {
      const jb = j % nBins
      const jVoiced = j < nBins
      let best = -Infinity
      let arg = 0
      for (let d = -half; d <= half; d++) {
        const ib = jb + d // source bin; transition i->j is row i, offset j-i = -d
        if (ib < 0 || ib >= nBins) continue
        const tr = logT(ib, -d)
        for (let src = 0; src < 2; src++) {
          const i = src === 0 ? ib : nBins + ib
          const same = (i < nBins) === jVoiced
          const v = prev[i]! + tr + (same ? logStay : logSwitch)
          if (v > best) {
            best = v
            arg = i
          }
        }
      }
      cur[j] = best + Math.log(obs[j * nFrames + t]! + TINY)
      back[t * nStates + j] = arg
    }
    ;[prev, cur] = [cur, prev]
  }
  const states = new Uint16Array(nFrames)
  let s = 0
  for (let k = 1; k < nStates; k++) if (prev[k]! > prev[s]!) s = k
  for (let t = nFrames - 1; t >= 0; t--) {
    states[t] = s
    if (t > 0) s = back[t * nStates + s]!
  }
  return states
}
