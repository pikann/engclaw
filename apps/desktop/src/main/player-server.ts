import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const PLAYER_CSP = [
  "default-src 'none'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
  "style-src 'unsafe-inline'",
  'img-src https://i.ytimg.com data:',
  'connect-src https://www.youtube.com',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const PLAYER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Player</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#player{width:100%;height:100%}</style>
</head><body><div id="player"></div><script src="/player.js"></script></body></html>`

// Runs inside the sandboxed player view. `window.engclawPlayer` is injected by the player preload.
const PLAYER_JS = `(function () {
  var bridge = window.engclawPlayer;
  var videoId = new URLSearchParams(location.search).get('v');
  var player = null;
  var ticker = 0;
  function emit(m) { if (bridge) bridge.emit(m); }
  function duration() { return player && player.getDuration ? player.getDuration() || 0 : 0; }
  function sendTime() {
    if (player && player.getCurrentTime) emit({ type: 'time', seconds: player.getCurrentTime(), duration: duration() });
  }
  function setTicking(on) {
    if (on && !ticker) ticker = setInterval(sendTime, 50);
    if (!on && ticker) { clearInterval(ticker); ticker = 0; }
  }
  function hideCaptions() {
    try { player.unloadModule('captions'); player.unloadModule('cc'); } catch (e) {}
  }
  var STATES = { '-1': 'cued', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      videoId: videoId,
      width: '100%',
      height: '100%',
      host: 'https://www.youtube.com',
      playerVars: { enablejsapi: 1, origin: location.origin, playsinline: 1, rel: 0, controls: 0,
        disablekb: 1, fs: 0, iv_load_policy: 3, cc_load_policy: 0 },
      events: {
        onReady: function () { hideCaptions(); emit({ type: 'ready', duration: duration() }); sendTime(); },
        onStateChange: function (e) {
          var state = STATES[e.data];
          if (!state) return;
          if (state === 'playing') hideCaptions();
          setTicking(state === 'playing' || state === 'buffering');
          emit({ type: 'state', state: state });
          sendTime();
        },
        onError: function (e) { emit({ type: 'error', code: 'UNAVAILABLE', detail: e.data }); }
      }
    });
  };
  if (bridge) bridge.onCommand(function (c) {
    if (!player || !player.playVideo) return;
    if (c.type === 'play') player.playVideo();
    else if (c.type === 'pause') player.pauseVideo();
    else if (c.type === 'seek') { player.seekTo(c.seconds, true); sendTime(); }
  });
  var s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = function () { emit({ type: 'error', code: 'NETWORK' }); };
  document.head.appendChild(s);
})();`

export interface PlayerServer {
  origin: string
  port: number
  address(): string
  close(): Promise<void>
}

/**
 * Tiny loopback HTTP server that hosts the YouTube IFrame player page. YouTube rejects embeds
 * from file:// and custom schemes (Error 153), but accepts a real http origin. It serves exactly
 * two static resources, only to requests addressed to its own 127.0.0.1:<port> host.
 */
export function startPlayerServer(): Promise<PlayerServer> {
  return new Promise((resolve, reject) => {
    let port = 0
    const server: Server = createServer((req, res) => {
      const send = (
        status: number,
        type: string,
        body: string,
        extra: Record<string, string> = {},
      ) => {
        res.writeHead(status, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...extra,
        })
        res.end(body)
      }
      if (req.headers.host !== `127.0.0.1:${port}`) return send(403, 'text/plain', 'Forbidden')
      if (req.method !== 'GET')
        return send(405, 'text/plain', 'Method Not Allowed', { Allow: 'GET' })
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname === '/player.js')
        return send(200, 'text/javascript; charset=utf-8', PLAYER_JS, {
          'Content-Security-Policy': PLAYER_CSP,
        })
      if (url.pathname === '/player.html') {
        if (!VIDEO_ID.test(url.searchParams.get('v') ?? ''))
          return send(400, 'text/plain', 'Bad video id')
        return send(200, 'text/html; charset=utf-8', PLAYER_HTML, {
          'Content-Security-Policy': PLAYER_CSP,
        })
      }
      send(404, 'text/plain', 'Not Found')
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        address: () => (server.address() as AddressInfo).address,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
            server.closeAllConnections()
          }),
      })
    })
  })
}
