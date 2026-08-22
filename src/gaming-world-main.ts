// Lil Matt's Gaming World — hub entry: two independent game choices.
//   Jumpverse (jumpverse.html) — platform adventure, Vector Wake = Level 1
//   WordForge (wordforge.html) — gamified English learning, Typing Challenge
import './styles.css';

const app = document.querySelector<HTMLElement>('#app')!;

app.innerHTML = `<div class="app-shell"><header class="topbar"><button class="brand">LIL MATT'S<span>//</span>GAMING WORLD</button><div class="telemetry"><span class="pulse"></span> LOCAL BUILD / 0.1.0</div></header><main class="hub"><p class="eyebrow">TWO GAMES · ONE WORLD</p><h1>LIL MATT'S<br><em>GAMING WORLD</em></h1><div class="hub-grid"><a class="hub-card" href="jumpverse.html"><span class="hub-icon">🎮</span><h2>JUMPVERSE</h2><p>Platform Adventure</p><span class="hub-cta">PLAY JUMPVERSE <span aria-hidden="true">↗</span></span></a><a class="hub-card" href="wordforge.html"><span class="hub-icon">⚒️</span><h2>WORDFORGE</h2><p>Gamified English Learning</p><span class="hub-cta">PLAY WORDFORGE <span aria-hidden="true">↗</span></span></a></div><p class="hub-note">Vector Wake = Level 1 · Typing Challenge = current first WordForge mode</p></main></div>`;
