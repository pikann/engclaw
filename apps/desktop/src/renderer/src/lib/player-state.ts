import type { PlayerEvent } from '@engclaw/ipc-contract'

export interface PlayerState {
  phase: 'loading' | 'ready' | 'error'
  playing: boolean
  duration: number
  error: 'UNAVAILABLE' | 'NETWORK' | null
}

export const initialPlayerState: PlayerState = {
  phase: 'loading',
  playing: false,
  duration: 0,
  error: null,
}

/** Folds player events into UI state. `time` ticks are intentionally not part of it (20 Hz). */
export function reducePlayer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case 'ready':
      return state.phase === 'error'
        ? state
        : { ...state, phase: 'ready', duration: event.duration }
    case 'state':
      if (state.phase === 'error') return state
      return {
        ...state,
        playing: event.state === 'playing' || event.state === 'buffering',
      }
    case 'error':
      return { ...state, phase: 'error', playing: false, error: event.code }
    case 'time':
      return state
  }
}
