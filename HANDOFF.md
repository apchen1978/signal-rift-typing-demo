# HANDOFF — Typing Experience Upgrade

> Status: DONE & VERIFIED · Handed off from DeepSeek Harness session (2026-08-18)
> Verify before continuing: `npm run build` passes; `npm run dev` runs.
> Evidence rule: when HANDOFF documentation conflicts with Git or current code, verified repository state takes precedence.

## What changed in this handoff (6 commits)

| Commit | Change |
|---|---|
| `91432f3` | `feat: add adaptive learning shadow mode (measure/detect/recommend)` |
| `f9f0ed6` | `feat: add fun facts card, smoother typing feel, adaptive vocab grid` |
| `afd583b` | `docs: update handoff with IME hardening and verification` |
| `b4397dd` | `fix: harden typing input against IME and full-width characters` |
| `6f0b9f4` | `docs: add handoff note for next agent session` |
| `43f1d6c` | `feat: add typing sound, live metrics and passage TTS` |

### Adaptive Learning SHADOW MODE (91432f3)

`src/typing-adaptive.ts` — TYPE → MEASURE → DETECT WEAKNESS → RECOMMEND.

- **Shadow**: analyzes `TypingProgress.attempts` + current round's `MistakeReview` and recommends only; **never changes official challenge sequencing**. Badge reads "SHADOW · 只建議，不改關卡".
- **Deterministic**: pure function; same attempts ⇒ same report (verified: seeded data → `e (9×), r (5×), th (3×), the (1×)` stable across rounds).
- **Explainable**: every claim carries numbers (recency-weighted error score, window size, accuracy trend `last 3: 88% → 85% → 100%`).
- **Removable**: self-contained module; delete the file + the single import in `typing.ts` + the CSS block. Typing core (input/scoring/storage) untouched.
- Surfaced as `ADAPTIVE COACH` panel after each round, with a user-initiated `PRACTICE THESE (SHADOW)` button reusing `startWeakPractice`.

### Typing experience (43f1d6c)

1. **Keypress sound** — WebAudio blips: correct = 740Hz triangle (45ms), wrong = 200Hz triangle (80ms). `SOUND ON/OFF` toggle persisted in localStorage `signal-rift:typing-sound`.
2. **Live metrics** — WPM + ACC% update live in the metrics bar while typing.
3. **Text-to-speech** — `LISTEN ▶` reads the passage aloud; vocabulary terms clickable for pronunciation. Uses `speechSynthesis` (zero deps).

### Input hardening (b4397dd) — root cause of "all characters red"

Reproduced in headless Chrome + CDP (trusted keyboard events): plain Latin input was **never** the problem. The red-text bug comes from the zh-TW input environment:

- Chinese IME (Bopomofo etc.) commonly commits **full-width Latin** (`Ｔ` U+FF34) or Chinese characters → every char mismatched the ASCII passage → all red.
- Fixed: full-width → half-width normalization in `matchesTypingCharacter`; IME composition handled via `compositionstart`/`compositionend` listeners (committed text processed once); `keyCode 229` / `isComposing` guards in keydown; duplicate-input dedupe (`lastTypedKey`); CJK input shows a transient hint (`#typing-ime-hint`) — "ENGLISH INPUT ONLY · 請切換到英文輸入模式".
- Verified all four input paths in headless Chrome: keydown / full-width input / IME composition / Chinese commit → expected results.

### Fun facts & smoothness (f9f0ed6)

- **`DID YOU KNOW?` card** in the learning panel — rotating bilingual English/中文 typing facts (9 items), fills the previously empty vocabulary grid cell.
- **Smoother typing feel** — audio context pre-warmed on first pointerdown/keydown (removes first-key init lag); wrong-key tone softened from sawtooth 170Hz/130ms to triangle 200Hz/80ms; live WPM/ACC values get a fixed min-width (no layout reflow).
- **Adaptive vocabulary grid** — `repeat(auto-fit, minmax(0, 1fr))` so 1–2 items never leave an empty column.

## Files touched

- `src/typing-adaptive.ts` — **new** adaptive shadow-mode analyzer (`analyzeAdaptive`)
- `src/typing.ts` — import + `makeAdaptivePanel()`, wired into `showResult`; sound engine, `soundOn` field, live metrics, `speak()/stopSpeech()`, learning panel, IME-safe input pipeline
- `src/typing-storage.ts` — `loadSoundSetting()/saveSoundSetting()`
- `src/styles.css` — `.typing-adaptive*`, `.typing-sound`, `.typing-learning-head`, `.typing-listen`, `.typing-word-sound`, `.typing-ime-hint`, `.typing-fun-fact`, live-metric min-width, adaptive vocabulary grid

## Verified

- [x] `npm run build` (tsc + vite) — PASS
- [x] `git diff --check` — PASS
- [x] Headless-Chrome CDP test: keydown / full-width / composition / Chinese-input paths
- [x] Headless-Chrome CDP test: adaptive shadow panel renders, deterministic ranking matches seeded data, typing core intact, zero JS errors
- [x] git working tree clean after commit
- [x] ahead/behind vs origin: 0/0 (after push)

## NOT done / known UNKNOWNs (candidate next steps)

- Progress curve chart (last 50 attempts WPM/accuracy over time)
- Achievement badges (100 WPM, 10-day streak, 98% perfect round…)
- Easy difficulty pool is thin (only 4 curated passages) — consider re-grading legacy passages by sentence length
- Chinese→English translation recall mode
- Enrich the 70 legacy passages with vocabulary notes (README promise)
- Mobile soft-keyboard input path not re-tested after these changes (keydown/preventDefault path is desktop-oriented; `oninput` fallback covers mobile)
- The completion `beep(880)` from `main.ts` still plays regardless of the new sound toggle (pre-existing behavior; consider routing it through the same setting later)

## Conventions

- Keep conventional commit style: `feat:`, `fix:`, `docs:`, `content:` (lowercase)
- `.gitignore` already covers `node_modules/`, `dist/`, `*.tsbuildinfo`
- Current branch: `codex/typing-game-hardening`
