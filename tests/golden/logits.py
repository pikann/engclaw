"""Dump Python reference logits for the model-adapter golden test.

  python tests/golden/logits.py --model facebook/wav2vec2-lv-60-espeak-cv-ft --name phone --case bundled-developer
  python tests/golden/logits.py --model facebook/wav2vec2-large-960h --name asr-en --case bundled-developer

Writes tests/golden/logits/<name>-<case>.json with the vocab, blank id, frame count and the logits
(the Hugging Face processor normalizes the waveform, exactly what the TS adapter must reproduce).
"""
import argparse, json, pathlib
import soundfile as sf
import torch
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--case", required=True)
a = ap.parse_args()

root = pathlib.Path(__file__).parent
audio, sr = sf.read(root / "audio" / f"{a.case}.wav", dtype="float32")
assert sr == 16000
proc = Wav2Vec2Processor.from_pretrained(a.model)
model = Wav2Vec2ForCTC.from_pretrained(a.model).eval()
x = proc(audio, sampling_rate=16000, return_tensors="pt").input_values
with torch.no_grad():
    out = model(x, output_hidden_states=True)
vocab = proc.tokenizer.get_vocab()
res = {
    "model": a.model,
    "vocab": vocab,
    "blank_id": proc.tokenizer.pad_token_id,
    "frames": out.logits.shape[1],
    "logits": out.logits[0].tolist(),
}
(root / "logits").mkdir(exist_ok=True)
(root / "logits" / f"{a.name}-{a.case}.json").write_text(json.dumps(res))
