// WordForge — independent entry for the existing Typing Challenge.
// Reuses the typing module (typing.ts + typing-content/storage/adaptive) as-is;
// Signal Rift (index.html / main.ts) is a separate entry with no typing wiring.
import './styles.css';
import { TypingChallenge } from './typing';

const app = document.querySelector<HTMLElement>('#app')!;
let audio: AudioContext | null = null;
function beep(freq = 880) { try { audio ||= new AudioContext(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.frequency.value = freq; gain.gain.value = .025; osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .05); } catch { /* audio is optional */ } }

app.innerHTML = `<div class="app-shell"><header class="topbar"><button class="brand">WORD<span>//</span>FORGE</button><div class="telemetry"><span class="pulse"></span> LOCAL BUILD / 0.1.0</div></header><main class="typing-page"><div class="typing-head"><div><p class="eyebrow">GAMIFIED ENGLISH LEARNING</p><h2>TYPING CHALLENGE</h2><p>Type naturally, learn after the round, and build accuracy before chasing speed.</p></div></div><div id="typing-game-root"></div></main></div>`;

new TypingChallenge(document.querySelector<HTMLElement>('#typing-game-root')!, () => beep(880));
