import { DIFFICULTY_LABELS, dailyPassage, passagesForDifficulty, TIMED_TYPING_PASSAGE, type TypingDifficulty, type TypingPassage } from './typing-content';
import { adaptiveAdvice, addAttempt, emptyReview, loadSoundSetting, loadTypingProgress, recentAverages, saveSoundSetting, saveTypingProgress, topWeakSpots, type MistakeReview, type TypingProgress } from './typing-storage';
import { analyzeAdaptive } from './typing-adaptive';

export interface TypingScore { wpm: number; accuracy: number; }
export type TimeLimitSeconds = 15 | 30 | 60;

// ---- 音效引擎（WebAudio，隨打隨響；可被 soundOn 關閉） ----
let audioCtx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
function blip(freq: number, durationMs: number, type: OscillatorType = 'triangle', volume = 0.035) {
  const ctx = audio(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  } catch { /* audio is optional */ }
}
function keySound(ok: boolean) { if (ok) blip(740, 45); else blip(200, 80, 'triangle', 0.03); }

// 全形 → 半形（zh-TW 中文輸入法常以全形輸出英文字母/標點，導致全部判錯）
function normalizeKey(ch: string): string {
  if (ch.length !== 1) return ch;
  const code = ch.charCodeAt(0);
  if (code >= 0xFF01 && code <= 0xFF5E) return String.fromCharCode(code - 0xFEE0);
  if (code === 0x3000) return ' ';
  return ch;
}

// 每輪隨機一則「你知道嗎」小知識（給小學生的英文打字冷知識）
const FUN_FACTS: ReadonlyArray<readonly [string, string]> = [
  ['The QWERTY keyboard is over 140 years old — it was invented for typewriters!', 'QWERTY 鍵盤已經 140 多歲了，它是為了打字機發明的！'],
  ['The bumps on F and J help your fingers find home without looking.', 'F 和 J 上的小凸點，讓你的手指不用看鍵盤也能找到位置。'],
  ['The Space bar is the most used key on the whole keyboard!', '空白鍵是全鍵盤最常被按的鍵！'],
  ['Your left hand types more letters than your right hand on QWERTY.', '在 QWERTY 鍵盤上，左手打的字母比右手多。'],
  ['The fastest typists can reach over 200 WPM — faster than talking!', '頂尖打字員每分鐘能打 200 字以上——比講話還快！'],
  ['Look at the screen, not your hands — your fingers remember better.', '看著螢幕、別看手——你的手指記憶力更好。'],
  ['Every correct word you type builds a stronger shortcut in your brain.', '每正確打出一個單字，大腦就建立一條更快的捷徑。'],
  ['The longest word you can type with only your left hand is stewardesses.', '只用左手能打出的最長英文單字是 stewardesses。'],
  ['Steady rhythm beats raw speed — accuracy first, speed will follow.', '穩定的節奏勝過猛衝——先求準確，速度自然會跟上。'],
];

function warmAudio() { audio(); }

export function calculateTypingScore(characterCount: number, errors: number, elapsedMs: number): TypingScore {
  const minutes = Math.max(elapsedMs / 60_000, 1 / 60_000);
  const rawWpm = (characterCount / 5) / minutes;
  const accuracy = Math.max(0, Math.round(((characterCount - errors) / Math.max(characterCount, 1)) * 100));
  return { wpm: Math.round(rawWpm * (accuracy / 100)), accuracy };
}

export function calculateStarRating(accuracy: number): number { return accuracy >= 98 ? 3 : accuracy >= 90 ? 2 : 1; }

export function matchesTypingCharacter(expected: string, typed: string, position: number) {
  const a = normalizeKey(expected);
  const b = normalizeKey(typed);
  return a === b || (position === 0 && /^[a-z]$/i.test(a) && a.toLowerCase() === b.toLowerCase());
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export class TypingChallenge {
  private readonly root: HTMLElement;
  private readonly onComplete: () => void;
  private passage!: TypingPassage;
  private difficulty: TypingDifficulty = 'normal';
  private daily = false;
  private timeLimitSeconds: TimeLimitSeconds | null = null;
  private timerId = 0;
  private index = 0;
  private errors = 0;
  private combo = 0;
  private maxCombo = 0;
  private startedAt = 0;
  private finished = false;
  private mistakes = new Set<number>();
  private mistakeReview: MistakeReview = emptyReview();
  private progress: TypingProgress;
  private soundOn = true;
  private composing = false;
  private lastTypedKey = '';
  private charElements: HTMLElement[] = [];
  private renderedIndex = 0;
  private cursorFrame = 0;
  private readonly onCompositionStart = () => { this.composing = true; };
  private readonly onCompositionEnd = (event: CompositionEvent) => {
    this.composing = false;
    const committed = event.data || '';
    if (committed) {
      if (/[\u3400-\u9fff]/.test(committed)) this.showImeHint();
      this.handleCharacters(committed);
    }
  };
  private input: HTMLInputElement | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(root: HTMLElement, onComplete: () => void = () => undefined) {
    this.root = root;
    this.onComplete = onComplete;
    this.progress = loadTypingProgress();
    this.soundOn = loadSoundSetting();
    this.resizeObserver = new ResizeObserver(() => this.scheduleCursorUpdate());
    window.addEventListener('pointerdown', warmAudio, { once: true });
    window.addEventListener('keydown', warmAudio, { once: true });
    this.startNewRound();
  }

  destroy() {
    this.stopSpeech();
    this.clearTimer();
    this.resizeObserver.disconnect();
    if (this.cursorFrame) cancelAnimationFrame(this.cursorFrame);
    if (this.input) {
      this.input.oninput = null; this.input.onkeydown = null; this.input.onpaste = null;
      this.input.removeEventListener('compositionstart', this.onCompositionStart);
      this.input.removeEventListener('compositionend', this.onCompositionEnd);
    }
  }

  private startNewRound(options: { difficulty?: TypingDifficulty; daily?: boolean; timeLimitSeconds?: TimeLimitSeconds | null; passage?: TypingPassage } = {}) {
    this.stopSpeech();
    this.clearTimer();
    this.difficulty = options.difficulty || this.difficulty;
    this.daily = options.daily ?? false;
    this.timeLimitSeconds = options.timeLimitSeconds === undefined ? this.timeLimitSeconds : options.timeLimitSeconds;
    if (this.daily) this.timeLimitSeconds = null;
    const choices = this.timeLimitSeconds ? [TIMED_TYPING_PASSAGE] : passagesForDifficulty(this.difficulty);
    const freshChoices = choices.filter(item => item.id !== this.passage?.id);
    this.passage = options.passage || (this.daily ? dailyPassage(todayKey()) : freshChoices[Math.floor(Math.random() * freshChoices.length)] || choices[0]);
    this.difficulty = this.passage.difficulty;
    this.index = 0; this.errors = 0; this.combo = 0; this.maxCombo = 0; this.startedAt = 0; this.finished = false;
    this.mistakes.clear(); this.mistakeReview = emptyReview(); this.composing = false; this.lastTypedKey = ''; this.render();
  }

  private render() {
    this.resizeObserver.disconnect();
    const averages = recentAverages(this.progress.attempts);
    const missionCombo = this.missionCombo();
    this.root.innerHTML = `<section class="typing-stage">
      <div class="typing-controls" aria-label="Challenge options">
        <div class="typing-difficulties" role="group" aria-label="Difficulty level">${(['easy', 'normal', 'hard'] as TypingDifficulty[]).map(level => `<button class="typing-difficulty ${level === this.difficulty && !this.daily && !this.timeLimitSeconds ? 'active' : ''}" data-difficulty="${level}" aria-pressed="${level === this.difficulty && !this.daily && !this.timeLimitSeconds}">${DIFFICULTY_LABELS[level]}</button>`).join('')}</div>
        <div class="typing-timed" role="group" aria-label="Time trial duration">${([15, 30, 60] as TimeLimitSeconds[]).map(seconds => `<button class="typing-time-limit ${seconds === this.timeLimitSeconds ? 'active' : ''}" data-time-limit="${seconds}" aria-pressed="${seconds === this.timeLimitSeconds}">${seconds} SEC</button>`).join('')}</div>
        <button class="typing-daily ${this.daily ? 'active' : ''}" data-action="daily" aria-pressed="${this.daily}">DAILY · ${this.progress.daily.streak} DAY STREAK</button>
        <button class="typing-sound" data-action="sound" aria-pressed="${this.soundOn}">SOUND ${this.soundOn ? 'ON' : 'OFF'}</button>
      </div>
      <div class="typing-metrics"><span>LEVEL <b>${this.timeLimitSeconds ? 'TIME TRIAL' : DIFFICULTY_LABELS[this.difficulty]}</b></span><span>COMBO <b id="typing-combo">0</b></span><span>WPM <b id="typing-live-wpm">0</b></span><span>ACC <b id="typing-live-acc">100%</b></span><span>ERRORS <b id="typing-errors">0</b></span><span>${this.timeLimitSeconds ? 'TIME' : 'BEST'} <b id="typing-time">${this.timeLimitSeconds ? `${this.timeLimitSeconds}.0S` : `${this.progress.bestWpm} WPM`}</b></span></div>
      <div class="typing-mission"><span id="typing-status">READY · ${this.timeLimitSeconds ? 'TIME TRIAL' : this.passage.topic.toUpperCase()}</span><span>${this.timeLimitSeconds ? 'TIME TRIAL' : this.daily ? 'DAILY MISSION' : 'MISSION'} · <b>${this.timeLimitSeconds ? `${this.timeLimitSeconds} SECONDS · TYPE AS MUCH AS YOU CAN` : this.daily ? `95% ACCURACY + ${missionCombo} COMBO` : `REACH ${missionCombo} COMBO`}</b></span></div>
      <div class="typing-energy" role="progressbar" aria-label="Sentence progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="typing-energy-fill"></i></div>
      <div class="typing-passage-wrap"><i id="typing-cursor" class="typing-cursor" aria-hidden="true"></i><p id="typing-passage" class="typing-passage" aria-label="Type this sentence"></p></div>
      <label class="typing-input-label" for="typing-input">Start typing here</label><input id="typing-input" class="typing-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="typing-passage">
      <p class="typing-tip">Use Backspace to delete and type a character again. Learning notes appear after you finish.</p>
      <p id="typing-ime-hint" class="typing-ime-hint" hidden></p>
      <div id="typing-result" class="typing-result" aria-live="polite" hidden></div>
      <div class="typing-footer"><span>LAST ${averages.count || 0} · ${averages.wpm} WPM / ${averages.accuracy}% ACCURACY</span><button class="primary typing-restart" data-action="typing-restart">NEXT CHALLENGE</button></div>
    </section>`;
    const passage = this.root.querySelector<HTMLElement>('#typing-passage')!;
    let position = 0;
    for (const token of this.passage.text.match(/\S+|\s+/g) || []) {
      const word = /\S/.test(token) ? document.createElement('span') : passage;
      if (word !== passage) { word.className = 'typing-word'; passage.append(word); }
      for (const character of token) { const span = document.createElement('span'); span.className = `typing-char${position === 0 ? ' current' : ''}`; span.textContent = /\s/.test(character) ? '\u00a0' : character; word.append(span); position += 1; }
    }
    this.charElements = [...passage.querySelectorAll<HTMLElement>('.typing-char')];
    this.renderedIndex = 0;
    this.input = this.root.querySelector<HTMLInputElement>('#typing-input')!;
    this.input.onpaste = event => event.preventDefault();
    this.input.addEventListener('compositionstart', this.onCompositionStart);
    this.input.addEventListener('compositionend', this.onCompositionEnd);
    this.input.onkeydown = event => {
      if (this.composing || event.isComposing || event.keyCode === 229) return;
      if (this.finished && (event.key === ' ' || event.key === 'Enter')) {
        if (event.repeat) return;
        event.preventDefault(); this.root.querySelector<HTMLElement>('[data-action="typing-restart"]')?.click(); return;
      }
      if (event.key === 'Backspace') { this.handleKeyDown(event); return; }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); this.lastTypedKey = event.key; this.handleCharacter(event.key); }
    };
    this.input.oninput = event => {
      if (this.composing || (event as InputEvent).isComposing) return;
      this.handleInput();
    };
    this.root.querySelector<HTMLElement>('[data-action="typing-restart"]')!.onclick = () => this.startNewRound({ difficulty: this.difficulty });
    this.root.querySelector<HTMLElement>('[data-action="daily"]')!.onclick = () => this.startNewRound({ daily: !this.daily, difficulty: this.daily ? this.difficulty : 'normal', timeLimitSeconds: null });
    this.root.querySelector<HTMLElement>('[data-action="sound"]')!.onclick = () => {
      this.soundOn = !this.soundOn; saveSoundSetting(this.soundOn);
      const button = this.root.querySelector<HTMLElement>('[data-action="sound"]');
      if (button) { button.textContent = `SOUND ${this.soundOn ? 'ON' : 'OFF'}`; button.setAttribute('aria-pressed', String(this.soundOn)); }
      if (this.soundOn) keySound(true);
    };
    this.root.querySelectorAll<HTMLElement>('[data-difficulty]').forEach(button => button.onclick = () => this.startNewRound({ difficulty: button.dataset.difficulty as TypingDifficulty, timeLimitSeconds: null }));
    this.root.querySelectorAll<HTMLElement>('[data-time-limit]').forEach(button => button.onclick = () => this.startNewRound({ timeLimitSeconds: Number(button.dataset.timeLimit) as TimeLimitSeconds, passage: TIMED_TYPING_PASSAGE }));
    this.resizeObserver.observe(this.root.querySelector('.typing-passage-wrap')!); this.input.focus(); this.scheduleCursorUpdate();
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Backspace' || this.index === 0) return;
    event.preventDefault(); this.index -= 1;
    if (this.mistakes.delete(this.index)) this.errors = Math.max(0, this.errors - 1);
    this.recalculateCombo();
    if (this.finished) { this.finished = false; this.root.querySelector('.typing-stage')?.classList.remove('round-complete'); const result = this.root.querySelector<HTMLElement>('#typing-result'); if (result) result.hidden = true; }
    this.updateView();
  }

  private handleInput() {
    if (!this.input || this.finished) return;
    const value = this.input.value;
    this.input.value = '';
    if (!value) return;
    if (this.lastTypedKey && value === this.lastTypedKey) { this.lastTypedKey = ''; return; }
    this.lastTypedKey = '';
    if (/[\u3400-\u9fff]/.test(value)) this.showImeHint();
    this.handleCharacters(value);
  }

  private imeHintTimer = 0;
  private showImeHint() {
    const hint = this.root.querySelector<HTMLElement>('#typing-ime-hint');
    if (!hint) return;
    hint.hidden = false;
    hint.textContent = 'ENGLISH INPUT ONLY · 請切換到英文輸入模式';
    window.clearTimeout(this.imeHintTimer);
    this.imeHintTimer = window.setTimeout(() => { hint.hidden = true; }, 4000);
  }

  private handleCharacter(character: string) {
    if (this.finished) return;
    if (!this.startedAt) { this.startedAt = performance.now(); this.startTimer(); }
    if (this.index >= this.passage.text.length) return;
    const ok = matchesTypingCharacter(this.passage.text[this.index], character, this.index);
    if (ok) { this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    else { this.errors += 1; this.mistakes.add(this.index); this.combo = 0; this.recordMistake(this.index); }
    if (this.soundOn) keySound(ok);
    this.index += 1;
    this.updateView();
  }

  private handleCharacters(typed: string) {
    for (const character of typed) this.handleCharacter(character);
  }

  private updateView() {
    const timeExpired = this.timeLimitSeconds !== null && this.startedAt > 0 && performance.now() - this.startedAt >= this.timeLimitSeconds * 1000;
    const justCompleted = (this.index >= this.passage.text.length || timeExpired) && !this.finished;
    if (justCompleted) this.finished = true;
    if (justCompleted) this.clearTimer();
    for (const position of new Set([this.renderedIndex - 1, this.renderedIndex, this.index - 1, this.index])) this.renderCharacter(position);
    this.renderedIndex = this.index;
    this.scheduleCursorUpdate(); this.root.querySelector('#typing-errors')!.textContent = String(this.errors); this.root.querySelector('#typing-combo')!.textContent = String(this.combo); this.root.querySelector('#typing-status')!.textContent = this.finished ? 'COMPLETE' : this.startedAt ? `RUNNING · ${this.timeLimitSeconds ? 'TIME TRIAL' : this.passage.topic.toUpperCase()}` : `READY · ${this.timeLimitSeconds ? 'TIME TRIAL' : this.passage.topic.toUpperCase()}`;
    const percent = Math.round((this.index / Math.max(this.passage.text.length, 1)) * 100); const energy = this.root.querySelector<HTMLElement>('#typing-energy-fill'); const track = this.root.querySelector<HTMLElement>('.typing-energy'); if (energy) energy.style.transform = `scaleX(${percent / 100})`; if (track) track.setAttribute('aria-valuenow', String(percent));
    const elapsedMs = this.startedAt ? performance.now() - this.startedAt : 0;
    const liveWpm = this.startedAt && elapsedMs > 0 ? Math.round((this.index / 5) / Math.max(elapsedMs / 60000, 1 / 60000)) : 0;
    const liveAcc = this.index === 0 ? 100 : Math.max(0, Math.round(((this.index - this.errors) / this.index) * 100));
    const liveWpmEl = this.root.querySelector<HTMLElement>('#typing-live-wpm'); if (liveWpmEl) liveWpmEl.textContent = String(liveWpm);
    const liveAccEl = this.root.querySelector<HTMLElement>('#typing-live-acc'); if (liveAccEl) liveAccEl.textContent = `${liveAcc}%`;
    this.updateTimerView();
    if (justCompleted) this.showResult();
  }

  private renderCharacter(position: number) {
    const item = this.charElements[position];
    if (!item) return;
    item.className = 'typing-char';
    if (position < this.index) item.classList.add(this.mistakes.has(position) ? 'incorrect' : 'correct');
    if (position === this.index && !this.finished) item.classList.add('current');
  }

  private recordMistake(position: number) {
    const expected = this.passage.text[position].toLowerCase(); if (/^[a-z]$/.test(expected)) this.mistakeReview.letters[expected] = (this.mistakeReview.letters[expected] || 0) + 1;
    const word = this.wordAt(position); if (word) this.mistakeReview.words[word] = (this.mistakeReview.words[word] || 0) + 1;
    const pair = this.passage.text.slice(Math.max(0, position - 1), position + 1).toLowerCase().replace(/\s/g, ''); if (pair.length === 2) this.mistakeReview.pairs[pair] = (this.mistakeReview.pairs[pair] || 0) + 1;
  }

  private wordAt(position: number) { const before = this.passage.text.slice(0, position + 1); const after = this.passage.text.slice(position); const left = before.match(/[a-z]+$/i)?.[0] || ''; const right = after.match(/^[a-z]+/i)?.[0] || ''; return `${left}${right.slice(1)}`.toLowerCase(); }
  private recalculateCombo() { let combo = 0; for (let position = this.index - 1; position >= 0 && !this.mistakes.has(position); position -= 1) combo += 1; this.combo = combo; }
  private missionCombo() { return Math.min(16, Math.max(6, Math.round(this.passage.text.length / 8))); }

  private updateCursor() {
    const cursor = this.root.querySelector<HTMLElement>('#typing-cursor'); const wrap = this.root.querySelector<HTMLElement>('.typing-passage-wrap'); const active = this.charElements[this.index];
    if (!cursor || !wrap) return; if (!active) { cursor.classList.add('finished'); return; }
    const wrapRect = wrap.getBoundingClientRect(); const activeRect = active.getBoundingClientRect(); cursor.classList.remove('finished'); cursor.style.width = `${activeRect.width}px`; cursor.style.height = `${activeRect.height}px`; cursor.style.transform = `translate3d(${activeRect.left - wrapRect.left}px,${activeRect.top - wrapRect.top}px,0)`;
  }

  private scheduleCursorUpdate() {
    if (this.cursorFrame) return;
    this.cursorFrame = requestAnimationFrame(() => { this.cursorFrame = 0; this.updateCursor(); });
  }

  private startTimer() {
    if (this.timeLimitSeconds === null || this.timerId) return;
    this.timerId = window.setInterval(() => {
      this.updateTimerView();
      if (this.startedAt && performance.now() - this.startedAt >= this.timeLimitSeconds! * 1000) {
        this.clearTimer();
        this.updateView();
      }
    }, 100);
  }

  private clearTimer() {
    if (this.timerId) window.clearInterval(this.timerId);
    this.timerId = 0;
  }

  private updateTimerView() {
    const timer = this.root.querySelector<HTMLElement>('#typing-time');
    if (!timer || this.timeLimitSeconds === null) return;
    const remaining = Math.max(0, this.timeLimitSeconds - (this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0));
    timer.textContent = `${remaining.toFixed(1)}S`;
  }

  // ---- 發音（Web Speech API；完成後朗讀全文，單字可點擊） ----
  private speak(text: string, rate = 0.9) {
    if (!('speechSynthesis' in window)) return;
    this.stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('en'));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  private stopSpeech() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

  private showResult() {
    const durationMs = this.timeLimitSeconds ? Math.min(performance.now() - this.startedAt, this.timeLimitSeconds * 1000) : performance.now() - this.startedAt; const scoredCharacters = this.timeLimitSeconds ? this.index : this.passage.text.length; const score = calculateTypingScore(scoredCharacters, this.errors, durationMs); const stars = calculateStarRating(score.accuracy); const missionComplete = this.timeLimitSeconds ? this.index > 0 : this.daily ? score.accuracy >= 95 && this.maxCombo >= this.missionCombo() : this.maxCombo >= this.missionCombo();
    const attempt = { date: todayKey(), passageId: this.passage.id, difficulty: this.difficulty, wpm: score.wpm, accuracy: score.accuracy, maxCombo: this.maxCombo, durationMs: Math.round(durationMs), mistakes: this.mistakeReview, daily: this.daily };
    const wasBest = score.wpm > this.progress.bestWpm; this.progress = addAttempt(this.progress, attempt); saveTypingProgress(this.progress);
    const weak = topWeakSpots(this.progress.attempts); const advice = adaptiveAdvice(this.progress.attempts, this.difficulty); const result = this.root.querySelector<HTMLElement>('#typing-result')!;
    const summary = document.createElement('div'); const headline = document.createElement('strong'); const rank = document.createElement('div'); const shortcut = document.createElement('p'); const stats = document.createElement('div'); const mission = document.createElement('p');
    summary.className = 'typing-result-summary'; headline.textContent = `${score.wpm} WPM`; rank.className = 'typing-rank'; rank.setAttribute('aria-label', `${stars} out of 3 signal stars`);
    for (let position = 1; position <= 3; position += 1) { const mark = document.createElement('i'); mark.className = `typing-rank-mark${position <= stars ? ' active' : ''}`; mark.setAttribute('aria-hidden', 'true'); rank.append(mark); }
    stats.className = 'typing-result-stats'; stats.append(this.createResultStat(`${score.accuracy}%`, 'ACCURACY'), this.createResultStat(String(this.maxCombo), 'MAX COMBO'), this.createResultStat(`${Math.max(1, Math.round(durationMs / 1000))}S`, 'TIME'), this.createResultStat(`${this.progress.bestWpm} WPM`, wasBest ? 'NEW BEST' : 'PERSONAL BEST'));
    if (this.timeLimitSeconds) { const characters = this.createResultStat(String(this.index), 'CHARACTERS'); stats.insertBefore(characters, stats.firstChild); }
    mission.className = `typing-mission-result ${missionComplete ? 'complete' : ''}`; mission.textContent = this.timeLimitSeconds ? `TIME TRIAL COMPLETE · ${this.index} CHARACTERS` : missionComplete ? 'MISSION COMPLETE · CLEAN CONTROL' : this.daily ? 'DAILY MISSION RETRY · ACCURACY COMES FIRST' : `MISSION RETRY · REACH ${this.missionCombo()} COMBO`;
    shortcut.className = 'typing-shortcut-hint'; shortcut.textContent = 'SPACE / ENTER → NEXT'; summary.append(headline, rank, shortcut); result.replaceChildren(summary, stats, mission, this.makeLearningPanel(), this.makeReviewPanel(weak, advice), this.makeAdaptivePanel()); result.hidden = false; this.root.querySelector('.typing-stage')?.classList.add('round-complete'); this.root.querySelector('#typing-best')!.textContent = `${this.progress.bestWpm} WPM`;
    const averages = recentAverages(this.progress.attempts);
    const history = this.root.querySelector<HTMLElement>('.typing-footer > span');
    if (history) history.textContent = `LAST ${averages.count} · ${averages.wpm} WPM / ${averages.accuracy}% ACCURACY`;
    const dailyButton = this.root.querySelector<HTMLElement>('[data-action="daily"]');
    if (dailyButton) dailyButton.textContent = `DAILY · ${this.progress.daily.streak} DAY STREAK`;
    this.onComplete();
  }

  private makeFunFact() {
    const fact = document.createElement('p'); fact.className = 'typing-fun-fact';
    const title = document.createElement('b'); title.textContent = 'DID YOU KNOW?';
    const [en, zh] = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
    const enLine = document.createElement('span'); enLine.textContent = en;
    const zhLine = document.createElement('span'); zhLine.textContent = zh;
    fact.append(title, enLine, zhLine);
    return fact;
  }

  private makeLearningPanel() {
    const panel = document.createElement('section'); panel.className = 'typing-learning';
    const header = document.createElement('div'); header.className = 'typing-learning-head';
    const title = document.createElement('h3'); title.textContent = 'LEARN FROM THIS CHALLENGE';
    const listen = document.createElement('button'); listen.className = 'typing-listen'; listen.type = 'button'; listen.textContent = 'LISTEN ▶';
    listen.title = 'Read the passage aloud'; listen.onclick = () => this.speak(this.passage.text);
    if (!('speechSynthesis' in window)) listen.hidden = true;
    header.append(title, listen); panel.append(header);
    panel.append(this.makeFunFact());
    const vocabulary = this.passage.vocabulary || [];
    if (!vocabulary.length) { const copy = document.createElement('p'); copy.textContent = 'Practice complete. This archive passage will receive learning notes in a future enrichment pass.'; panel.append(copy); return panel; }
    const list = document.createElement('div'); list.className = 'typing-vocabulary';
    for (const item of vocabulary) {
      const article = document.createElement('article');
      const term = document.createElement('b'); term.className = 'typing-word-sound'; term.title = 'Click to listen'; term.onclick = () => this.speak(item.term, 0.85);
      const definition = document.createElement('p'); const translation = document.createElement('span'); const example = document.createElement('small');
      term.textContent = item.term; definition.textContent = item.definition; translation.textContent = item.translation; example.textContent = item.example;
      article.append(term, definition, translation, example); list.append(article);
    }
    panel.append(list); return panel;
  }

  private makeReviewPanel(weak: ReturnType<typeof topWeakSpots>, advice: string) {
    const panel = document.createElement('section'); panel.className = 'typing-review'; const title = document.createElement('h3'); title.textContent = 'PRACTICE YOUR WEAK SPOTS'; const copy = document.createElement('p'); const targets = [...weak.words, ...weak.pairs, ...weak.letters].slice(0, 4); copy.textContent = targets.length ? `Try these next: ${targets.join(' · ')}` : 'Clean round. Keep the same careful rhythm next time.'; const adviceCopy = document.createElement('small'); adviceCopy.textContent = advice; panel.append(title, copy, adviceCopy);
    if (targets.length) { const button = document.createElement('button'); button.className = 'secondary typing-weak-practice'; button.textContent = 'PRACTICE THESE'; button.onclick = () => this.startWeakPractice(targets); panel.append(button); }
    return panel;
  }

  // Adaptive Learning SHADOW MODE — TYPE → MEASURE → DETECT → RECOMMEND.
  // Analyzes + recommends only; never changes official challenge sequencing.
  private makeAdaptivePanel() {
    const report = analyzeAdaptive(this.progress.attempts, this.mistakeReview);
    const panel = document.createElement('section'); panel.className = 'typing-adaptive';
    const head = document.createElement('div'); head.className = 'typing-adaptive-head';
    const title = document.createElement('h3'); title.textContent = 'ADAPTIVE COACH';
    const badge = document.createElement('span'); badge.className = 'typing-adaptive-badge'; badge.textContent = 'SHADOW · 只建議，不改關卡';
    head.append(title, badge); panel.append(head);
    const rec = document.createElement('p'); rec.className = 'typing-adaptive-rec'; rec.textContent = report.recommendation;
    const evidence = document.createElement('p'); evidence.className = 'typing-adaptive-evidence';
    evidence.textContent = `${report.explain} | ${report.trendEvidence} (trend: ${report.accuracyTrend}) | ${report.difficultyAdvice}`;
    panel.append(rec, evidence);
    const focus = report.targets.map((t) => t.value);
    if (focus.length) {
      const button = document.createElement('button'); button.className = 'secondary typing-adaptive-practice'; button.textContent = 'PRACTICE THESE (SHADOW)';
      button.onclick = () => this.startWeakPractice(focus.slice(0, 4));
      panel.append(button);
    }
    return panel;
  }

  private startWeakPractice(targets: string[]) { this.startNewRound({ passage: { id: `weak-${Date.now()}`, difficulty: this.difficulty, topic: 'weak spot practice', text: `Slow and steady: ${targets.join(', ')}. Type each part with care.`, vocabulary: [] } }); }
  private createResultStat(value: string, label: string) { const item = document.createElement('span'); const strong = document.createElement('b'); const small = document.createElement('small'); strong.textContent = value; small.textContent = label; item.append(strong, small); return item; }
}
