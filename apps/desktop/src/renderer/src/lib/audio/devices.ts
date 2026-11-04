export interface InputDevice {
  deviceId: string
  label: string
}

/** Labels are empty until mic permission is granted; call after a successful getUserMedia. */
export async function listInputDevices(): Promise<InputDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
}
