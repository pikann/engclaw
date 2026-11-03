import { Innertube, UniversalCache } from 'youtubei.js'
const id = process.argv[2] ?? 'jNQXAC9IVRw'
for (const local of [false]) {
  const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: local })
  for (const client of ['WEB', 'MWEB', 'ANDROID', 'IOS', 'TV', 'WEB_EMBEDDED', 'WEB_CREATOR'] as const) {
    const t = Date.now()
    try {
      const info = await yt.getBasicInfo(id, { client })
      const a = info.streaming_data?.adaptive_formats?.filter((f) => f.has_audio && !f.has_video) ?? []
      console.log(client, 'OK', Date.now() - t, 'ms', info.playability_status?.status, 'audio', a.length, 'url?', a.some((f) => !!f.url), 'cipher?', a.some((f) => !!f.signature_cipher), 'caps', info.captions?.caption_tracks?.length)
    } catch (e) { console.log(client, 'ERR', String(e).slice(0, 120)) }
  }
  try {
    const info = await yt.getInfo(id)
    const tr = await info.getTranscript()
    console.log('transcript segs', tr.transcript.content?.body?.initial_segments?.length)
  } catch (e) { console.log('getInfo/transcript ERR', String(e).slice(0, 150)) }
}
