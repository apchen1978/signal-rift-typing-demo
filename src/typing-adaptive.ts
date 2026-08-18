// src/typing-adaptive.ts — Adaptive Learning SHADOW MODE
//
// TYPE → MEASURE → DETECT WEAKNESS → RECOMMEND
//
// Shadow-mode contract:
//   - Analyze + recommend ONLY. Never changes official challenge sequencing.
//   - Deterministic: identical `attempts` input ⇒ identical report (no randomness).
//   - Explainable: every claim carries its numbers.
//   - Local-first: reads the in-browser TypingProgress only.
//   - Removable: this module is self-contained; delete it (and the single import
//     in typing.ts) to remove the feature entirely. Typing core is untouched.
import type { MistakeReview, TypingAttempt } from './typing-storage';

export interface AdaptiveTarget {
  kind: 'letter' | 'pair' | 'word';
  value: string;
  count: number; // raw occurrences inside the analysis window
  score: number; // recency-weighted score (deterministic)
}

export interface AdaptiveReport {
  targets: AdaptiveTarget[]; // sorted: score desc, then value asc
  accuracyAvg: number | null;
  accuracyTrend: 'up' | 'down' | 'flat' | 'unknown';
  trendEvidence: string;
  difficultyAdvice: string;
  recommendation: string;
  explain: string;
}

const WINDOW = 20; // analyze at most the last N attempts
const TREND_N = 3; // accuracy trend window

const emptyMistakes = (): MistakeReview => ({ letters: {}, words: {}, pairs: {} });

/** Linear recency weight: oldest in window = 1, newest ≈ 2. Deterministic. */
function recencyWeight(index: number, total: number): number {
  return total <= 1 ? 1 : 1 + index / (total - 1);
}

export function analyzeAdaptive(attempts: TypingAttempt[], current?: MistakeReview): AdaptiveReport {
  const recent = attempts.slice(-WINDOW);
  const bucket = new Map<string, { kind: AdaptiveTarget['kind']; value: string; count: number; weighted: number }>();
  const bump = (kind: AdaptiveTarget['kind'], value: string, weight: number, n: number) => {
    if (!value) return;
    const key = `${kind}:${value}`;
    const existing = bucket.get(key) ?? { kind, value, count: 0, weighted: 0 };
    existing.count += n;
    existing.weighted += weight * n;
    bucket.set(key, existing);
  };

  // Current round mistakes: full weight (most relevant signal).
  const now = current && Object.keys(current).length ? current : emptyMistakes();
  for (const [letter, n] of Object.entries(now.letters)) bump('letter', letter, 1, n);
  for (const [pair, n] of Object.entries(now.pairs)) bump('pair', pair, 1, n);
  for (const [word, n] of Object.entries(now.words)) bump('word', word, 1, n);

  // Historical attempts: recency-weighted, older counts less.
  recent.forEach((attempt, i) => {
    const w = recencyWeight(i, recent.length);
    const m = attempt.mistakes || emptyMistakes();
    for (const [letter, n] of Object.entries(m.letters)) bump('letter', letter, w, n);
    for (const [pair, n] of Object.entries(m.pairs)) bump('pair', pair, w, n);
    for (const [word, n] of Object.entries(m.words)) bump('word', word, w, n);
  });

  const targets: AdaptiveTarget[] = [...bucket.values()]
    .map((t) => ({ kind: t.kind, value: t.value, count: t.count, score: Math.round(t.weighted * 10) / 10 }))
    .sort((a, b) => b.score - a.score || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .slice(0, 6);

  // --- accuracy trend (deterministic) ---
  let accuracyAvg: number | null = null;
  let accuracyTrend: AdaptiveReport['accuracyTrend'] = 'unknown';
  let trendEvidence = 'insufficient data';
  if (recent.length >= TREND_N) {
    const accs = recent.slice(-TREND_N).map((a) => a.accuracy);
    accuracyAvg = Math.round(accs.reduce((s, x) => s + x, 0) / accs.length);
    trendEvidence = `last ${TREND_N}: ${accs.join('% → ')}%`;
    const first = accs[0];
    const last = accs[accs.length - 1];
    accuracyTrend = last - first >= 2 ? 'up' : first - last >= 2 ? 'down' : 'flat';
  }

  // --- difficulty advice (explicit rules; shadow = suggestion only) ---
  let difficultyAdvice: string;
  if (accuracyAvg === null) {
    difficultyAdvice = 'Complete a few more rounds to get a reliable read on your level.';
  } else if (accuracyAvg >= 97) {
    difficultyAdvice = `Accuracy is high (≥97%): consider trying a harder level next.`;
  } else if (accuracyAvg < 92) {
    difficultyAdvice = `Accuracy is low (<92%): stay at the current level and protect accuracy first.`;
  } else {
    difficultyAdvice = `Accuracy is steady (${accuracyAvg}%): keep the current level.`;
  }

  // --- recommendation + explanation (every claim carries numbers) ---
  let recommendation: string;
  let explain: string;
  if (targets.length === 0) {
    recommendation = 'Clean typing — keep the same careful rhythm.';
    explain = `No weak letters/pairs/words in the last ${Math.min(recent.length, WINDOW)} attempt(s).`;
  } else {
    const focus = targets.slice(0, 4).map((t) => t.value).join(' · ');
    recommendation = `Focus practice on: ${focus}`;
    const detail = targets.slice(0, 4).map((t) => `${t.value} (${t.count}×)`).join(', ');
    explain = `Top targets by recency-weighted error score: ${detail}; window = last ${Math.min(recent.length, WINDOW)} attempt(s).`;
  }

  return { targets, accuracyAvg, accuracyTrend, trendEvidence, difficultyAdvice, recommendation, explain };
}
