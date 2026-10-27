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
const messagesKey = 'capri.messages.v1';

let messages = loadMessages();
let sending = false;
let modelReady = false;
let historyReadyPromise = Promise.resolve();
let historySaveTimer = null;
let recording = false;
let voiceEnabled = localStorage.getItem('capri.voiceEnabled') !== 'false';
const savedVoice = localStorage.getItem('capri.voice');
let selectedVoice = !savedVoice || savedVoice === 'af_bella' ? 'af_sky' : savedVoice;
let sfxEnabled = localStorage.getItem('capri.sfxEnabled') !== 'false';
let micStream = null;
let audioContext = null;
let effectsAudioContext = null;
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
let clearArmedTimer = null;
let pointerFrame = 0;
let pointerPosition = null;
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

function loadMessages() {
  try {
    const stored = JSON.parse(localStorage.getItem(messagesKey) || '[]');
    return Array.isArray(stored) ? stored.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-300) : [];
  } catch { return []; }
}

function saveMessages() {
  try { localStorage.setItem(messagesKey, JSON.stringify(messages.slice(-300))); } catch { /* The local server archive remains available. */ }
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    apiJson('/api/history', { messages: messages.slice(-300) }).catch((error) => {
      setStatus(`Local chat history could not be saved: ${error.message}`, 'error');
    });
  }, 350);
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

function setAvatar(state, copy) {
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
    const frequencies = kind === 'glitch' ? [190, 120] : kind === 'scan' ? [440, 660] : kind === 'end' ? [520] : [740, 980];
    const now = effectsAudioContext.currentTime;
    frequencies.forEach((frequency, index) => {
      const start = now + index * 0.055;
      const oscillator = effectsAudioContext.createOscillator();
      const gain = effectsAudioContext.createGain();
      const filter = effectsAudioContext.createBiquadFilter();
      oscillator.type = kind === 'glitch' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === 'reply') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, start + 0.12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'glitch' ? 0.045 : 0.028, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      oscillator.connect(filter).connect(gain).connect(effectsAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch { /* Effects are optional when audio hardware is unavailable. */ }
}

function showSavedAvatar() {
  avatarPhoto.src = '/api/avatar';
  avatarPhoto.hidden = false;
  capriSprite.hidden = true;
  avatar.classList.add('has-custom-image');
  avatar.classList.remove('has-sprite');
  $('#avatar-reset').classList.remove('hidden');
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

function animateCapriSprite() {
  if (!spritesReady || capriSprite.hidden || document.hidden) return;
  const now = performance.now();
  const state = avatar.dataset.state;
  const stateClips = { thinking: 'grin', success: 'grin', error: 'glitch', glitch: 'glitch', sleeping: 'sleep', waking: 'wake' };
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

setInterval(animateCapriSprite, 1000 / 12);
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
    const response = await fetch('/api/avatar', { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'I could not save that avatar image.');
    showSavedAvatar();
    showToast('Avatar image saved on this PC.');
  } catch (error) {
    showToast(error.message || 'I could not load that image.', true);
  }
}

async function sendMediaAction(action) {
  try {
    const data = await apiJson('/api/media', { action });
    setStatus('Media key sent to the active Windows player.');
    showToast(data.message || 'Media key sent to the active Windows player.');
  } catch (error) {
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
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

function addMessage(role, content, save = true) {
  const clean = String(content ?? '').trim();
  if (!clean) return;
  messages.push({ role, content: clean });
  if (messages.length > 300) messages = messages.slice(-300);
  buildMessage(role).text.textContent = clean;
  chatLog.scrollTop = chatLog.scrollHeight;
  if (save) saveMessages();
}

// Errors and system notices are shown in the log but are NOT added to `messages`, so they are never
// saved to the archive or sent back to the model as if Capri had said them.
function addNotice(content) {
  const { wrapper, text } = buildMessage('assistant', 'CAPRI · SYSTEM');
  wrapper.classList.add('notice');
  text.textContent = String(content ?? '').trim();
  chatLog.scrollTop = chatLog.scrollHeight;
}

function createStreamingAssistantBubble() {
  const { text } = buildMessage('assistant');
  return (content) => {
    text.textContent = content;
    chatLog.scrollTop = chatLog.scrollHeight;
  };
}

function describeAction(action) {
  const args = action.arguments || {};
  const mediaLabels = { play_pause: 'Play or pause the active player', next: 'Skip to the next track', previous: 'Go to the previous track', replay: 'Send the replay/previous key to the active player' };
  const folderLabels = { documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop', capri_notes: 'Capri Notes' };
  switch (action.name) {
    case 'open_app': return `Open ${String(args.app || 'an app').replaceAll('_', ' ')}.`;
    case 'control_media': return mediaLabels[args.action] || 'Control the active media player.';
    case 'open_personal_folder': return `Open your ${folderLabels[args.folder] || 'personal'} folder.`;
    case 'check_windows_security': return 'Read the current Windows Defender and firewall status.';
    case 'see_screen': return 'Capture one image of your primary screen and send it to Capri’s local vision model. The screenshot is temporary and will not be saved.';
    case 'list_local_files': {
      const folders = { documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop' };
      const folder = folders[args.folder] || 'selected folder';
      const subfolder = String(args.path || '').slice(0, 240);
      return `List up to 60 visible names in ${folder}${subfolder ? `\\${subfolder}` : ''}. This is non-recursive; hidden and sensitive-looking entries are skipped. The listing will not be saved to chat history.`;
    }
    case 'read_local_file': {
      const folders = { documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop' };
      const folder = folders[args.folder] || 'selected folder';
      return `Read up to 4,000 characters from ${folder}\\${String(args.path || '').slice(0, 260)} and send a bounded excerpt to the local model for this reply only. The excerpt will not be saved to chat history.`;
    }
    case 'run_command': {
      const folders = { home: 'Home', documents: 'Documents', downloads: 'Downloads', desktop: 'Desktop', app: 'Capri app folder' };
      return `Run this read-only Windows command once in ${folders[args.directory] || 'Home'}:\n${String(args.command || '').slice(0, 1200)}`;
    }
    case 'save_note': return `Save a note on this PC.\n${String(args.title || 'Note').slice(0, 100)}\n${String(args.content || '').slice(0, 500)}`;
    case 'remember_user_detail': return `Add this to Capri’s private local memory?\n${String(args.content || '').slice(0, 300)}`;
    default: return 'Run one bounded local action.';
  }
}

function addActionApproval(action) {
  const card = document.createElement('section');
  card.className = 'action-approval';
  card.setAttribute('aria-label', 'Local action approval');
  const heading = document.createElement('div');
  heading.className = 'approval-heading';
  heading.textContent = 'LOCAL ACTION · YOUR CALL';
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
  chatLog.scrollTop = chatLog.scrollHeight;

  allow.addEventListener('click', async () => {
    allow.disabled = true;
    deny.disabled = true;
    status.textContent = 'Waiting for your approved local action…';
    try {
      const result = await apiJson('/api/execute-tool', { approval_id: action.approval_id });
      if (action.name === 'list_local_files') {
        controls.remove();
        status.textContent = 'Approved · names were read locally and not saved to chat history.';
        const { wrapper, text } = buildMessage('assistant', 'CAPRI · FILE LIST · NOT SAVED');
        wrapper.classList.add('notice');
        text.textContent = result.message || 'No visible entries were found.';
        chatLog.scrollTop = chatLog.scrollHeight;
        setAvatar('success', 'Local file names are ready.');
        setStatus('Approved local file listing. The result was not saved.');
        return;
      }
      if (action.name === 'read_local_file') {
        controls.remove();
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
          answerBubble(reply);
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
        controls.remove();
        status.textContent = 'Approved · reviewing this one screenshot locally. The image will not be saved.';
        setAvatar('thinking', 'Looking at one approved screen capture…');
        setStatus('Screen capture approved. Analyzing locally; image is not saved.', 'busy');
        playCyberSfx('scan');
        const vision = await apiJson('/api/chat', {
          model: $('#model-select').value,
          messages: messages.slice(-8),
          screen_image: result.image,
        });
        const reply = (vision.reply || '').trim() || 'The screenshot came through, but I could not read enough to answer.';
        const reveal = () => addMessage('assistant', reply);
        if (voiceEnabled) await speak(reply, false, reveal);
        else { reveal(); setAvatar('success', 'Screen review complete.'); }
        status.textContent = 'Screen review complete · temporary image discarded.';
        setStatus('Local screen review complete. The image was not saved.');
        return;
      }
      status.textContent = `APPROVED · ${result.message || 'Action completed.'}`;
      controls.remove();
      addMessage('assistant', result.message || 'Done.');
      setAvatar('success', 'Done. Your call, your controls.');
      playCyberSfx('scan');
      setStatus(`Approved local action: ${action.name.replaceAll('_', ' ')}.`);
      if (voiceEnabled) speak(`Done. ${String(result.message || '').slice(0, 240)}`);
    } catch (error) {
      status.textContent = `That action did not run: ${error.message}`;
      allow.disabled = false;
      deny.disabled = false;
      setStatus(error.message, 'error');
      showToast(error.message, true);
    }
  });
  deny.addEventListener('click', () => {
    allow.disabled = true;
    deny.disabled = true;
    controls.remove();
    status.textContent = 'SKIPPED · No action was taken.';
    addMessage('assistant', 'Left that one alone. Nothing changed.');
    setAvatar('idle', 'Your desktop, your rules.');
    setStatus('Local action skipped.');
  });
}

function showWelcome() {
  if (messages.length) return;
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = '<div class="welcome-mark">✳</div><h3>Well, well. A new line to the outside.</h3><p>Ask me about a project, game, or playlist. Say “remember I like…” to save a hobby or preference locally. I’ll show you every desktop action before it runs.</p>';
  chatLog.append(welcome);
}

function renderMessages() {
  chatLog.replaceChildren();
  if (!messages.length) { showWelcome(); return; }
  for (const message of messages) addMessage(message.role, message.content, false);
}

async function apiJson(path, payload) {
  const response = await fetch(path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Local app error (${response.status}).`);
  return data;
}

async function streamChat(payload, onToken) {
  const response = await fetch('/api/chat', {
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
    if (data.available) {
      messages = Array.isArray(data.messages) ? data.messages.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-300) : [];
      try { localStorage.setItem(messagesKey, JSON.stringify(messages)); } catch { /* Server history is the durable copy. */ }
      renderMessages();
    } else if (messages.length) {
      await apiJson('/api/history', { messages: messages.slice(-300) });
    }
  } catch (error) {
    setStatus(`Local chat archive unavailable: ${error.message}`, 'error');
  }
}

function updateVoiceButton() {
  const button = $('#voice-toggle');
  button.textContent = voiceEnabled ? 'VOICE ON' : 'VOICE OFF';
  button.classList.toggle('on', voiceEnabled);
  button.setAttribute('aria-pressed', String(voiceEnabled));
}

function updateSfxButton() {
  const button = $('#sfx-toggle');
  button.textContent = sfxEnabled ? 'SFX ON' : 'SFX OFF';
  button.classList.toggle('on', sfxEnabled);
  button.setAttribute('aria-pressed', String(sfxEnabled));
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
  return sending || recording || ['thinking', 'speaking', 'listening'].includes(avatar.dataset.state);
}

// `quiet` is used by the 30-second background check. It keeps the indicators current but does not
// overwrite the avatar or status line unless the model actually became ready or unavailable.
async function refreshModels({ quiet = false } = {}) {
  const wasReady = modelReady;
  if (!quiet) $('#connection-foot').textContent = 'CHECKING LOCAL LINK…';
  try {
    const data = await apiJson('/api/health');
    const voiceSelect = $('#voice-select');
    const availableVoices = data.voices && typeof data.voices === 'object' ? data.voices : {};
    syncOptions(voiceSelect, Object.entries(availableVoices));
    selectedVoice = Object.prototype.hasOwnProperty.call(availableVoices, selectedVoice)
      ? selectedVoice
      : (data.default_voice || 'af_sky');
    voiceSelect.value = selectedVoice;
    voiceSelect.disabled = !data.voice_ready;
    $('#voice-preview').disabled = !data.voice_ready;
    localStorage.setItem('capri.voice', selectedVoice);
    const select = $('#model-select');
    let previous = select.value || localStorage.getItem('capri.model') || data.default_model;
    if (previous === 'qwen3:8b' && (data.models || []).includes(data.default_model)) previous = data.default_model;
    const availableModels = Array.isArray(data.models) ? data.models : [];
    const ready = Boolean(data.ollama && availableModels.length > 0);
    modelReady = ready;
    if (availableModels.length) {
      syncOptions(select, availableModels.map((model) => [model, model]));
      if (!availableModels.includes(previous)) previous = availableModels.includes(data.default_model) ? data.default_model : availableModels[0];
      select.value = previous;
    } else {
      syncOptions(select, [[data.default_model, `${data.default_model} · ${data.ollama ? 'not ready yet' : 'setup needed'}`]]);
      select.value = data.default_model;
    }
    $('#status-dot').className = `online-dot ${ready ? 'ready' : 'error'}`;
    $('#status-label').textContent = ready ? 'LOCAL MODEL READY' : (data.ollama ? 'MODEL DOWNLOAD NEEDED' : 'LOCAL MODEL NOT RUNNING');
    $('#connection-foot').textContent = ready ? 'CONNECTED TO THIS PC' : (data.ollama ? 'WAITING FOR A LOCAL MODEL' : 'OPEN SETUP GUIDE');
    localStorage.setItem('capri.model', select.value || data.default_model);
    if ((quiet && ready === wasReady) || isBusy()) return;
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
    const data = await streamChat({ model, messages: messages.slice(-4) }, (partial) => {
      if (!setStreamText) setStreamText = createStreamingAssistantBubble();
      setStreamText(partial);
      setStatus('Capri is replying…', 'busy');
    });
    const reply = (data.reply || '').trim() || 'I lost that thought in the static. Try me again?';
    if (data.pending_action) {
      addMessage('assistant', reply);
      addActionApproval(data.pending_action);
      setAvatar('idle', 'Your call. Nothing happens until you approve it.');
      setStatus('Review Capri’s local action before it runs.', 'busy');
      if (voiceEnabled) void speak('I have one local action for you to approve.');
    } else {
      if (setStreamText) {
        setStreamText(reply);
        messages.push({ role: 'assistant', content: reply });
        if (messages.length > 300) messages = messages.slice(-300);
        saveMessages();
      } else addMessage('assistant', reply);
      setStatus(data.tools_used?.length ? `Used local tool: ${data.tools_used.join(', ')}` : 'Reply generated by your local model.');
      if (voiceEnabled) void speak(reply);
      else setAvatar('success', 'There. A thought with the right amount of trouble.');
    }
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

function spokenText(text) {
  return String(text ?? '')
    .replace(/\[[^\]]{1,100}\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/[`*_#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  return wasActive;
}

async function speak(text, forcePreview = false, onReady = null) {
  let revealed = false;
  const reveal = () => { if (!revealed) { revealed = true; if (onReady) onReady(); } };
  if (!voiceEnabled && !forcePreview) { reveal(); return; }
  const clean = spokenText(text).slice(0, 1100);
  if (!clean) { reveal(); return; }
  stopSpeech();
  const requestId = speechSequence;
  const controller = new AbortController();
  speechAbort = controller;
  setSpeechActive(true);
  try {
    setAvatar('thinking', 'Finding the right words for the offline voice…');
    const response = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, voice: $('#voice-select').value || selectedVoice }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Offline speech output is not ready.');
    }
    const blob = await response.blob();
    if (requestId !== speechSequence) { reveal(); return; }
    const oldUrl = speechAudio.dataset.url;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const url = URL.createObjectURL(blob);
    speechAudio.dataset.url = url;
    speechAudio.src = url;
    speechAudio.onplaying = () => {
      if (requestId !== speechSequence) return;
      setAvatar('speaking', 'Speaking through Capri’s local voice.');
      playCyberSfx('reply');
    };
    speechAudio.onended = () => {
      if (requestId !== speechSequence) return;
      setSpeechActive(false);
      playCyberSfx('end');
      setAvatar('success', 'That one came through clean.');
    };
    reveal();
    await speechAudio.play();
  } catch (error) {
    reveal();
    if (error.name === 'AbortError') return;
    if (requestId === speechSequence) setSpeechActive(false);
    setAvatar('idle', 'Voice is on, but local speech needs setup.');
    playCyberSfx('glitch');
    showToast(error.message, true);
  }
}

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
  $('#mic-label').textContent = 'STOP & SEND';
  setAvatar('listening', 'Go on. I’m listening locally.');
  setStatus('Recording on this PC. Click again to send the transcript.', 'busy');
  maxRecordTimer = setTimeout(stopRecordingAndSend, 25000);
}

async function stopRecordingAndSend() {
  if (!recording) return;
  recording = false;
  clearTimeout(maxRecordTimer);
  $('#mic-button').classList.remove('recording');
  $('#mic-label').textContent = 'VOICE CHAT';
  const sampleRate = audioContext.sampleRate;
  processor.disconnect();
  micStream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  micStream = null; audioContext = null; processor = null;
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
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
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
    $('#mic-button').classList.remove('recording');
    $('#mic-label').textContent = 'VOICE CHAT';
    setAvatar('error', 'I can’t reach the microphone yet.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

async function discardRecording() {
  if (!recording) return;
  recording = false;
  clearTimeout(maxRecordTimer);
  $('#mic-button').classList.remove('recording');
  $('#mic-label').textContent = 'VOICE CHAT';
  if (processor) processor.disconnect();
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
  if (audioContext) await audioContext.close();
  micStream = null; audioContext = null; processor = null; micBuffers = [];
}

async function checkSecurity() {
  setAvatar('thinking', 'Checking the local security dashboard.');
  setStatus('Reading Defender and firewall status…', 'busy');
  try {
    const data = await apiJson('/api/security', {});
    const formatted = data.ok ? `Windows security status (read-only):\n${JSON.stringify(data.details, null, 2)}` : `Windows could not report security status: ${data.message}`;
    addMessage('assistant', formatted);
    setAvatar('idle', 'Just the facts from Windows.');
    setStatus(data.ok ? 'Read-only Windows security status received.' : 'Security status is unavailable.', data.ok ? '' : 'error');
  } catch (error) {
    setAvatar('error', 'The security dashboard did not answer.');
    setStatus(error.message, 'error');
    showToast(error.message, true);
  }
}

async function openMemory() {
  try {
    const data = await apiJson('/api/memory');
    $('#memory-input').value = data.content || '';
    $('#memory-modal').classList.remove('hidden');
    $('#memory-input').focus();
  } catch (error) { showToast(error.message, true); }
}

async function saveMemory(content) {
  try {
    await apiJson('/api/memory', { content });
    $('#memory-modal').classList.add('hidden');
    showToast(content.trim() ? 'Local memory saved.' : 'Local memory cleared.');
  } catch (error) { showToast(error.message, true); }
}

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
$('#memory-save').addEventListener('click', () => saveMemory($('#memory-input').value));
$('#memory-clear').addEventListener('click', () => saveMemory(''));
$('#avatar-select').addEventListener('click', () => $('#avatar-file').click());
$('#avatar-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) saveAvatarFile(file);
  event.target.value = '';
});
$('#avatar-reset').addEventListener('click', () => {
  apiJson('/api/avatar', { reset: true }).then(() => {
    showOriginalAvatar();
    showToast('Capri’s animated avatar restored.');
  }).catch((error) => showToast(error.message, true));
});
document.querySelectorAll('[data-media-action]').forEach((button) => button.addEventListener('click', () => sendMediaAction(button.dataset.mediaAction)));
$('#voice-toggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('capri.voiceEnabled', String(voiceEnabled));
  updateVoiceButton();
  if (!voiceEnabled) { stopSpeech(); setAvatar('idle', 'Voice output is off. I’ll stay quiet unless you turn it back on.'); }
  else showToast('Local spoken replies are on.');
});
$('#sfx-toggle').addEventListener('click', () => {
  sfxEnabled = !sfxEnabled;
  localStorage.setItem('capri.sfxEnabled', String(sfxEnabled));
  updateSfxButton();
  if (sfxEnabled) { playCyberSfx('scan'); showToast('Local Capri sound effects are on.'); }
  else showToast('Local sound effects are off.');
});
$('#voice-select').addEventListener('change', () => {
  selectedVoice = $('#voice-select').value;
  localStorage.setItem('capri.voice', selectedVoice);
});
$('#voice-preview').addEventListener('click', () => speak('Hey, choom. You made it back. What trouble are we getting into?', true));
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
  localStorage.removeItem(messagesKey);
  apiJson('/api/history', { messages: [] }).catch((error) => showToast(`Chat history could not be cleared: ${error.message}`, true));
  renderMessages();
  setStatus('Chat history was cleared from this PC.');
});
$('#model-select').addEventListener('change', () => localStorage.setItem('capri.model', $('#model-select').value));
$('#exit-button').addEventListener('click', async () => {
  if (recording) await discardRecording();
  try { await apiJson('/api/exit', { model: $('#model-select').value }); } catch { /* The local server may already be stopping. */ }
  window.close();
  setStatus('Capri has closed. You can close this window now.');
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

updateVoiceButton();
updateSfxButton();
apiJson('/api/avatar-status').then((data) => { if (data.available) showSavedAvatar(); else showOriginalAvatar(); }).catch(() => {});
renderMessages();
historyReadyPromise = restoreHistory();
refreshModels();
setInterval(() => { if (!document.hidden) refreshModels({ quiet: true }); }, 30000);

const cityLines = [
  'Your signal stays on this PC. Desktop actions wait for your approval.',
  'Local memory is yours to edit or wipe. No silent learning, choom.',
  'No outside feed on this channel. Just your projects and a little static.',
  'One action at a time. You say yes; I make the move.',
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
updateCityPulse();
setInterval(updateCityPulse, 20000);
