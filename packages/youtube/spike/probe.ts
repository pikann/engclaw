import { Innertube, UniversalCache } from 'youtubei.js'
const id = process.argv[2] ?? 'jNQXAC9IVRw'
const t0 = Date.now()
const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true })
console.log('session ms', Date.now() - t0)
const t1 = Date.now()
const info = await yt.getInfo(id)
console.log('info ms', Date.now() - t1, info.basic_info.title, info.basic_info.duration)
console.log('captions', info.captions?.caption_tracks?.map((c) => [c.language_code, c.kind]))
const t2 = Date.now()
try {
  const tr = await info.getTranscript()
  const segs = tr.transcript.content?.body?.initial_segments ?? []
  console.log('transcript ms', Date.now() - t2, segs.length, segs[0]?.snippet?.text, segs[0]?.start_ms)
} catch (e) { console.log('transcript err', String(e)) }
const fmts = info.streaming_data?.adaptive_formats?.filter((f) => f.has_audio && !f.has_video)
console.log('audio fmts', fmts?.map((f) => [f.itag, f.mime_type, f.bitrate, f.content_length, !!f.url, !!f.signature_cipher]))
