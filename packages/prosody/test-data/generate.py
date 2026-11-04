"""Regenerates golden.json from librosa 0.11: python generate.py golden.json"""
import json, sys, numpy as np, librosa
sr = 22050
rng = np.random.default_rng(0)
t = np.arange(int(sr * 2.0)) / sr
# voiced glide 120->200 Hz (0.1-0.9 s), pause, voiced 180->110 Hz (1.1-1.8 s), fricative-like noise burst between
f = np.where(t < 1.0, 120 + 80 * (t - 0.1) / 0.8, 180 - 70 * (t - 1.1) / 0.7)
ph = 2 * np.pi * np.cumsum(f) / sr
y = sum(np.sin(k * ph) / k for k in range(1, 6))
env = np.zeros_like(t)
for a, b in [(0.1, 0.9), (1.1, 1.8)]:
    m = (t >= a) & (t < b)
    env[m] = np.sin(np.pi * (t[m] - a) / (b - a)) ** 0.5
y = y * env * 0.3
m = (t >= 0.95) & (t < 1.05)
y[m] += rng.normal(0, 0.05, m.sum())
y = y.astype(np.float32)
q = np.round(y * 32767).astype(np.int16)
y = q.astype(np.float32) / 32767  # what TS will decode
f0, vf, vp = librosa.pyin(y, fmin=50, fmax=300, sr=sr)
r = librosa.feature.rms(y=y)[0]
z = np.nan_to_num(f0)
idx = np.arange(len(z)); vm = z > 0
f0i = np.interp(idx, idx[vm], z[vm])
en = (r - r.min()) / (r.max() - r.min()) * 250
json.dump(dict(sampleRate=sr, f0Interp=f0i.tolist(), energy=en.tolist(), pcm16=__import__('base64').b64encode(q.tobytes()).decode(),
               f0=[None if np.isnan(v) else float(v) for v in f0], rms=r.tolist()), open(sys.argv[1], 'w'))
