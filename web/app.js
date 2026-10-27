const $ = (selector) => document.querySelector(selector);
const chatLog = $('#chat-log');
const messageInput = $('#message-input');
const sendButton = $('#send-button');
const chatStatus = $('#chat-status');
const avatar = $('#avatar');
const avatarStage = $('.avatar-stage');
const avatarPhoto = $('#avatar-photo');
const capriSprite = $('#capri-sprite');
const spriteContext = capriSprite.getContext('2d');
const toastEl = $('#toast');
const speechAudio = $('#speech-audio');

// Preferences only. Chat history lives in the server's encrypted archive, never in browser storage.
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* preferences are optional */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* optional */ } },
};
store.remove('capri.messages.v1'); // older versions kept a plaintext copy of the chat here

// The launcher passes a per-launch key in the URL fragment. Keep it for reloads of this window
// only (sessionStorage), and strip it from the address bar.
const sessionToken = (() => {
  const match = location.hash.match(/token=([A-Za-z0-9_-]+)/);
  if (match) {
    try { sessionStorage.setItem('capri.session', match[1]); } catch { /* reload will need the launcher */ }
    history.replaceState(null, '', location.pathname);
    return match[1];
  }
  try { return sessionStorage.getItem('capri.session') || ''; } catch { return ''; }
})();

function localFetch(path, options = {}) {
  return fetch(path, { ...options, headers: { ...(options.headers || {}), 'X-Capri-Token': sessionToken } });
}

const VOICE_PREF_VERSION = '2';
let messages = [];
let sending = false;
let modelReady = false;
let modelsInitialized = false;
let historyReadyPromise = Promise.resolve();
let historySaveTimer = null;
let recording = false;
let voiceEnabled = store.get('capri.voiceEnabled') !== 'false';
let selectedVoice = (() => {
  // One-time move to the new Capri blend. After that, whatever the user picks is kept.
  if (store.get('capri.voiceVersion') !== VOICE_PREF_VERSION) {
    store.set('capri.voiceVersion', VOICE_PREF_VERSION);
    store.set('capri.voice', 'capri');
    return 'capri';
  }
  return store.get('capri.voice') || 'capri';
})();
let sfxEnabled = store.get('capri.sfxEnabled') !== 'false';
let fxEnabled = store.get('capri.voiceFx') !== 'false';
let onlineEnabled = store.get('capri.online') === 'true';
let powerEnabled = false; // never remembered: power mode is switched on per session, on purpose
let powerArmTimer = null;
let petAvailable = false;
let petVisible = false;
let lastPetState = '';
let micStream = null;
let audioContext = null;
let effectsAudioContext = null;
let voiceFx = null;
let processor = null;
let micBuffers = [];
let maxRecordTimer = null;
let toastTimer = null;
let spritesReady = false;
let blinkStartedAt = 0;
let activeBlinkClip = 'blink';
let nextBlinkAt = performance.now() + 7000;
let lastActivityAt = performance.now();
let nextIdleGlitchAt = performance.now() + 45000 + Math.random() * 45000;
let speechSequence = 0;
let speechAbort = null;
let speechActive = false;
let speechStopResolver = null;
let clearArmedTimer = null;
let memoryClearArmed = null;
let memoryPromptChars = 900;
let pointerFrame = 0;
let pointerPosition = null;
let avatarUrl = null;
const timers = new Map();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const spriteClips = {
  idle: { frames: 16, fps: 8 },
  blink: { frames: 4, fps: 9 },
  blink_glitch: { frames: 4, fps: 12 },
  glitch: { frames: 10, fps: 15 },
  grin: { frames: 16, fps: 8 },
  mouth: { frames: 5, fps: 12 },
  sleep: { frames: 16, fps: 5 },
  wake: { frames: 13, fps: 12 },
};
const spriteImages = {};

for (const name of Object.keys(spriteClips)) {
  const image = new Image();
  image.onload = () => {
    if (name === 'idle') {
      spritesReady = true;
      if (!avatar.classList.contains('has-custom-image')) showOriginalAvatar();
    }
  };
  image.src = `/assets/sprites/${name}.png`;
  spriteImages[name] = image;
}

function saveMessages() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    apiJson('/api/history', { messages: messages.slice(-300) }).catch((error) => {
      setStatus(`Local chat history could not be saved: ${error.message}`, 'error');
    });
  }, 350);
}

async function flushHistory() {
  if (!historySaveTimer) return;
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  await apiJson('/api/history', { messages: messages.slice(-300) }).catch(() => {});
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

function setStatus(message, mode = '') {
  chatStatus.textContent = message.toUpperCase();
  chatStatus.className = `chat-status ${mode}`.trim();
}

function notifyPet(state, line = '') {
  if (!sessionToken || !petVisible) return;
  if (state === lastPetState && !line) return;
  lastPetState = state;
  localFetch('/api/pet-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, line }) }).catch(() => {});
}

function setAvatar(state, copy) {
  notifyPet(state);
  avatar.dataset.state = state;
  avatarStage.dataset.state = state;
  if (copy) $('#status-copy').textContent = copy;
  if (state !== 'sleeping') lastActivityAt = performance.now();
  if (['success', 'glitch', 'waking'].includes(state)) {
    const duration = state === 'glitch' ? 700 : 1200;
    setTimeout(() => { if (avatar.dataset.state === state) setAvatar('idle'); }, duration);
  }
}

function resetAvatarLook() {
  avatar.style.removeProperty('--look-x');
  avatar.style.removeProperty('--look-y');
  avatar.style.removeProperty('--look-tilt');
}

function updateAvatarLook() {
  pointerFrame = 0;
  if (!pointerPosition || reduceMotion.matches) {
    resetAvatarLook();
    return;
  }
  const bounds = avatarStage.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (pointerPosition.x - bounds.left - bounds.width / 2) / (bounds.width / 2)));
  const y = Math.max(-1, Math.min(1, (pointerPosition.y - bounds.top - bounds.height / 2) / (bounds.height / 2)));
  avatar.style.setProperty('--look-x', `${(x * 3).toFixed(1)}px`);
  avatar.style.setProperty('--look-y', `${(y * 2).toFixed(1)}px`);
  avatar.style.setProperty('--look-tilt', `${(x * -1.2).toFixed(2)}deg`);
}

avatarStage.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' || reduceMotion.matches) return;
  pointerPosition = { x: event.clientX, y: event.clientY };
  if (!pointerFrame) pointerFrame = requestAnimationFrame(updateAvatarLook);
}, { passive: true });
avatarStage.addEventListener('pointerleave', () => {
  pointerPosition = null;
  if (!pointerFrame) resetAvatarLook();
});
reduceMotion.addEventListener?.('change', (event) => {
  if (event.matches) {
    pointerPosition = null;
    resetAvatarLook();
  }
});

function playCyberSfx(kind = 'reply') {
  if (!sfxEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    if (!effectsAudioContext) effectsAudioContext = new AudioContextClass();
    if (effectsAudioContext.state === 'suspended') effectsAudioContext.resume().catch(() => {});
    const frequencies = {
      glitch: [190, 120],
      scan: [440, 660],
      end: [520],
      alarm: [880, 660, 880, 660, 990],
      approval: [600, 900],
    }[kind] || [740, 980];
    const now = effectsAudioContext.currentTime;
    const step = kind === 'alarm' ? 0.16 : 0.055;
    frequencies.forEach((frequency, index) => {
      const start = now + index * step;
      const oscillator = effectsAudioContext.createOscillator();
      const gain = effectsAudioContext.createGain();
      const filter = effectsAudioContext.createBiquadFilter();
      oscillator.type = kind === 'glitch' ? 'sawtooth' : kind === 'alarm' ? 'square' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === 'reply') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, start + 0.12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'glitch' ? 0.045 : kind === 'alarm' ? 0.035 : 0.028, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'alarm' ? 0.13 : 0.17));
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      oscillator.connect(filter).connect(gain).connect(effectsAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch { /* Effects are optional when audio hardware is unavailable. */ }
}

async function showSavedAvatar() {
  try {
    // Fetched with the launch key and shown from a blob URL, which also avoids a stale cached image.
    const response = await localFetch('/api/avatar');
    if (!response.ok) throw new Error('No custom avatar is saved.');
    const url = URL.createObjectURL(await response.blob());
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    avatarUrl = url;
    avatarPhoto.src = url;
    avatarPhoto.hidden = false;
    capriSprite.hidden = true;
    avatar.classList.add('has-custom-image');
    avatar.classList.remove('has-sprite');
    $('#avatar-reset').classList.remove('hidden');
  } catch {
    showOriginalAvatar();
  }
}

function showOriginalAvatar() {
  avatar.classList.remove('has-custom-image');
  $('#avatar-reset').classList.add('hidden');
  if (spritesReady) {
    capriSprite.hidden = false;
    avatarPhoto.hidden = true;
    avatar.classList.add('has-sprite');
  } else {
    capriSprite.hidden = true;
    avatarPhoto.src = '/assets/capri.png';
    avatarPhoto.hidden = false;
    avatar.classList.remove('has-sprite');
  }
}

function drawSprite(name, frame) {
  const image = spriteImages[name];
  const clip = spriteClips[name];
  if (!image?.complete || !image.naturalWidth || !clip) return;
  const frameWidth = image.naturalWidth / clip.frames;
  const frameIndex = ((frame % clip.frames) + clip.frames) % clip.frames;
  spriteContext.drawImage(image, frameIndex * frameWidth, 0, frameWidth, image.naturalHeight, 0, 0, capriSprite.width, capriSprite.height);
}

let lastSpriteFrame = 0;
function animateCapriSprite(now) {
  requestAnimationFrame(animateCapriSprite);
  // About 12 frames per second matches the sprite timing and keeps GPU use tiny.
  if (now - lastSpriteFrame < 1000 / 12) return;
  lastSpriteFrame = now;
  if (!spritesReady || capriSprite.hidden || document.hidden) return;
  const state = avatar.dataset.state;
  const stateClips = { thinking: 'grin', success: 'grin', approval: 'grin', error: 'glitch', glitch: 'glitch', sleeping: 'sleep', waking: 'wake' };
  const baseClip = stateClips[state] || 'idle';
  const clip = spriteClips[baseClip];
  const baseFrame = reduceMotion.matches ? 0 : Math.floor(now / 1000 * clip.fps) % clip.frames;
  const canBlink = ['idle', 'listening', 'speaking'].includes(state);
  if (canBlink && !blinkStartedAt && now >= nextBlinkAt) {
    activeBlinkClip = state === 'idle' && Math.random() < 0.2 ? 'blink_glitch' : 'blink';
    blinkStartedAt = now;
  }
  const blinkClip = spriteClips[activeBlinkClip];
  const blinking = blinkStartedAt && now - blinkStartedAt < blinkClip.frames / blinkClip.fps * 1000;
  if (blinkStartedAt && !blinking) {
    blinkStartedAt = 0;
    activeBlinkClip = 'blink';
    nextBlinkAt = now + 6500 + Math.random() * 5000;
  }
  spriteContext.clearRect(0, 0, capriSprite.width, capriSprite.height);
  if (blinking) {
    drawSprite(activeBlinkClip, Math.floor((now - blinkStartedAt) / 1000 * blinkClip.fps));
  } else {
    drawSprite(baseClip, baseFrame);
    if (state === 'speaking' && !speechAudio.paused) drawSprite('mouth', Math.floor(speechAudio.currentTime * spriteClips.mouth.fps));
  }
}

requestAnimationFrame(animateCapriSprite);
setInterval(() => {
  const now = performance.now();
  if (document.hidden) return;
  if (avatar.dataset.state === 'idle' && now - lastActivityAt > 150000) {
    setAvatar('sleeping', 'Signal low. Tap anywhere when you need me.');
  } else if (avatar.dataset.state === 'idle' && now >= nextIdleGlitchAt && !reduceMotion.matches) {
    nextIdleGlitchAt = now + 60000 + Math.random() * 90000;
    playCyberSfx('glitch');
    setAvatar('glitch', 'A little static. I’m fine.');
  }
}, 5000);
function wakeCapri() {
  lastActivityAt = performance.now();
  if (avatar.dataset.state === 'sleeping') {
    playCyberSfx('scan');
    setAvatar('waking', 'Back online. What did I miss?');
  }
}
document.addEventListener('pointerdown', wakeCapri, { passive: true });
document.addEventListener('keydown', wakeCapri);

async function saveAvatarFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showToast('Choose a PNG, JPEG, or WebP image.', true);
    return;
  }
  if (file.size > 8_000_000) {
    showToast('That image is too large. Choose one under 8 MB.', true);
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error('I could not resize that image.')), 'image/webp', 0.86));
    if (blob.size > 2_000_000) throw new Error('That image is still too large after resizing.');
    const response = await localFetch('/api/avatar', { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'I could not save that avatar image.');
    await showSavedAvatar();
    showToast('Avatar image saved on this PC.');
  } catch (error) {
    showToast(error.message || 'I could not load that image.', true);
  }
}

async function sendMediaAction(action) {
  try {
    const data = await apiJson('/api/media', { action });
    setStatus('Key sent to Windows.');
    showToast(data.message || 'Media key sent to the active Windows player.');
  } catch (error) {
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

// --- safe rich text: builds DOM nodes, never innerHTML, so model output cannot inject markup.
function appendInline(parent, text) {
  for (const part of text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      parent.append(code);
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function renderRichText(container, text) {
  container.replaceChildren();
  const pieces = String(text).split(/```[\w+-]*\n?([\s\S]*?)(?:```|$)/g);
  pieces.forEach((piece, index) => {
    if (index % 2 === 1) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = piece.replace(/\n$/, '');
      pre.append(code);
      container.append(pre);
      return;
    }
    let list = null;
    const lines = piece.split('\n');
    const bulletAt = (index) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[index] ?? '');
    lines.forEach((line, lineIndex) => {
      // Lists are blocks with their own spacing, so blank lines around them are dropped.
      if (!line.trim() && (bulletAt(lineIndex - 1) || bulletAt(lineIndex + 1))) return;
      const bullet = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      if (bullet) {
        const kind = bullet[1] ? 'OL' : 'UL';
        if (!list || list.tagName !== kind) {
          list = document.createElement(kind.toLowerCase());
          container.append(list);
        }
        const item = document.createElement('li');
        appendInline(item, bullet[2]);
        list.append(item);
        return;
      }
      list = null;
      const lastBeforeBlock = lineIndex === lines.length - 1 || bulletAt(lineIndex + 1) || (!lines[lineIndex + 1]?.trim() && bulletAt(lineIndex + 2));
      appendInline(container, line + (lastBeforeBlock ? '' : '\n'));
    });
  });
}

function nearBottom() {
  return chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 80;
}

function scrollChat(force = false) {
  if (force || nearBottom()) chatLog.scrollTop = chatLog.scrollHeight;
}

function buildMessage(role, label) {
  const welcome = chatLog.querySelector('.welcome');
  if (welcome) welcome.remove();
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const badge = document.createElement('div');
  badge.className = 'message-badge';
  badge.textContent = role === 'assistant' ? 'C' : 'YOU';
  const body = document.createElement('div');
  body.className = 'message-content';
  const speaker = document.createElement('span');
  speaker.className = 'speaker';
  speaker.textContent = label || (role === 'assistant' ? 'CAPRI' : 'YOU');
  const text = document.createElement('span');
  body.append(speaker, text);
  wrapper.append(badge, body);
  chatLog.append(wrapper);
  return { wrapper, text };
}

function setMessageText(role, element, content) {
  if (role === 'assistant') renderRichText(element, content);
  else element.textContent = content;
}

function addMessage(role, content, save = true) {
  const clean = String(content ?? '').trim();
  if (!clean) return;
  const stick = nearBottom();
  messages.push({ role, content: clean });
  if (messages.length > 300) messages = messages.slice(-300);
  setMessageText(role, buildMessage(role).text, clean);
  scrollChat(stick || role === 'user');
  if (save) saveMessages();
}

// Errors, system notices, and tool output are shown in the log but are NOT added to `messages`,
// so they are never saved to the archive or sent back to the model as if Capri had said them.
function addNotice(content, label = 'CAPRI · SYSTEM') {
  const stick = nearBottom();
  const { wrapper, text } = buildMessage('assistant', label);
  wrapper.classList.add('notice');
  text.textContent = String(content ?? '').trim();
  scrollChat(stick);
}

function createStreamingAssistantBubble() {
  const { wrapper, text } = buildMessage('assistant');
  wrapper.classList.add('streaming');
  return (content, done = false) => {
    const stick = nearBottom();
    renderRichText(text, content);
    if (done) wrapper.classList.remove('streaming');
    scrollChat(stick);
  };
}

function describeAction(action) {
  const args = action.arguments || {};
  const mediaLabels = {
    play_pause: 'Play or pause the active player', next: 'Skip to the next track', previous: 'Go to the previous track',
    replay: 'Send the replay/previous key to the active player', volume_up: 'Turn the system volume up', volume_down: 'Turn the system volume down', mute: 'Mute or unmute the system volume',
  };
  const folderLabels = { documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop', capri_notes: 'Capri Notes' };
  switch (action.name) {
    case 'open_app': return `Open ${String(args.app || 'an app').replaceAll('_', ' ')}.`;
    case 'control_media': return mediaLabels[args.action] || 'Control the active media player.';
    case 'open_personal_folder': return `Open your ${folderLabels[args.folder] || 'personal'} folder.`;
    case 'check_windows_security': return 'Read the current Windows Defender and firewall status. The result is shown here and not saved.';
    case 'lock_pc': return 'Lock your Windows session now (like Win+L).';
    case 'see_screen': return 'Capture one image of your primary screen and send it to Capri’s local vision model. The screenshot is temporary and will not be saved.';
    case 'list_local_files': {
      const folder = folderLabels[args.folder] || 'selected folder';
      const subfolder = String(args.path || '').slice(0, 240);
      return `List up to 60 visible names in ${folder}${subfolder ? `\\${subfolder}` : ''}. This is non-recursive; hidden and sensitive-looking entries are skipped. The listing will not be saved to chat history.`;
    }
    case 'read_local_file': {
      const folder = folderLabels[args.folder] || 'selected folder';
      return `Read up to 4,000 characters from ${folder}\\${String(args.path || '').slice(0, 260)} and send a bounded excerpt to the local model for this reply only. The excerpt will not be saved to chat history.`;
    }
    case 'run_command': {
      const folders = { home: 'Home', documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop', app: 'Capri app folder' };
      if (args.power) {
        return `POWER MODE — run this ${args.shell === 'powershell' ? 'PowerShell' : 'Command Prompt'} command once in ${folders[args.directory] || 'Home'}:\n${String(args.command || '').slice(0, 2000)}\n\nIt runs as you (not admin) and can change files. Only allow it if you understand it. The output is shown here and not saved.`;
      }
      return `Run this read-only Windows command once in ${folders[args.directory] || 'Home'}:\n${String(args.command || '').slice(0, 1200)}\n\nThe output is shown here and not saved to chat history.`;
    }
    case 'read_clipboard': return 'Read the text you copied (up to 4,000 characters) and send it to the local model for this reply only. It is not saved to chat history.';
    case 'open_website': return `Open this address in your web browser?\n${String(args.url || '').slice(0, 500)}`;
    case 'save_note': return `Save a note on this PC.\n${String(args.title || 'Note').slice(0, 100)}\n${String(args.content || '').slice(0, 500)}`;
    case 'remember_user_detail': return `Add this to Capri’s private, encrypted local memory?\n${String(args.content || '').slice(0, 300)}`;
    default: return 'Run one bounded local action.';
  }
}

// Tool output that can contain machine details is shown once and kept out of the saved archive.
const UNSAVED_RESULT_TOOLS = { run_command: 'CAPRI · COMMAND OUTPUT · NOT SAVED', check_windows_security: 'CAPRI · SECURITY STATUS · NOT SAVED' };

function addActionApproval(action) {
  const card = document.createElement('section');
  card.className = `action-approval${action.arguments?.power ? ' power' : ''}`;
  card.setAttribute('aria-label', 'Local action approval');
  const heading = document.createElement('div');
  heading.className = 'approval-heading';
  heading.textContent = action.arguments?.power ? 'POWER COMMAND · READ IT FIRST' : 'LOCAL ACTION · YOUR CALL';
  const detail = document.createElement('p');
  detail.className = 'approval-detail';
  detail.textContent = describeAction(action);
  const status = document.createElement('div');
  status.className = 'approval-status';
  status.textContent = 'Nothing runs until you approve it.';
  const controls = document.createElement('div');
  controls.className = 'approval-controls';
  const allow = document.createElement('button');
  allow.className = 'approval-allow';
  allow.type = 'button';
  allow.textContent = 'ALLOW ONCE';
  const deny = document.createElement('button');
  deny.className = 'approval-deny';
  deny.type = 'button';
  deny.textContent = 'SKIP';
  controls.append(allow, deny);
  card.append(heading, detail, status, controls);
  chatLog.append(card);
  scrollChat(true);

  allow.addEventListener('click', async () => {
    allow.disabled = true;
    deny.disabled = true;
    status.textContent = 'Waiting for your approved local action…';
    let result;
    try {
      result = await apiJson('/api/execute-tool', { approval_id: action.approval_id });
    } catch (error) {
      status.textContent = `That action did not run: ${error.message}`;
      allow.disabled = false;
      deny.disabled = false;
      setStatus(error.message, 'error');
      showToast(error.message, true);
      return;
    }
    controls.remove();
    if (action.name === 'list_local_files') {
      status.textContent = 'Approved · names were read locally and not saved to chat history.';
      addNotice(result.message || 'No visible entries were found.', 'CAPRI · FILE LIST · NOT SAVED');
      setAvatar('success', 'Local file names are ready.');
      setStatus('Approved local file listing. The result was not saved.');
      return;
    }
    if (action.name === 'read_local_file' || action.name === 'read_clipboard') {
      status.textContent = 'Approved · sending a bounded excerpt to local Ollama for a one-turn summary…';
      addNotice('The approved excerpt is being used for this local reply only. It is not saved to chat history or memory.');
      setAvatar('thinking', 'Reading one approved local excerpt…');
      setStatus('Summarizing the approved file excerpt locally…', 'busy');
      try {
        const requestText = [...messages].reverse().find((item) => item.role === 'user')?.content || 'Summarize this file excerpt.';
        const answerBubble = createStreamingAssistantBubble();
        const summary = await streamChat({
          model: $('#model-select').value,
          messages: [{ role: 'user', content: requestText }],
          allow_tools: false,
          untrusted_context: result.file_text || '',
        }, (partial) => {
          answerBubble(partial);
          setStatus('Capri is summarizing the approved excerpt…', 'busy');
        });
        const reply = (summary.reply || '').trim() || 'I could not find enough readable text in that excerpt to summarize.';
        answerBubble(reply, true);
        messages.push({ role: 'assistant', content: reply });
        if (messages.length > 300) messages = messages.slice(-300);
        saveMessages();
        status.textContent = 'File review complete · excerpt discarded after this local request.';
        setAvatar('success', 'Excerpt reviewed; the source text was not kept.');
        setStatus('Local file summary complete. Source text was not saved.');
        if (voiceEnabled) void speak(reply);
      } catch (error) {
        status.textContent = `The file was read, but its summary failed: ${error.message}`;
        addNotice(`The local summary could not finish: ${error.message}`);
        setAvatar('error', 'The local summary link dropped.');
        setStatus(error.message, 'error');
      }
      return;
    }
    if (action.name === 'see_screen' && result.image) {
      status.textContent = 'Approved · reviewing this one screenshot locally. The image will not be saved.';
      setAvatar('thinking', 'Looking at one approved screen capture…');
      setStatus('Screen capture approved. Analyzing locally; image is not saved.', 'busy');
      playCyberSfx('scan');
      try {
        const vision = await apiJson('/api/chat', {
          model: $('#model-select').value,
          messages: messages.filter((item) => item.role === 'user').slice(-1),
          screen_image: result.image,
        });
        const reply = (vision.reply || '').trim() || 'The screenshot came through, but I could not read enough to answer.';
        const reveal = () => addMessage('assistant', reply);
        if (voiceEnabled) await speak(reply, false, reveal);
        else { reveal(); setAvatar('success', 'Screen review complete.'); }
        status.textContent = 'Screen review complete · temporary image discarded.';
        setStatus('Local screen review complete. The image was not saved.');
      } catch (error) {
        status.textContent = `The screenshot was captured, but the local analysis failed: ${error.message}. The image was discarded.`;
        addNotice(`Screen analysis failed: ${error.message}`);
        setAvatar('error', 'My optics glitched on that one.');
        setStatus(error.message, 'error');
      }
      return;
    }
    status.textContent = `APPROVED · ${action.name.replaceAll('_', ' ')}`;
    if (UNSAVED_RESULT_TOOLS[action.name]) addNotice(result.message || 'Done.', UNSAVED_RESULT_TOOLS[action.name]);
    else addMessage('assistant', result.message || 'Done.');
    setAvatar('success', 'Done. Your call, your controls.');
    playCyberSfx('scan');
    setStatus(`Approved local action: ${action.name.replaceAll('_', ' ')}.`);
    if (voiceEnabled && !UNSAVED_RESULT_TOOLS[action.name]) speak(`Done. ${String(result.message || '').slice(0, 240)}`);
  });
  deny.addEventListener('click', () => {
    allow.disabled = true;
    deny.disabled = true;
    controls.remove();
    status.textContent = 'SKIPPED · No action was taken.';
    setAvatar('idle', 'Left that one alone. Your desktop, your rules.');
    setStatus('Local action skipped.');
  });
}

function showWelcome() {
  if (messages.length) return;
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  const mark = document.createElement('div');
  mark.className = 'welcome-mark';
  mark.textContent = '// CONNECTION ESTABLISHED';
  const title = document.createElement('h3');
  title.textContent = 'Well, well. A new line to the outside.';
  const copy = document.createElement('p');
  copy.textContent = 'Ask me about a project, game, or playlist. I can check your PC stats, do exact math, set timers, control your music and volume, and look at your screen when you ask. Say “remember I like…” to save something locally. Every desktop action waits for your OK.';
  welcome.append(mark, title, copy);
  chatLog.append(welcome);
}

function renderMessages() {
  chatLog.replaceChildren();
  if (!messages.length) { showWelcome(); return; }
  for (const message of messages) {
    setMessageText(message.role, buildMessage(message.role).text, message.content);
  }
  scrollChat(true);
}

async function apiJson(path, payload) {
  const response = await localFetch(path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Local app error (${response.status}).`);
  return data;
}

async function streamChat(payload, onToken) {
  const response = await localFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/x-ndjson')) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Local app error (${response.status}).`);
    return data;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamedReply = '';
  let finalResult = null;
  const readLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);
    if (typeof event.token === 'string') {
      streamedReply += event.token;
      onToken(streamedReply);
    }
    if (event.result && typeof event.result === 'object') finalResult = event.result;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      readLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
    if (done) break;
  }
  if (buffer.trim()) readLine(buffer);
  if (!finalResult) throw new Error('The local model connection ended before the reply was complete.');
  if (!finalResult.reply && streamedReply) finalResult.reply = streamedReply;
  return finalResult;
}

async function restoreHistory() {
  try {
    const data = await apiJson('/api/history');
    messages = Array.isArray(data.messages) ? data.messages.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-300) : [];
    renderMessages();
  } catch (error) {
    renderMessages();
    setStatus(`Local chat archive unavailable: ${error.message}`, 'error');
  }
}

function updateToggle(id, on) {
  const button = $(id);
  button.classList.toggle('on', on);
  button.setAttribute('aria-pressed', String(on));
}

// Rebuild a <select> only when its choices actually changed, so a periodic refresh never closes an
// open dropdown or resets the user's pick.
function syncOptions(select, entries) {
  const current = Array.from(select.options, (option) => `${option.value}\u0000${option.textContent}`).join('\u0001');
  const next = entries.map(([value, label]) => `${value}\u0000${label}`).join('\u0001');
  if (current === next) return;
  select.replaceChildren(...entries.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
}

function isBusy() {
  return sending || recording || ['thinking', 'speaking', 'listening', 'approval'].includes(avatar.dataset.state);
}

let fastRefreshTimer = null;
// `quiet` is used by the background check. It keeps the indicators current but does not
// overwrite the avatar or status line unless the model actually became ready or unavailable.
async function refreshModels({ quiet = false } = {}) {
  const wasReady = modelReady;
  if (!quiet) $('#connection-foot').textContent = 'CHECKING LOCAL LINK…';
  try {
    const data = await apiJson('/api/health');
    const voiceSelect = $('#voice-select');
    const availableVoices = data.voices && typeof data.voices === 'object' ? data.voices : {};
    syncOptions(voiceSelect, Object.entries(availableVoices));
    selectedVoice = Object.prototype.hasOwnProperty.call(availableVoices, selectedVoice) ? selectedVoice : (data.default_voice || 'capri');
    voiceSelect.value = selectedVoice;
    voiceSelect.disabled = !data.voice_ready;
    $('#voice-preview').disabled = !data.voice_ready;
    petAvailable = Boolean(data.pet_available);
    petVisible = Boolean(data.pet_visible);
    $('#roam-toggle').disabled = !petAvailable;
    $('#roam-toggle').title = petAvailable ? 'Let Capri roam your desktop in her own little window' : 'Roaming needs the desktop app (not browser mode)';
    updateToggle('#roam-toggle', petVisible);
    store.set('capri.voice', selectedVoice);
    const select = $('#model-select');
    // On the first check the saved choice wins; later checks keep whatever is selected now.
    let previous = (modelsInitialized ? select.value : store.get('capri.model')) || select.value || data.default_model;
    const availableModels = Array.isArray(data.models) ? data.models : [];
    const ready = Boolean(data.ollama && availableModels.length > 0);
    modelReady = ready;
    if (availableModels.length) {
      modelsInitialized = true;
      syncOptions(select, availableModels.map((model) => [model, model]));
      if (!availableModels.includes(previous)) previous = availableModels.includes(data.default_model) ? data.default_model : availableModels[0];
      select.value = previous;
      store.set('capri.model', select.value);
    } else {
      const note = data.ollama_starting ? 'waking up…' : (data.ollama ? 'not downloaded' : 'setup needed');
      syncOptions(select, [[data.default_model, `${data.default_model} · ${note}`]]);
      select.value = data.default_model;
    }
    $('#status-dot').className = `online-dot ${ready ? 'ready' : 'error'}`;
    $('#status-label').textContent = ready ? 'LOCAL MODEL READY' : (data.ollama_starting ? 'WAKING LOCAL MODEL…' : (data.ollama ? 'MODEL DOWNLOAD NEEDED' : 'LOCAL MODEL NOT RUNNING'));
    $('#connection-foot').textContent = ready ? `LINKED · ${data.num_ctx || 2048} TOKEN CONTEXT` : (data.ollama ? 'WAITING FOR A LOCAL MODEL' : 'OPEN SETUP GUIDE');
    clearTimeout(fastRefreshTimer);
    if (data.ollama_starting) fastRefreshTimer = setTimeout(() => refreshModels({ quiet: true }), 1500);
    if ((quiet && ready === wasReady) || isBusy()) return;
    if (data.ollama_starting && !ready) { setAvatar('thinking', 'Booting my local brain…'); setStatus('Starting Capri’s private Ollama service…', 'busy'); return; }
    setAvatar(ready ? 'idle' : 'error', ready ? 'Your local little troublemaker is online.' : 'I need my local model before I can think.');
    if (!ready) setStatus(data.ollama ? 'The local model is not ready yet. Refresh after setup finishes.' : 'Run the one-time setup, then refresh the model list.', 'error');
    else setStatus(data.voice_ready ? 'Messages and voice are processed on this PC.' : 'Local chat is ready. Run setup_local_model.bat to install Capri’s offline voice.');
  } catch (error) {
    modelReady = false;
    $('#status-dot').className = 'online-dot error';
    $('#status-label').textContent = 'LOCAL LINK UNAVAILABLE';
    $('#connection-foot').textContent = 'OPEN SETUP GUIDE';
    if ((quiet && !wasReady) || isBusy()) return;
    setAvatar('error', 'I can’t reach the local model runner yet.');
    setStatus(error.message, 'error');
  }
}

function addSources(urls) {
  if (!Array.isArray(urls) || !urls.length) return;
  const stick = nearBottom();
  const { wrapper, text } = buildMessage('assistant', 'CAPRI · WEB SOURCES');
  wrapper.classList.add('notice');
  const list = document.createElement('div');
  list.className = 'sources';
  for (const url of urls.slice(0, 5)) {
    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = String(url).replace(/^https?:\/\//, '').slice(0, 90);
    link.title = `Open ${url} in your browser`;
    link.addEventListener('click', () => apiJson('/api/open-link', { url }).then((data) => showToast(data.message)).catch((error) => showToast(error.message, true)));
    list.append(link);
  }
  text.append(list);
  scrollChat(stick);
}

function handleClientAction(action) {
  if (action?.type === 'timer') startTimer(action.seconds, action.label);
}

async function sendMessage(textOverride = null) {
  if (sending) return;
  await historyReadyPromise;
  const text = String(textOverride ?? messageInput.value).trim();
  if (!text) return;
  const model = $('#model-select').value;
  if (!model || !modelReady) {
    showToast('The local model is not ready yet. Refresh after the one-time download finishes.', true);
    if (!model) $('#setup-modal').classList.remove('hidden');
    return;
  }
  messageInput.value = '';
  messageInput.style.height = 'auto';
  stopSpeech();
  addMessage('user', text);
  sending = true;
  sendButton.disabled = true;
  setAvatar('thinking', 'A little processing shimmer…');
  setStatus('Loading Capri’s local reply…', 'busy');
  let setStreamText = null;
  try {
    const data = await streamChat({ model, messages: messages.slice(-8), online: onlineEnabled, power_mode: powerEnabled }, (partial) => {
      if (!setStreamText) setStreamText = createStreamingAssistantBubble();
      setStreamText(partial);
      setStatus('Capri is replying…', 'busy');
    });
    if (data.pending_action) {
      if (setStreamText) setStreamText('', true);
      addActionApproval(data.pending_action);
      setAvatar('approval', 'Your call. Nothing happens until you approve it.');
      setStatus('Review Capri’s local action before it runs.', 'busy');
      playCyberSfx('approval');
      if (voiceEnabled) void speak('I have one local action for you to approve.');
      return;
    }
    const reply = (data.reply || '').trim();
    if (!reply) {
      if (setStreamText) setStreamText('', true);
      addNotice('I lost that thought in the static. Try me again?');
      setAvatar('glitch', 'Static on the line.');
      setStatus('The model returned an empty reply.', 'error');
      return;
    }
    if (setStreamText) {
      setStreamText(reply, true);
      messages.push({ role: 'assistant', content: reply });
      if (messages.length > 300) messages = messages.slice(-300);
      saveMessages();
    } else addMessage('assistant', reply);
    handleClientAction(data.client_action);
    addSources(data.sources);
    notifyPet(avatar.dataset.state, reply);
    setStatus(data.tools_used?.length ? `Used local tool: ${data.tools_used.join(', ').replaceAll('_', ' ')}` : 'Reply generated by your local model.');
    if (voiceEnabled) void speak(reply);
    else setAvatar('success', 'There. A thought with the right amount of trouble.');
  } catch (error) {
    addNotice(`Local hiccup: ${error.message}`);
    setAvatar('error', 'The local link threw a spark.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  } finally {
    sending = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

// --- voice output -----------------------------------------------------------------------------
function spokenText(text) {
  return String(text ?? '')
    .replace(/\[[^\]]{1,100}\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/[`*_#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split into sentence-sized pieces. The first piece is short so Capri starts talking quickly;
// later pieces are synthesized while earlier ones play.
function speechChunks(text) {
  const clean = spokenText(text).slice(0, 1100);
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g) || [clean];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    current += sentence;
    if (current.length >= (chunks.length === 0 ? 40 : 200)) {
      chunks.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function setSpeechActive(active) {
  speechActive = active;
  $('#stop-speech').classList.toggle('hidden', !active);
}

function stopSpeech() {
  const wasActive = speechActive;
  setSpeechActive(false);
  speechSequence += 1;
  if (speechAbort) speechAbort.abort();
  speechAbort = null;
  speechAudio.onplaying = null;
  speechAudio.onended = null;
  speechAudio.onerror = null;
  speechAudio.pause();
  speechAudio.currentTime = 0;
  if (speechStopResolver) { const resolve = speechStopResolver; speechStopResolver = null; resolve(); }
  return wasActive;
}

// Optional "digital construct" colour on Capri's voice: a light chorus plus a thin bright band.
function ensureVoiceFx() {
  if (!fxEnabled && !voiceFx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    if (!voiceFx) {
      const context = new AudioContextClass();
      const dry = context.createGain();
      const wet = context.createGain();
      const delay = context.createDelay(0.05);
      delay.delayTime.value = 0.012;
      const lfo = context.createOscillator();
      lfo.frequency.value = 0.9;
      const depth = context.createGain();
      depth.gain.value = 0.003;
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2800;
      band.Q.value = 0.9;
      const bandGain = context.createGain();
      bandGain.gain.value = 0.35;
      // Created last: once an element is routed into Web Audio it only plays through this graph.
      const source = context.createMediaElementSource(speechAudio);
      source.connect(dry).connect(context.destination);
      source.connect(delay).connect(wet);
      source.connect(band).connect(bandGain).connect(wet);
      wet.connect(context.destination);
      voiceFx = { context, dry, wet };
    }
    voiceFx.wet.gain.value = fxEnabled ? 0.4 : 0;
    voiceFx.dry.gain.value = fxEnabled ? 0.85 : 1;
    if (voiceFx.context.state === 'suspended') voiceFx.context.resume().catch(() => {});
  } catch { /* Plain playback still works. */ }
}

function playSpeechBlob(blob, requestId, first) {
  return new Promise((resolve, reject) => {
    const oldUrl = speechAudio.dataset.url;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const url = URL.createObjectURL(blob);
    speechAudio.dataset.url = url;
    speechAudio.src = url;
    speechStopResolver = resolve;
    speechAudio.onplaying = () => {
      if (requestId !== speechSequence) return;
      setAvatar('speaking', 'Speaking through Capri’s local voice.');
      if (first) playCyberSfx('reply');
    };
    speechAudio.onended = () => { speechStopResolver = null; resolve(); };
    speechAudio.onerror = () => { speechStopResolver = null; reject(new Error('The offline voice clip could not play.')); };
    ensureVoiceFx();
    speechAudio.play().catch((error) => { speechStopResolver = null; reject(error); });
  });
}

async function speak(text, forcePreview = false, onReady = null) {
  let revealed = false;
  const reveal = () => { if (!revealed) { revealed = true; if (onReady) onReady(); } };
  if (!voiceEnabled && !forcePreview) { reveal(); return; }
  const chunks = speechChunks(text);
  if (!chunks.length) { reveal(); return; }
  stopSpeech();
  const requestId = speechSequence;
  const controller = new AbortController();
  speechAbort = controller;
  setSpeechActive(true);
  const voice = $('#voice-select').value || selectedVoice;
  const fetchChunk = async (chunk) => {
    const response = await localFetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk, voice }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Offline speech output is not ready.');
    }
    return response.blob();
  };
  try {
    setAvatar('thinking', 'Tuning the offline voice…');
    let pending = fetchChunk(chunks[0]);
    for (let index = 0; index < chunks.length; index += 1) {
      const blob = await pending;
      if (requestId !== speechSequence) { reveal(); return; }
      pending = index + 1 < chunks.length ? fetchChunk(chunks[index + 1]) : null;
      pending?.catch(() => {}); // awaited on the next loop; this only silences an early rejection
      reveal();
      await playSpeechBlob(blob, requestId, index === 0);
      if (requestId !== speechSequence) return;
    }
    setSpeechActive(false);
    playCyberSfx('end');
    setAvatar('success', 'That one came through clean.');
  } catch (error) {
    reveal();
    if (error.name === 'AbortError' || requestId !== speechSequence) return;
    setSpeechActive(false);
    setAvatar('idle', 'Voice is on, but local speech needs setup.');
    playCyberSfx('glitch');
    showToast(error.message, true);
  }
}

// --- voice input ------------------------------------------------------------------------------
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clipped < 0 ? clipped * 32768 : clipped * 32767, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function resample(input, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let total = 0;
    for (let j = start; j < end; j++) total += input[j];
    output[i] = total / Math.max(1, end - start);
  }
  return output;
}

function resetMicButton() {
  $('#mic-button').classList.remove('recording');
  $('#mic-label').textContent = 'VOICE';
}

async function releaseMicrophone() {
  if (processor) processor.disconnect();
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  if (audioContext) await audioContext.close().catch(() => {});
  micStream = null; audioContext = null; processor = null;
}

async function startRecording() {
  stopSpeech();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not provide local microphone capture.');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(micStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silence = audioContext.createGain();
  silence.gain.value = 0;
  micBuffers = [];
  processor.onaudioprocess = (event) => {
    micBuffers.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    event.outputBuffer.getChannelData(0).fill(0);
  };
  source.connect(processor);
  processor.connect(silence);
  silence.connect(audioContext.destination);
  recording = true;
  $('#mic-button').classList.add('recording');
  $('#mic-label').textContent = 'SEND';
  setAvatar('listening', 'Go on. I’m listening locally.');
  setStatus('Recording on this PC. Click again to send the transcript.', 'busy');
  maxRecordTimer = setTimeout(stopRecordingAndSend, 25000);
}

async function stopRecordingAndSend() {
  if (!recording) return;
  recording = false;
  clearTimeout(maxRecordTimer);
  resetMicButton();
  const sampleRate = audioContext.sampleRate;
  await releaseMicrophone();
  let length = 0;
  for (const buffer of micBuffers) length += buffer.length;
  const combined = new Float32Array(length);
  let offset = 0;
  for (const buffer of micBuffers) { combined.set(buffer, offset); offset += buffer.length; }
  micBuffers = [];
  const wav = encodeWav(resample(combined, sampleRate, 16000), 16000);
  setAvatar('thinking', 'Turning your voice into local text…');
  setStatus('Transcribing on this PC…', 'busy');
  try {
    const response = await localFetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Offline transcription failed.');
    if (!data.text) { setAvatar('idle', 'I didn’t catch that. Give it another go?'); setStatus('No words were recognized. Try speaking a little closer to the microphone.'); return; }
    setAvatar('idle', 'Got it. Let me think.');
    await sendMessage(data.text);
  } catch (error) {
    setAvatar('error', 'My local mic link needs a quick fix.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

async function toggleRecording() {
  if (sending) return;
  try {
    if (recording) await stopRecordingAndSend();
    else await startRecording();
  } catch (error) {
    recording = false;
    clearTimeout(maxRecordTimer);
    await releaseMicrophone(); // never leave the microphone open after a failed start
    resetMicButton();
    setAvatar('error', 'I can’t reach the microphone yet.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

async function discardRecording() {
  if (!recording) return;
  recording = false;
  clearTimeout(maxRecordTimer);
  resetMicButton();
  await releaseMicrophone();
  micBuffers = [];
}

// --- quick ops, memory, timers, HUD -----------------------------------------------------------
async function checkSecurity() {
  setAvatar('thinking', 'Checking the local security dashboard.');
  setStatus('Reading Defender and firewall status…', 'busy');
  try {
    const data = await apiJson('/api/security', {});
    const formatted = data.ok ? `Windows security status (read-only):\n${JSON.stringify(data.details, null, 2)}` : `Windows could not report security status: ${data.message}`;
    addNotice(formatted, UNSAVED_RESULT_TOOLS.check_windows_security);
    setAvatar('idle', 'Just the facts from Windows.');
    setStatus(data.ok ? 'Read-only Windows security status received.' : 'Security status is unavailable.', data.ok ? '' : 'error');
  } catch (error) {
    setAvatar('error', 'The security dashboard did not answer.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

function updateMemoryMeter() {
  const text = $('#memory-input').value;
  const lines = text.split('\n').filter((line) => line.trim());
  let used = 0;
  let fitting = 0;
  for (const line of [...lines].reverse()) {
    if (used + line.length + 1 > memoryPromptChars) break;
    used += line.length + 1;
    fitting += 1;
  }
  $('#memory-count').textContent = `${text.length.toLocaleString()} / 15,000 characters`;
  const fit = $('#memory-fit');
  fit.textContent = lines.length && fitting < lines.length ? `Capri reads the newest ${fitting} of ${lines.length} notes` : (lines.length ? 'All notes fit in Capri’s prompt' : '');
  fit.classList.toggle('over', fitting < lines.length);
}

function disarmMemoryClear() {
  clearTimeout(memoryClearArmed);
  memoryClearArmed = null;
  const button = $('#memory-clear');
  button.textContent = 'CLEAR MEMORY';
  button.classList.remove('armed');
}

async function openMemory() {
  try {
    const data = await apiJson('/api/memory');
    memoryPromptChars = data.prompt_chars || memoryPromptChars;
    $('#memory-input').value = data.content || '';
    disarmMemoryClear();
    updateMemoryMeter();
    $('#memory-modal').classList.remove('hidden');
    $('#memory-input').focus();
  } catch (error) { showToast(error.message, true); }
}

async function saveMemory(content) {
  try {
    await apiJson('/api/memory', { content });
    $('#memory-modal').classList.add('hidden');
    showToast(content.trim() ? 'Local memory saved and encrypted.' : 'Local memory cleared.');
  } catch (error) { showToast(error.message, true); }
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

function renderTimers() {
  const list = $('#timers');
  list.classList.toggle('hidden', timers.size === 0);
  list.replaceChildren(...[...timers.entries()].map(([id, timer]) => {
    const row = document.createElement('div');
    row.className = `timer${timer.done ? ' done' : ''}`;
    const label = document.createElement('span');
    label.textContent = timer.label.toUpperCase();
    const time = document.createElement('span');
    time.className = 'timer-time';
    time.textContent = timer.done ? 'DONE' : formatDuration((timer.endsAt - Date.now()) / 1000);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.title = timer.done ? 'Dismiss' : 'Cancel timer';
    cancel.textContent = '×';
    cancel.addEventListener('click', () => { timers.delete(id); renderTimers(); });
    row.append(label, time, cancel);
    return row;
  }));
}

function startTimer(seconds, label) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return;
  const id = `${Date.now()}-${Math.random()}`;
  timers.set(id, { label: String(label || 'Timer').slice(0, 60), endsAt: Date.now() + total * 1000, done: false });
  renderTimers();
}

setInterval(() => {
  let changed = false;
  for (const [id, timer] of timers) {
    if (timer.done) continue;
    changed = true;
    if (Date.now() >= timer.endsAt) {
      timer.done = true;
      playCyberSfx('alarm');
      showToast(`Timer done: ${timer.label}`);
      addNotice(`Timer done: ${timer.label}.`, 'CAPRI · TIMER');
      setAvatar('waking', `Ding. Your ${timer.label} timer is up.`);
      if (voiceEnabled) void speak(`Hey, choom. Your ${timer.label} timer is up.`);
      setTimeout(() => { timers.delete(id); renderTimers(); }, 15000);
    }
  }
  if (changed) renderTimers();
}, 1000);

function setMeter(id, percent, label, invert = false) {
  const element = $(id);
  if (!element) return;
  const known = Number.isFinite(percent);
  const value = known ? Math.max(0, Math.min(100, percent)) : 0;
  element.querySelector('i').style.width = `${value}%`;
  element.querySelector('.hud-value').textContent = label;
  const level = invert ? 100 - value : value;
  element.classList.toggle('warn', known && level >= 75 && level < 90);
  element.classList.toggle('hot', known && level >= 90);
}

async function refreshStats() {
  if (document.hidden || !sessionToken) return;
  try {
    const stats = await apiJson('/api/stats');
    setMeter('#hud-cpu', stats.cpu_percent, Number.isFinite(stats.cpu_percent) ? `${Math.round(stats.cpu_percent)}%` : '--');
    setMeter('#hud-ram', stats.memory_percent, Number.isFinite(stats.memory_used_gb) ? `${stats.memory_used_gb}/${stats.memory_total_gb}G` : '--');
    const diskUsed = stats.disk_total_gb ? 100 * (1 - stats.disk_free_gb / stats.disk_total_gb) : NaN;
    setMeter('#hud-disk', diskUsed, Number.isFinite(stats.disk_free_gb) ? `${Math.round(stats.disk_free_gb)}G` : '--');
    if (Number.isFinite(stats.battery_percent)) setMeter('#hud-bat', stats.battery_percent, `${stats.battery_percent}%${stats.on_ac_power ? '+' : ''}`, true);
    else setMeter('#hud-bat', 100, 'AC', true);
  } catch { /* the HUD is decorative; chat errors are reported elsewhere */ }
}

// --- wiring -----------------------------------------------------------------------------------
$('#send-button').addEventListener('click', () => sendMessage());
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
messageInput.addEventListener('input', () => { messageInput.style.height = 'auto'; messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`; });
$('#mic-button').addEventListener('click', toggleRecording);
$('#refresh-models').addEventListener('click', () => refreshModels());
$('#security-check').addEventListener('click', checkSecurity);
$('#setup-open').addEventListener('click', () => $('#setup-modal').classList.remove('hidden'));
$('#memory-open').addEventListener('click', openMemory);
$('#memory-input').addEventListener('input', updateMemoryMeter);
$('#memory-save').addEventListener('click', () => saveMemory($('#memory-input').value));
$('#memory-clear').addEventListener('click', () => {
  if (!memoryClearArmed) {
    const button = $('#memory-clear');
    button.textContent = 'CLICK AGAIN TO ERASE';
    button.classList.add('armed');
    memoryClearArmed = setTimeout(disarmMemoryClear, 4000);
    return;
  }
  disarmMemoryClear();
  saveMemory('');
});
$('#avatar-select').addEventListener('click', () => $('#avatar-file').click());
$('#avatar-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) saveAvatarFile(file);
  event.target.value = '';
});
$('#avatar-reset').addEventListener('click', () => {
  apiJson('/api/avatar', { reset: true }).then(() => {
    if (avatarUrl) { URL.revokeObjectURL(avatarUrl); avatarUrl = null; }
    showOriginalAvatar();
    showToast('Capri’s animated avatar restored.');
  }).catch((error) => showToast(error.message, true));
});
document.querySelectorAll('[data-media-action]').forEach((button) => button.addEventListener('click', () => sendMediaAction(button.dataset.mediaAction)));
$('#voice-toggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  store.set('capri.voiceEnabled', String(voiceEnabled));
  updateToggle('#voice-toggle', voiceEnabled);
  if (!voiceEnabled) { stopSpeech(); setAvatar('idle', 'Voice output is off. I’ll stay quiet unless you turn it back on.'); }
  else showToast('Local spoken replies are on.');
});
$('#fx-toggle').addEventListener('click', () => {
  fxEnabled = !fxEnabled;
  store.set('capri.voiceFx', String(fxEnabled));
  updateToggle('#fx-toggle', fxEnabled);
  if (voiceFx) ensureVoiceFx();
  showToast(fxEnabled ? 'Construct voice filter on.' : 'Construct voice filter off.');
});
$('#sfx-toggle').addEventListener('click', () => {
  sfxEnabled = !sfxEnabled;
  store.set('capri.sfxEnabled', String(sfxEnabled));
  updateToggle('#sfx-toggle', sfxEnabled);
  if (sfxEnabled) { playCyberSfx('scan'); showToast('Local Capri sound effects are on.'); }
  else showToast('Local sound effects are off.');
});
$('#voice-select').addEventListener('change', () => {
  selectedVoice = $('#voice-select').value;
  store.set('capri.voice', selectedVoice);
});
$('#voice-preview').addEventListener('click', () => speak('Hey, choom. You made it back. What trouble are we getting into tonight?', true));
$('#clear-chat').addEventListener('click', () => {
  const button = $('#clear-chat');
  if (!messages.length) return;
  if (!clearArmedTimer) {
    button.textContent = 'CLICK AGAIN TO ERASE';
    button.classList.add('armed');
    clearArmedTimer = setTimeout(() => { clearArmedTimer = null; button.textContent = 'CLEAR CHAT'; button.classList.remove('armed'); }, 4000);
    return;
  }
  clearTimeout(clearArmedTimer);
  clearArmedTimer = null;
  button.textContent = 'CLEAR CHAT';
  button.classList.remove('armed');
  messages = [];
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  apiJson('/api/history', { messages: [] }).catch((error) => showToast(`Chat history could not be cleared: ${error.message}`, true));
  renderMessages();
  setStatus('Chat history was cleared from this PC.');
});
$('#model-select').addEventListener('change', () => store.set('capri.model', $('#model-select').value));
$('#exit-button').addEventListener('click', async () => {
  if (recording) await discardRecording();
  stopSpeech();
  await flushHistory(); // a reply that just arrived must reach the archive before the server stops
  try { await apiJson('/api/exit', { model: $('#model-select').value }); } catch { /* The local server may already be stopping. */ }
  window.close();
  setStatus('Capri has closed. You can close this window now.');
});
window.addEventListener('pagehide', () => {
  if (!historySaveTimer) return;
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  localFetch('/api/history', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.slice(-300) }) }).catch(() => {});
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).classList.add('hidden')));
document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); }));

$('#stop-speech').addEventListener('click', () => { stopSpeech(); setAvatar('idle', 'Okay, quiet.'); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const openModal = document.querySelector('.modal-backdrop:not(.hidden)');
  if (openModal) { openModal.classList.add('hidden'); return; }
  if (recording) { discardRecording().then(() => { setAvatar('idle', 'Recording discarded.'); setStatus('Recording discarded. Nothing was sent.'); }); return; }
  if (stopSpeech()) setAvatar('idle', 'Okay, quiet.');
});

async function refreshNowPlaying() {
  if (document.hidden || !sessionToken) return;
  try {
    const data = await apiJson('/api/now-playing');
    const label = $('#now-playing');
    label.classList.toggle('hidden', !data.available);
    label.textContent = data.playing ? `${data.title} — ${data.artist}` : 'Spotify paused';
  } catch { /* optional */ }
}

$('#roam-toggle').addEventListener('click', async () => {
  try {
    const data = await apiJson('/api/pet', { visible: !petVisible });
    petVisible = data.visible;
    updateToggle('#roam-toggle', petVisible);
    showToast(petVisible ? 'Capri is loose on your desktop. Double-click her to come back here.' : 'Capri is back in the chat window.');
  } catch (error) { showToast(error.message, true); }
});
$('#online-toggle').addEventListener('click', () => {
  onlineEnabled = !onlineEnabled;
  store.set('capri.online', String(onlineEnabled));
  updateToggle('#online-toggle', onlineEnabled);
  showToast(onlineEnabled ? 'Online: Capri can search the web. Your search words go to the search engine.' : 'Offline: nothing leaves this PC.');
});
$('#power-toggle').addEventListener('click', () => {
  const button = $('#power-toggle');
  if (powerEnabled) {
    powerEnabled = false;
    updateToggle('#power-toggle', false);
    showToast('Power mode off: back to the read-only command list.');
    return;
  }
  if (!powerArmTimer) {
    button.classList.add('armed');
    button.textContent = 'SURE?';
    showToast('Power mode lets Capri propose any normal-user command. Click again to enable it for this session.', true);
    powerArmTimer = setTimeout(() => { powerArmTimer = null; button.classList.remove('armed'); button.textContent = 'POWER'; }, 4000);
    return;
  }
  clearTimeout(powerArmTimer);
  powerArmTimer = null;
  button.classList.remove('armed');
  button.textContent = 'POWER';
  powerEnabled = true;
  updateToggle('#power-toggle', true);
  showToast('Power mode on for this session. You still approve every command.');
});

const cityLines = [
  'Your signal stays on this PC. Desktop actions wait for your approval.',
  'Chat and memory are encrypted on disk. No silent learning, choom.',
  'No outside feed on this channel. Just your projects and a little static.',
  'One action at a time. You say yes; I make the move.',
  'Only this window holds the launch key. Other programs get a locked door.',
];
let cityLineIndex = 0;
function updateCityPulse() {
  const clock = $('#local-clock');
  if (clock) clock.textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date());
  if (!document.hidden) {
    cityLineIndex = (cityLineIndex + 1) % cityLines.length;
    const line = $('#city-ticker-copy');
    if (line) {
      line.classList.add('switching');
      setTimeout(() => { line.textContent = cityLines[cityLineIndex]; line.classList.remove('switching'); }, 180);
    }
  }
}

updateToggle('#voice-toggle', voiceEnabled);
updateToggle('#fx-toggle', fxEnabled);
updateToggle('#sfx-toggle', sfxEnabled);
updateToggle('#online-toggle', onlineEnabled);
updateToggle('#power-toggle', false);
updateCityPulse();
setInterval(updateCityPulse, 20000);
if (!sessionToken) {
  $('#lock-screen').classList.remove('hidden');
  setStatus('Locked: open Capri from her desktop icon.', 'error');
} else {
  apiJson('/api/avatar-status').then((data) => { if (data.available) showSavedAvatar(); else showOriginalAvatar(); }).catch(() => {});
  historyReadyPromise = restoreHistory();
  refreshModels();
  refreshStats();
  setInterval(() => { if (!document.hidden) refreshModels({ quiet: true }); }, 30000);
  setInterval(refreshStats, 4000);
  refreshNowPlaying();
  setInterval(refreshNowPlaying, 6000);
}
