"""Generate golden outputs from the Python OpenPronounce reference (CPU).

Usage (see README.md):
    python tests/golden/generate.py --openpronounce /path/to/OpenPronounce [--n-speechocean 24]

Writes tests/golden/cases/<id>.json and tests/golden/audio/<id>.wav (16 kHz mono).
"""

import argparse
import io
import json
import os
import random
import sys

os.environ.setdefault("OPENPRONOUNCE_DEVICE", "cpu")

HERE = os.path.dirname(os.path.abspath(__file__))
# (id, asset file, reference text) for OpenPronounce's bundled samples.
BUNDLED = [
    ("bundled-developer", "developer.wav", "hello I am a developer"),
    ("bundled-developer1", "developer1.wav", "hello I am a developer"),
    ("bundled-developer1-flac", "developer1.flac", "hello I am a developer"),
    ("bundled-developer-error-an", "developer_error_an.wav", "hello I am a developer"),
    ("bundled-developer-error-an-good", "developer_error_an_good.wav", "hello I am a developer"),
    ("bundled-harvard", "harvard.wav", None),  # text from harvard_text.txt
    ("bundled-harvard-2-errors", "harvard_2_errors.wav", None),
    ("bundled-mispronounced", "mispronounced_audio.wav", None),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openpronounce", required=True, help="path to an OpenPronounce checkout")
    ap.add_argument("--n-speechocean", type=int, default=24)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    sys.path.insert(0, args.openpronounce)

    import numpy as np
    import pyarrow.parquet as pq
    import soundfile as sf
    from huggingface_hub import hf_hub_download
    from openpronounce import audio, compare_audio_with_text
    from openpronounce.speech import compare_audio_with_text as _  # noqa: F401

    os.makedirs(os.path.join(HERE, "cases"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
    assets = os.path.join(args.openpronounce, "assets")
    harvard = open(os.path.join(assets, "harvard_text.txt")).read().strip().lower()

    cases = []  # (id, waveform, text, meta)
    for cid, fname, text in BUNDLED:
        if cid == "bundled-mispronounced":
            continue  # no reference text shipped with this sample
        wav = audio.load(os.path.join(assets, fname), sr=16000)
        cases.append((cid, wav, text or harvard, {"source": f"OpenPronounce/assets/{fname}"}))

    path = hf_hub_download("mispeech/speechocean762", "data/test-00000-of-00001.parquet", repo_type="dataset")
    rows = pq.read_table(path).to_pylist()
    for r in rows:
        r["utt"] = os.path.splitext(r["audio"]["path"])[0]
    rng = random.Random(args.seed)
    # Sample spread over human total score so good and bad pronunciations are both covered.
    rows.sort(key=lambda r: (r["total"], r["utt"]))
    step = len(rows) / args.n_speechocean
    picked = [rows[int(i * step + rng.random() * step)] for i in range(args.n_speechocean)]
    for r in picked:
        wav, sr = sf.read(io.BytesIO(r["audio"]["bytes"]), dtype="float32")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        if sr != 16000:
            import librosa
            wav = librosa.resample(wav, orig_sr=sr, target_sr=16000)
        cases.append((
            f"so762-{r['utt']}", wav, r["text"].lower(),
            {"source": "mispeech/speechocean762 test", "human_total": r["total"],
             "human_accuracy": r["accuracy"], "human_fluency": r["fluency"], "human_prosodic": r["prosodic"]},
        ))

    for cid, wav, text, meta in cases:
        result = compare_audio_with_text(wav, text, 16000, use_phone_model=True)
        sf.write(os.path.join(HERE, "audio", f"{cid}.wav"), wav, 16000, subtype="PCM_16")
        out = {"id": cid, "text": text, "meta": meta, "result": result}
        with open(os.path.join(HERE, "cases", f"{cid}.json"), "w") as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        print("ok", cid, result["score"])
    print(len(cases), "cases written")


if __name__ == "__main__":
    main()
