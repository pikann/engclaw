# Model export guide

Users never pick models: the app downloads a fixed set of pre-converted **fp32 ONNX** files, pinned in `apps/desktop/resources/models.json`. This guide is for maintainers who need to reproduce those files or publish a new revision. The export scripts are not kept in the repo; the steps below are the record.

| ID        | Source                                 | Hosted repo (see `models.json`)                           |
| --------- | -------------------------------------- | --------------------------------------------------------- |
| `phone`   | `facebook/wav2vec2-lv-60-espeak-cv-ft` | `onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`         |
| `asr-en`  | `facebook/wav2vec2-large-960h`         | `pikann/wav2vec2-large-960h-hidden-states-ONNX`           |
| `tts-ref` | Kokoro-82M                             | `onnx-community/Kokoro-82M-v1.0-ONNX` (used as published) |

## Rules

- **fp32 only.** Dynamic int8 was evaluated and rejected: phone sequences diverged about 18 to 20 points from fp32 (the gate was 2). Any future precision reduction (for example fp16) must pass: phone error rate delta of 2 points or less, and score Spearman drop of 0.02 or less, versus fp32, on the OpenPronounce benchmarks plus a speechocean762 subset.
- No graph optimisation baked into the files.

## Export a wav2vec2 model

Use a throwaway Python environment (`torch`, `transformers`, `onnx`, `onnxruntime`).

1. Load the Hugging Face model (`Wav2Vec2ForCTC`).
2. Wrap it so `forward(input_values)` returns the outputs the app needs:
   - `phone`: `logits` only.
   - `asr-en`: `logits` and the last-layer `hidden_states` (the final `hidden_states[-1]`).
3. Export with `torch.onnx.export`, opset 17, input `input_values` of shape `[batch, samples]`, and dynamic batch and sample axes. With recent torch, the legacy exporter (`dynamo=False`) was used.
4. Lay the files out like this (the same layout transformers.js uses, which the app's model adapter reads itself):

```text
config.json
preprocessor_config.json
vocab.json
onnx/model.onnx
```

Gotchas:

- `torch.onnx.export` mutates the wrapper. Compare the ONNX output against a **freshly loaded** PyTorch model, not the exported instance.
- A warning `wav2vec2.masked_spec_embed MISSING` is harmless.
- `wav2vec2-large-960h` uses no attention mask; the app runs batch size 1.
- Inputs are normalised to zero mean and unit variance per clip by the app's model adapter, using `preprocessor_config.json`.

## Verify

Check the ONNX output against PyTorch on a few real clips: maximum absolute logits difference should be around 1e-3 or less, with 100% frame argmax agreement and identical greedy transcripts. The repo's golden logits tests (`apps/desktop/src/utility/model-adapter.golden.test.ts`, `pipeline.golden.test.ts`) run the app's own pipeline against stored reference outputs.

## Publish and pin

1. Upload the files to a public Hugging Face repo with a model card that keeps the upstream attribution and license.
2. Note the repo's commit SHA (the revision) and each file's size and SHA-256 (`sha256sum`).
3. Update the entry in `apps/desktop/resources/models.json`: `repo`, `revision`, and each file's `path`, `size`, `sha256`. The schema is `packages/models/src/catalog.ts`; `packages/models/src/bundled-catalog.test.ts` validates the shipped file.
4. Run `bun run test`, then try a real download in the app. A new revision ships with an app release; the Model Manager then offers the update and removes the old revision.

## Mandarin recognition

`asr-zh` uses the fp32 ONNX export [onnx-community/wav2vec2-large-xlsr-53-chinese-zh-cn-ONNX](https://huggingface.co/onnx-community/wav2vec2-large-xlsr-53-chinese-zh-cn-ONNX), pinned to `269b21c2b6ea9bebaa5d6b17bfeebf5a23beaa7b`. Its upstream model is [jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn) (Apache-2.0). The bundled catalog records actual size and SHA-256 for every downloaded file. It emits CTC character logits, with no required hidden-state export. Mandarin analysis uses character error rate and does not route through the English phoneme/hidden-state comparison pipeline. The bundled espeak-ng `cmn` voice supplies Mandarin reference playback; pinyin-pro supplies context-sensitive pinyin.
