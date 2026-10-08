// WordForge — independent entry for the existing Typing Challenge.
// Reuses the typing module (typing.ts + typing-content/storage/adaptive);
// Signal Rift (index.html / main.ts) is a separate entry with no typing wiring.
import './styles.css';
import './wordforge.css';
import { TypingChallenge } from './typing';

const app = document.querySelector<HTMLElement>('#app')!;
let audio: AudioContext | null = null;
function beep(freq = 880) { try { audio ||= new AudioContext(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.frequency.value = freq; gain.gain.value = .025; osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .05); } catch { /* audio is optional */ } }

app.innerHTML = `<div class="app-shell"><header class="topbar"><a class="brand" href="./" aria-label="Back to Lil Matt's Gaming World">WORD<span>//</span>FORGE</a><a class="wordforge-back" href="./">ALL GAMES ↗</a></header><main class="typing-page"><div class="typing-head"><div><p class="eyebrow">LIL MATT'S GAMING WORLD · WORDFORGE</p><h1>TYPING CHALLENGE</h1><p>Type a little. Learn a little. Build accuracy before chasing speed.</p></div><span class="wordforge-headmark" aria-hidden="true">W<span>F</span></span></div><div id="typing-game-root"></div></main></div>`;

new TypingChallenge(document.querySelector<HTMLElement>('#typing-game-root')!, () => beep(880));
