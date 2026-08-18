import type { TypingDifficulty } from './typing-content';

export interface MistakeReview {
  letters: Record<string, number>;
  words: Record<string, number>;
  pairs: Record<string, number>;
}

export interface TypingAttempt {
  date: string;
  passageId: string;
  difficulty: TypingDifficulty;
  wpm: number;
  accuracy: number;
  maxCombo: number;
  durationMs: number;
  mistakes: MistakeReview;
  daily: boolean;
}

export interface TypingProgress {
  attempts: TypingAttempt[];
  bestWpm: number;
  daily: { completedDate: string; streak: number };
}

const KEY = 'signal-rift:typing-progress-v2';
const LEGACY_BEST_KEY = 'signal-rift:typing-best-wpm';
const SOUND_KEY = 'signal-rift:typing-sound';
const EMPTY_REVIEW = (): MistakeReview => ({ letters: {}, words: {}, pairs: {} });

export function emptyReview() { return EMPTY_REVIEW(); }

export function loadSoundSetting(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
}

export function saveSoundSetting(on: boolean) {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* Storage is optional. */ }
}

export function loadTypingProgress(): TypingProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<TypingProgress> | null;
    const legacyBest = Number.parseInt(localStorage.getItem(LEGACY_BEST_KEY) || '0', 10) || 0;
    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts.slice(-50) : [],
      bestWpm: Math.max(parsed?.bestWpm || 0, legacyBest),
      daily: { completedDate: parsed?.daily?.completedDate || '', streak: parsed?.daily?.streak || 0 },
    };
  } catch { return { attempts: [], bestWpm: 0, daily: { completedDate: '', streak: 0 } }; }
}

export function saveTypingProgress(progress: TypingProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* Storage is optional. */ }
}

export function addAttempt(progress: TypingProgress, attempt: TypingAttempt): TypingProgress {
  const attempts = [...progress.attempts, attempt].slice(-50);
  const bestWpm = Math.max(progress.bestWpm, attempt.wpm);
  const daily = attempt.daily ? updateDaily(progress.daily, attempt.date) : progress.daily;
  return { attempts, bestWpm, daily };
}

function updateDaily(current: TypingProgress['daily'], date: string) {
  if (current.completedDate === date) return current;
  const previous = new Date(`${date}T00:00:00`);
  previous.setDate(previous.getDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  return { completedDate: date, streak: current.completedDate === yesterday ? current.streak + 1 : 1 };
}

export function recentAverages(attempts: TypingAttempt[]) {
  const recent = attempts.slice(-10);
  if (!recent.length) return { count: 0, wpm: 0, accuracy: 0 };
  return {
    count: recent.length,
    wpm: Math.round(recent.reduce((total, item) => total + item.wpm, 0) / recent.length),
    accuracy: Math.round(recent.reduce((total, item) => total + item.accuracy, 0) / recent.length),
  };
}

export function adaptiveAdvice(attempts: TypingAttempt[], difficulty: TypingDifficulty) {
  const recent = attempts.slice(-3);
  if (recent.length < 3) return 'Keep building clean, repeatable accuracy before chasing speed.';
  if (recent.some(item => item.accuracy < 92)) return 'Accuracy first: slow down just enough to make each correction deliberate.';
  const improving = recent[0].wpm < recent[1].wpm && recent[1].wpm < recent[2].wpm;
  if (recent.every(item => item.accuracy >= 97) && improving) {
    return difficulty === 'hard' ? 'Excellent control. Stay on Hard and protect that accuracy.' : `You are ready to try ${difficulty === 'easy' ? 'Normal' : 'Hard'} when you want a new stretch.`;
  }
  return 'Your rhythm is settling in. Aim for smooth accuracy, then let speed follow.';
}

export function topWeakSpots(attempts: TypingAttempt[]) {
  const review = EMPTY_REVIEW();
  for (const attempt of attempts.slice(-20)) {
    const mistakes = attempt.mistakes || EMPTY_REVIEW();
    for (const key of ['letters', 'words', 'pairs'] as const) for (const [value, count] of Object.entries(mistakes[key] || {})) review[key][value] = (review[key][value] || 0) + count;
  }
  const top = (group: Record<string, number>) => Object.entries(group).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value]) => value);
  return { letters: top(review.letters), words: top(review.words), pairs: top(review.pairs) };
}
