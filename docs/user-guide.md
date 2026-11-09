# Engclaw user guide

Engclaw helps you practise English pronunciation. Everything runs on your computer: there is no account, and your audio is never uploaded.

## First run: download the models

The first time you use a scoring feature, Engclaw asks to download its speech models. The dialog shows each model's name, size and license and the free space on your disk.

- Total download is about 2.6 GB. You can pause and resume; an interrupted download continues where it stopped, and every file is checked against a checksum.
- Models are stored in the app data folder. To put them on another drive, open **Settings → AI models → Change folder** (or "Advanced: download location" in the dialog). Models already downloaded are not moved.
- Once installed, practice and the game work offline.

| Model              | Needed for                   |
| ------------------ | ---------------------------- |
| Phone model        | Pronunciation, Game          |
| Speech recognition | Speak freely, Converse       |
| Voice (Kokoro)     | Hear the reference, examples |

## Practice

Open **Practice** and choose a mode:

- **Read aloud**: type or paste a sentence, press the record button, read it, and stop (or let it stop after silence).
- **Speak freely**: say anything; Engclaw transcribes it and scores your sounds against what you said.

The result shows an overall score out of 100 and tabs for **Result**, **Phonemes**, **Pitch** and **Words**:

- **Phonemes** compares the sounds you made with the expected sounds, and marks the differences.
- **Pitch** and energy charts compare your intonation with a reference.
- **Words** lists the words to work on. Select a sound to see a mouth-shape animation.
- **Hear it** plays the reference voice, so you can compare by ear.

Your attempts are saved in **History**, where you can replay recordings, delete attempts, and export or import them as a file. Recording is capped at 15 minutes per clip.

Microphone blocked? On macOS open System Settings → Privacy & Security → Microphone and enable Engclaw; on Windows open Settings → Privacy & security → Microphone and allow desktop apps. Then restart the app.

## Shadowing

Shadowing means repeating a speaker as closely as you can, in time.

1. Open **Shadowing** and paste a YouTube link. The video needs captions (CC); videos without a transcript cannot be used.
2. The transcript is split into sentences. Play a sentence, loop it, then record yourself and read your score and the words to fix.
3. Switch the **Mode** to **Dictation** to test listening instead: sentences are played with some words blanked out, you type what you hear, then press **Check**. A summary lists the words to review and lets you practise them.
4. Turn on **IPA** to show phonetic spelling under the words.

Recent videos are listed so you can come back to them. Shadowing needs an internet connection and relies on YouTube; see the YouTube note in the [README](../README.md#youtube).

## Pronunciation game

The **Game** is a map of chapters, each focused on a word, phrase or idiom. Say it correctly five times to pass a chapter. Stars (up to three per chapter) are kept as your best result, and later chapters unlock as you pass earlier ones. Use the arrow keys to move around the map, or switch to the list view.

## Dictionary

Search a word to see its definitions, IPA and audio, examples, and a picture for concrete words (from Wikimedia Commons; this can be switched off in **Settings → General**). The **Roots & family** tab shows word origins and related words. Words can be added to flashcards; the number of new cards and reviews per day is set in Settings. Select any word in a result or transcript to look it up.

## Converse (optional)

Converse is a speaking-practice chat with an AI agent. It needs a provider you set up in **Settings → AI provider**: an OpenAI-compatible API (OpenAI, Gemini, OpenRouter) or a local server such as Ollama or LM Studio. Only your transcribed words and a short pronunciation summary are sent to that provider, never your audio. API keys are stored encrypted on your device. Without a provider the rest of the app works normally.

## Settings

- **General**: language (English or Vietnamese), theme, silence auto-stop, update check on launch, dictionary illustrations, flashcard limits.
- **AI models**: model status, sizes, folder.
- **AI provider**: Converse setup.
- **Privacy**: what stays on your device and the only connections the app makes.
- **Licenses**: third-party notices.
- **Delete all data** removes history, recordings and preferences. Downloaded models are kept.

## Troubleshooting

- **Scoring feels slow**: the models are large. The first attempt after launch loads them; later ones are faster. Close other heavy apps and keep enough free memory.
- **Download fails**: check your connection and disk space; it resumes where it stopped.
- **A YouTube video won't load**: pick another video with captions. YouTube changes can break this feature until the app is updated.
- **Something else**: search [Issues](https://github.com/pikann/engclaw/issues) or ask in [Discussions](https://github.com/pikann/engclaw/discussions).
