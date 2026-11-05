# 心琴（XinQin）· Ink-wash rhythm duel

Water-ink wuxia meets keyboard rhythm combat: notes fall with the music, your notes turn into sword-qi, and the ink fiends die. A pure static web page, no backend.

**English | [中文](README.md)**

v1.1: fiends advance on your line in packs, tinted notes (Frost / Venom / Blast), and the combo-charged Heartstring burst.
v1.4 "performance fantasy": a progress rail along the top edge, a continuously playing accompaniment part (the melody is always yours), mastery badges and a "Hear my playing" replay (the last 20 seconds, only on the results screen).
Three public-domain pieces (Canon in D / Für Elise / Moonlight on the Spring River) plus one theme song, *Pig Hero's Journey* × three difficulties. The theme song's medium/hard modes play the original full track (new mix: vocals +2.8 dB, piano −2.9 dB) with a green-and-pink battle palette and cute ink animals; easy stays piano-only ([ADR-0019](docs/adr/0019-主题曲全轨与主题皮肤.md), in Chinese). One static build ships to both GitHub Pages and itch.io ([ADR-0009](docs/adr/0009-技术底座与发布.md), in Chinese).

v1.5 "bilingual UI": the whole interface exists in Chinese and English ([ADR-0017](docs/adr/0017-双语UI与全英文模式.md), in Chinese). It follows your browser language (`zh*` → Chinese, everything else → English), remembers your choice, and can be switched any time from the library badge or the settings screen. English mode is **fully English** — title, seal and countdown included.

## Run locally

```bash
npm install
npm run dev        # dev server; click or press any key to start (browsers need a gesture before audio)
npm test           # core simulator + chart contract + converter tests (vitest, node env)
npm run build      # type check + static build into dist/ (relative base, any static host works)
npm run preview    # preview the build
npm run charts     # regenerate every song's three difficulties from the MIDI fixtures
npm run pack:itch  # build + package for itch.io HTML5 upload → xinqin-itch.zip
```

## How it plays

White keys `A S D F J K L` cover one octave C4–B4; Medium adds black keys `W E U I O` (the right-hand black keys sit above `J K L`), while Hard keeps `W E T Y U` and widens the range to `I O P` above and `Z X C` below. Press when a note crosses the judgement line: Perfect ±50 ms / Good ±120 ms, and a miss breaks the combo. Long presses do not double-trigger; `Esc` pauses.

Judgement compares exactly one number — |press time − note time| — and zero is the instant the note's centre crosses the line. Two faint ink halos on the line show how wide the two tiers really are (±17 px and ±41 px, both thinner than a single note), which is why every judgement also prints a small "late 43 / early 12" and the results screen reports your average offset: if you are consistently late, move the audio offset in the settings.

Status readouts stay in the lower half of the screen ([ADR-0014](docs/adr/0014-HUD锚位与按键归属.md), in Chinese): the **Vitality** bar hugs the bottom edge (label on the left, current / max on the right, flashing when bitten, a breathing vermilion outline below 30%); the **Heartstring** gauge runs up both screen edges and prints "Heart 12/30" at the top so you can see how many hits are left before the next burst. Menu arrow keys and space are captured by the game, so the page never scrolls under your hands.

Combat: fiends advance from deep in the field toward your line; a miss only makes your sword-qi whiff (it no longer costs health directly) — the only source of damage is a fiend biting at your line every two beats. Sword-qi is a full-field AoE with depth falloff: every hit strikes the whole field, front rank takes full damage, deeper ranks less. About 6% of note groups are **tinted notes** (Frost: knockback + slow / Venom: poison on the front fiend / Blast: heavy hit on the front two), and combos charge the **Heartstring**, which releases a field-wide burst on its own. All numbers live in `src/core/config.ts`; the reasoning is in [docs/calibration.md](docs/calibration.md) (Chinese).

Dev hooks (URL query params, invisible to normal players): `?auto=perfect` (autoplay exactly on the chart), `?auto=idle` (never press, to see a loss), `?song=<id>`, `?chart=easy|medium|hard`.

## Architecture

- `src/core/` — the pure simulator: no DOM, no Web Audio, injected clock (the main test seam). The chart data contract lives in `src/core/chart.ts`.
- `src/converter/` — MIDI → chart converter (build-time tool); difficulty rules are constants in `src/converter/rules.ts`.
- `src/i18n/` — the copy table: one `Messages` interface, a Chinese and an English implementation, and a compile-time exhaustive key set (a missing string is a `tsc` error). A unit test guards both dictionaries (no CJK in English values, no long English runs in Chinese values).
- `src/render/` — Canvas 2D renderer; `src/audio/` — Web Audio shell (audio as the master clock, lookahead scheduling).
- `scripts/generate-charts.ts` — chart regeneration CLI (`npm run charts`).

## Shipping

One static build, two hosts. GitHub Pages: push `main`, the workflow runs tests → build → deploy. itch.io: `npm run pack:itch`, upload `xinqin-itch.zip`, tick *This file will be played in the browser*, viewport 1280×720. The bilingual store-page checklist (both languages on one page) is in [itch-assets/UPLOAD-SHEET.md](itch-assets/UPLOAD-SHEET.md) (Chinese).

## Credits

- Piano samples: **Salamander Grand Piano V3**, recorded by Alexander Holm (Yamaha C5), **CC-BY 3.0** — <https://creativecommons.org/licenses/by/3.0/> · original release <https://archive.org/details/SalamanderGrandPianoV3>. Only five minor-third pitches are sampled (C4/Ds4/Fs4/A4/C5); the remaining white keys are resampled from the nearest sample via `playbackRate`.
- Charts are generated from public-domain MIDI: Pachelbel's Canon in D and Beethoven's Für Elise (Mutopia Project, Public Domain), and the traditional 春江花月夜 (Music.Traditional.Chinese.MIDI, CC BY 4.0).
- *Pig Hero's Journey* is an AI-generated song credited to 心心念念; its MIDI is an automatic transcription of the video audio (not an official score) and its full track ships as `assets/songs/zhuxia-manyouji.mp3`.
- Everything else — code, chart generator, ink-wash renderer — is original.
