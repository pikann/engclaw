"""Reference: librosa.pyin + rms. usage: ref.py <out.json> <wav>..."""
import json, sys, numpy as np, librosa, soundfile as sf
out = {}
for p in sys.argv[2:]:
    y, sr = sf.read(p, dtype='float32')
    f0, vf, vp = librosa.pyin(y, fmin=50, fmax=300, sr=sr)
    r = librosa.feature.rms(y=y)[0]
    out[p.split('/')[-1]] = dict(sr=sr, f0=[None if np.isnan(v) else float(v) for v in f0],
                                 voiced=[int(v) for v in vf], vprob=vp.tolist(), rms=r.tolist())
json.dump(out, open(sys.argv[1], 'w'))
