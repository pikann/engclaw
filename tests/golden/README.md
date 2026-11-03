# Golden test data (Python OpenPronounce reference)

Outputs of the upstream Python [OpenPronounce](https://github.com/Halleck45/OpenPronounce) (MIT, v0.3.0, CPU)
used to verify the TypeScript port. One case = `audio/<id>.wav` (16 kHz mono) + `cases/<id>.json`
(`result` is the full `compare_audio_with_text` output: `score`, `acoustic_distance`, `differences`
with `expected_phones` / `heard_phones` / `heard_phones_confidence` / `phoneme_error_rate` / `errors`,
`transcribe`, and `prosody.f0` / `prosody.energy`).

Cases: 7 bundled OpenPronounce samples + 24 speechocean762 test utterances spread over the human score range.

## Regenerate

Needs `espeak-ng`, `ffmpeg`, Python >= 3.10, network on first run (models, dataset, gTTS).

```bash
git clone https://github.com/Halleck45/OpenPronounce.git /tmp/OpenPronounce
git -C /tmp/OpenPronounce checkout 74bc17ea406e6f057f15eea0e70951e1931af868
python -m venv .venv && source .venv/bin/activate
pip install -e /tmp/OpenPronounce pyarrow huggingface_hub
python tests/golden/generate.py --openpronounce /tmp/OpenPronounce
```

## Caveats

- Upstream's reference voice is gTTS (network, can change over time), while Engclaw uses Kokoro. `score` and
  `acoustic_distance` are therefore **not** directly comparable; compare phones, errors, PER, transcript and
  prosody strictly, and the score only through the TS pipeline run on the stored reference audio.
- Generated with upstream commit `74bc17ea406e6f057f15eea0e70951e1931af868` (v0.3.0) on CPU. Record the new commit here if you regenerate against another one.
