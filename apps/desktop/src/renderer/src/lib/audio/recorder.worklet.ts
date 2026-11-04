/// <reference lib="webworker" />
// AudioWorkletProcessor: forwards mono input frames (copied) to the main thread.
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0]
    if (ch) this.port.postMessage(ch.slice())
    return true
  }
}
registerProcessor('recorder', RecorderProcessor as never)
export {}
