// Capri roaming the desktop. The window itself moves (through pywebview's bridge); inside it we
// only draw her sprite, a speech bubble, and a right-click menu. Original code for CapriCompanion,
// using the Lachy sprite sheets; behaviour ideas (perching, peeking, teleporting, falling) follow
// the reference projects credited in THIRD_PARTY_NOTICES.md, with no code or art copied.
const $ = (selector) => document.querySelector(selector);
const canvas = $('#capri');
const context = canvas.getContext('2d');
const bubble = $('#bubble');
const menu = $('#menu');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const token = (() => {
  const match = location.hash.match(/token=([A-Za-z0-9_-]+)/);
  if (match) {
    try { sessionStorage.setItem('capri.session', match[1]); } catch { /* reload needs the launcher */ }
    history.replaceState(null, '', location.pathname);
    return match[1];
  }
  try { return sessionStorage.getItem('capri.session') || ''; } catch { return ''; }
})();

const CLIPS = {
  idle: { frames: 16, fps: 8 }, blink: { frames: 4, fps: 9 }, blink_glitch: { frames: 4, fps: 12 },
  glitch: { frames: 10, fps: 15 }, grin: { frames: 16, fps: 8 }, mouth: { frames: 5, fps: 12 },
  sleep: { frames: 16, fps: 5 }, wake: { frames: 13, fps: 12 },
};
const images = {};
for (const name of Object.keys(CLIPS)) {
  images[name] = new Image();
  images[name].src = `/assets/sprites/${name}.png`;
}

const QUIPS = [
  'Careful, choom. I bite. Digitally.',
  'Poke me again and I’m reorganizing your desktop.',
  'Just stretching my code.',
  'Double-click me if you want to talk.',
  'Nice window. Mind if I sit on it?',
  'No corpos on this screen. I checked.',
  'Right-click me for options. I’m very configurable.',
  'Boo. Did that work?',
];
const IDLE_STATES = new Set(['idle', 'success', 'waking', 'sleeping']);
const SLEEP_AFTER = 4 * 60 * 1000;
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;

let api = null;
let pos = { x: 0, y: 0 };
let lastSentAt = 0;
let pendingMove = null;
let mode = 'boot'; // boot | float | glide | perch | peek | fall | teleport | sleep | drag | wake
let target = null;
let velocityY = 0;
let facing = 1; // 1 = as drawn (reaching left), -1 = mirrored
let perch = null;
let nextDecisionAt = performance.now() + 4000;
let peekUntil = 0;
let lastInteraction = performance.now();
let roaming = true;
let mainState = 'idle';
let lastSeq = -1;
let bubbleTimer = null;
let clipOverride = null;
let blinkAt = performance.now() + 5000;
let blinkStart = 0;
let blinkClip = 'blink';
let speakingSince = 0;
let drag = null;
let clickTimer = null;

function screenBox() {
  const left = screen.availLeft ?? 0;
  const top = screen.availTop ?? 0;
  return { left, top, right: left + screen.availWidth, bottom: top + screen.availHeight };
}
const floorY = () => screenBox().bottom - HEIGHT;
const rand = (low, high) => low + Math.random() * (high - low);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function place(x, y, now = performance.now(), force = false) {
  pos = { x, y };
  pendingMove = { x: Math.round(x), y: Math.round(y) };
  if (force || now - lastSentAt > 33) flushMove(now);
}

function flushMove(now = performance.now()) {
  if (!pendingMove || !api) return;
  const { x, y } = pendingMove;
  pendingMove = null;
  lastSentAt = now;
  api.move(x, y).catch(() => {});
}

function setFacing(direction) {
  facing = direction;
  canvas.style.setProperty('--facing', String(direction));
}

function say(text, ms) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  bubble.textContent = clean.length > 170 ? `${clean.slice(0, 167)}…` : clean;
  bubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), ms ?? clamp(clean.length * 60, 3500, 12000));
}

function flash(clip, ms) {
  clipOverride = { clip, until: performance.now() + ms };
}

// --- movement beats --------------------------------------------------------------------------
async function teleport(x, y, then = 'float') {
  mode = 'teleport';
  flash('glitch', 900);
  document.body.classList.add('phasing');
  await sleep(reduceMotion.matches ? 0 : 320);
  document.body.classList.add('gone');
  place(x, y, performance.now(), true);
  await sleep(120);
  document.body.classList.remove('gone');
  await sleep(reduceMotion.matches ? 0 : 330);
  document.body.classList.remove('phasing');
  if (mode === 'teleport') mode = then;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startGlide() {
  const box = screenBox();
  const x = rand(box.left + 10, box.right - WIDTH - 10);
  target = { x };
  setFacing(x > pos.x ? -1 : 1);
  mode = 'glide';
}

async function startPerch() {
  const rect = await api?.foreground_window().catch(() => null);
  const box = screenBox();
  if (!rect || rect.right - rect.left < WIDTH + 40 || rect.top - HEIGHT < box.top - 40) return false;
  const dx = rand(10, rect.right - rect.left - WIDTH - 10);
  perch = { id: rect.id, dx, checkedAt: 0 };
  await teleport(rect.left + dx, rect.top - HEIGHT + 10, 'perch');
  return true;
}

async function startPeek() {
  const box = screenBox();
  const leftSide = Math.random() < 0.5;
  setFacing(leftSide ? -1 : 1);
  await teleport(leftSide ? box.left - WIDTH * 0.42 : box.right - WIDTH * 0.58, floorY(), 'peek');
  peekUntil = performance.now() + rand(6000, 11000);
  say(leftSide ? 'Psst. Over here.' : 'Just peeking. Ignore me.', 3000);
}

async function randomTeleport() {
  const box = screenBox();
  await teleport(rand(box.left + 10, box.right - WIDTH - 10), floorY());
}

async function goHome() {
  const box = screenBox();
  setFacing(1);
  await teleport(box.right - WIDTH - 30, floorY());
}

async function decide() {
  if (!roaming) return;
  const roll = Math.random();
  if (roll < 0.34) startGlide();
  else if (roll < 0.52) { if (!(await startPerch())) startGlide(); }
  else if (roll < 0.64) await startPeek();
  else if (roll < 0.78) await randomTeleport();
  // otherwise she just floats for another beat
}

// --- loop ------------------------------------------------------------------------------------
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const busy = !IDLE_STATES.has(mainState);
  document.body.classList.toggle('busy', busy);

  if (mode === 'glide') {
    if (busy || !target) mode = 'float';
    else {
      const step = 95 * dt;
      const distance = target.x - pos.x;
      if (Math.abs(distance) <= step) { place(target.x, floorY(), now, true); mode = 'float'; nextDecisionAt = now + rand(4000, 9000); }
      else place(pos.x + Math.sign(distance) * step, floorY(), now);
    }
  } else if (mode === 'fall') {
    velocityY += 2400 * dt;
    const floor = floorY();
    const y = Math.min(floor, pos.y + velocityY * dt);
    place(pos.x, y, now, y >= floor);
    if (y >= floor) { velocityY = 0; mode = 'float'; flash('glitch', 350); nextDecisionAt = now + rand(3000, 7000); }
  } else if (mode === 'perch') {
    if (now - (perch?.checkedAt || 0) > 450 && api) {
      perch.checkedAt = now;
      api.foreground_window().then((rect) => {
        if (mode !== 'perch') return;
        if (!rect || rect.id !== perch.id) { mode = 'fall'; velocityY = 0; return; }
        place(rect.left + perch.dx, rect.top - HEIGHT + 10, performance.now(), true);
      }).catch(() => {});
    }
    if (!busy && now > nextDecisionAt + 12000) { mode = 'fall'; velocityY = 0; }
  } else if (mode === 'peek') {
    if (now > peekUntil || busy) { mode = 'float'; startGlide(); }
  } else if (mode === 'float') {
    const floor = floorY();
    if (Math.abs(pos.y - floor) > 2 && !drag) { mode = 'fall'; velocityY = 0; }
    else if (!busy && now >= nextDecisionAt) { nextDecisionAt = now + rand(5000, 11000); decide(); }
  }

  if (!busy && mode === 'float' && now - lastInteraction > SLEEP_AFTER) { mode = 'sleep'; document.body.classList.add('sleeping'); }
  if (mode === 'sleep' && (busy || now - lastInteraction < 1000)) wake();

  if (pendingMove && now - lastSentAt > 33) flushMove(now);
  const bob = reduceMotion.matches || mode === 'sleep' || mode === 'drag' ? 0 : Math.sin(now / 650) * 3;
  canvas.style.setProperty('--bob', `${bob.toFixed(1)}px`);
  draw(now, busy);
}

function wake() {
  if (mode !== 'sleep') return;
  document.body.classList.remove('sleeping');
  mode = 'float';
  flash('wake', 1100);
  nextDecisionAt = performance.now() + 5000;
}

function drawClip(name, index) {
  const image = images[name];
  const clip = CLIPS[name];
  if (!image?.complete || !image.naturalWidth) return;
  const width = image.naturalWidth / clip.frames;
  const frameIndex = ((index % clip.frames) + clip.frames) % clip.frames;
  context.drawImage(image, frameIndex * width, 0, width, image.naturalHeight, 0, 0, canvas.width, canvas.height);
}

function draw(now, busy) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (clipOverride && now > clipOverride.until) clipOverride = null;
  let clip = 'idle';
  if (clipOverride) clip = clipOverride.clip;
  else if (mode === 'sleep') clip = 'sleep';
  else if (mode === 'fall' || mode === 'drag') clip = 'glitch';
  else if (['thinking', 'approval', 'success'].includes(mainState)) clip = 'grin';
  else if (['error', 'glitch'].includes(mainState)) clip = 'glitch';
  const info = CLIPS[clip];
  const index = reduceMotion.matches ? 0 : Math.floor((now / 1000) * info.fps);
  if (clip === 'idle' && !busy && !blinkStart && now > blinkAt) { blinkStart = now; blinkClip = Math.random() < 0.2 ? 'blink_glitch' : 'blink'; }
  const blinkInfo = CLIPS[blinkClip];
  if (blinkStart && now - blinkStart > (blinkInfo.frames / blinkInfo.fps) * 1000) { blinkStart = 0; blinkAt = now + rand(5000, 11000); }
  if (blinkStart && clip === 'idle') drawClip(blinkClip, Math.floor(((now - blinkStart) / 1000) * blinkInfo.fps));
  else drawClip(clip, index);
  if (mainState === 'speaking' && clip === 'idle' && !blinkStart) drawClip('mouth', Math.floor(((now - speakingSince) / 1000) * CLIPS.mouth.fps));
}

// --- talking to the main window --------------------------------------------------------------
async function poll() {
  try {
    const response = await fetch('/api/pet-state', { headers: { 'X-Capri-Token': token } });
    if (response.ok) {
      const data = await response.json();
      if (data.state !== mainState) {
        if (data.state === 'speaking') speakingSince = performance.now();
        if (!IDLE_STATES.has(data.state)) lastInteraction = performance.now();
        mainState = data.state;
      }
      if (lastSeq >= 0 && data.seq > lastSeq && data.line) say(data.line);
      lastSeq = data.seq;
    }
  } catch { /* the server may be closing */ }
  setTimeout(poll, 400);
}

// --- mouse -----------------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  menu.classList.add('hidden');
  lastInteraction = performance.now();
  wake();
  drag = { startX: event.screenX, startY: event.screenY, x: pos.x, y: pos.y, moved: false, previousMode: mode };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = event.screenX - drag.startX;
  const dy = event.screenY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved) { drag.moved = true; mode = 'drag'; perch = null; }
  place(drag.x + dx, drag.y + dy);
});
canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  const { moved, previousMode } = drag;
  drag = null;
  lastInteraction = performance.now();
  if (moved) {
    flushMove();
    mode = 'fall';
    velocityY = 0;
    say('Whoa, hey! Hands off the merchandise.', 2500);
    return;
  }
  if (mode === 'teleport') return;
  mode = previousMode === 'drag' ? 'float' : previousMode;
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    say('Opening our channel…', 2000);
    api?.open_chat().catch(() => {});
    return;
  }
  clickTimer = setTimeout(() => {
    clickTimer = null;
    flash('grin', 1200);
    say(QUIPS[Math.floor(Math.random() * QUIPS.length)], 3500);
  }, 320);
});
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  lastInteraction = performance.now();
  menu.querySelector('[data-action="roam"]').textContent = roaming ? 'STAY PUT' : 'START ROAMING';
  menu.classList.toggle('hidden');
});
document.addEventListener('pointerdown', (event) => { if (!menu.contains(event.target) && event.target !== canvas) menu.classList.add('hidden'); });
menu.addEventListener('click', async (event) => {
  const action = event.target.closest('button')?.dataset.action;
  if (!action) return;
  menu.classList.add('hidden');
  if (action === 'chat') api?.open_chat().catch(() => {});
  if (action === 'roam') { roaming = !roaming; say(roaming ? 'Free range again.' : 'Fine. I’ll stay right here.', 2500); try { localStorage.setItem('capri.roaming', String(roaming)); } catch { /* optional */ } }
  if (action === 'home') { perch = null; await goHome(); }
  if (action === 'hide') { say('Back in my biochip. Turn ROAM on in the chat to bring me back.', 1800); await sleep(1500); api?.stay_hidden().catch(() => {}); }
  if (action === 'quit') { say('Flatlining for now. Later, choom.', 1500); await sleep(1200); api?.quit().catch(() => {}); }
});

// --- start -----------------------------------------------------------------------------------
async function start() {
  api = window.pywebview?.api || null;
  try { roaming = localStorage.getItem('capri.roaming') !== 'false'; } catch { roaming = true; }
  const current = api ? await api.position().catch(() => null) : null;
  if (current) pos = { x: current.x, y: current.y };
  setFacing(1);
  const box = screenBox();
  await teleport(box.right - WIDTH - 30, floorY());
  say('Out of the box and onto your desktop. Double-click me to talk.', 4500);
  nextDecisionAt = performance.now() + 7000;
  poll();
}

requestAnimationFrame(frame);
if (window.pywebview?.api) start();
else window.addEventListener('pywebviewready', start, { once: true });
