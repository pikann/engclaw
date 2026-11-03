import { Innertube, UniversalCache } from 'youtubei.js'
const id = process.argv[2] ?? 'jNQXAC9IVRw'
const yt = await Innertube.create({ cache: new UniversalCache(false) })
for (const client of ['IOS', 'MWEB'] as const) {
  const info = await yt.getBasicInfo(id, { client })
  const track = info.captions?.caption_tracks?.[0]
  console.log(client, 'track', track?.language_code, track?.kind)
  if (track) {
    const t = Date.now()
    const r = await fetch(track.base_url + '&fmt=json3')
    const txt = await r.text()
    console.log(' timedtext', r.status, txt.length, Date.now() - t, 'ms', txt.slice(0, 120))
  }
  const f = info.streaming_data!.adaptive_formats.filter((f) => f.has_audio && !f.has_video).sort((x, y) => x.bitrate - y.bitrate)[0]!
  console.log(' audio', f.itag, f.mime_type, f.bitrate, f.content_length)
  const t = Date.now()
  const r = await fetch(f.url! + '&range=0-262143')
  const buf = Buffer.from(await r.arrayBuffer())
  console.log(' range fetch', r.status, buf.length, Date.now() - t, 'ms')
}
