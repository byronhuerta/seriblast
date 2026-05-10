/* ============================================================
   JARVIS — Personal AI Assistant
   Voice | Claude AI | Phone tools | PWA
   ============================================================ */

'use strict';

// ---- CONFIG ---------------------------------------------------

const API = '/.netlify/functions/jarvis';
const WELCOME = '¡Hola! Soy JARVIS, tu asistente personal. Puedo hablar contigo por voz, buscar información, abrir aplicaciones, decirte el clima, poner recordatorios y mucho más. ¿En qué te ayudo?';

// ---- STATE ----------------------------------------------------

const state = {
  messages: [],          // Conversation history for the API
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  ttsEnabled: true,
  recognition: null,
  voice: null,
  deferredInstall: null,
  pressTimer: null,
  interimTimeout: null,
};

// ---- DOM REFS -------------------------------------------------

const dom = {};
function $ (id) { return document.getElementById(id); }

function initDom() {
  dom.messages    = $('messages');
  dom.quickPrompts= $('quick-prompts');
  dom.txtInput    = $('txt-input');
  dom.btnSend     = $('btn-send');
  dom.btnMic      = $('btn-mic');
  dom.btnTts      = $('btn-tts');
  dom.btnClear    = $('btn-clear');
  dom.statusText  = $('status-text');
  dom.vizWrap     = $('viz-wrap');
  dom.installBanner= $('install-banner');
  dom.btnInstall  = $('btn-install');
  dom.notifBanner = $('notif-banner');
  dom.btnNotif    = $('btn-notif');
}

// ---- BODY STATE CLASSES ---------------------------------------

function setBodyState(state) {
  document.body.classList.remove('listening', 'thinking', 'speaking');
  if (state) document.body.classList.add(state);
}

function setStatus(cls, text) {
  dom.statusText.className = `header-sub ${cls}`;
  dom.statusText.textContent = text;
}

// ---- SPEECH RECOGNITION ---------------------------------------

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  state.recognition = new SR();
  state.recognition.lang = 'es-MX';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.maxAlternatives = 1;

  let finalTranscript = '';

  state.recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalTranscript += t;
      else interim += t;
    }
    const display = finalTranscript + interim;
    dom.txtInput.value = display;

    // Auto-send after pause in speech
    clearTimeout(state.interimTimeout);
    if (finalTranscript) {
      state.interimTimeout = setTimeout(() => {
        if (state.isListening && finalTranscript.trim()) {
          stopListening();
          sendMessage(finalTranscript.trim());
          finalTranscript = '';
        }
      }, 1500);
    }
  };

  state.recognition.onerror = (e) => {
    if (e.error !== 'aborted') stopListening();
  };

  state.recognition.onend = () => {
    if (state.isListening) {
      // Auto-restart if still listening mode (iOS workaround)
      try { state.recognition.start(); } catch { stopListening(); }
    }
  };
}

function startListening() {
  if (!state.recognition) {
    addSystemNote('Tu navegador no soporta voz. Escribe tu mensaje.');
    return;
  }
  if (state.isListening) return;

  // Stop TTS
  if (window.speechSynthesis) speechSynthesis.cancel();

  state.isListening = true;
  dom.txtInput.value = '';
  dom.txtInput.placeholder = 'Escuchando...';
  dom.btnMic.classList.add('pressing');
  setBodyState('listening');
  setStatus('listening', 'Escuchando...');
  dom.vizWrap.classList.add('active');
  if (navigator.vibrate) navigator.vibrate([15, 50, 15]);

  try { state.recognition.start(); } catch { stopListening(); }
}

function stopListening() {
  state.isListening = false;
  dom.btnMic.classList.remove('pressing');
  setBodyState('');
  setStatus('', 'En línea · 24/7');
  dom.vizWrap.classList.remove('active');
  dom.txtInput.placeholder = 'Pregúntame algo...';

  if (state.recognition) {
    try { state.recognition.stop(); } catch {}
  }
  clearTimeout(state.interimTimeout);
}

// ---- TEXT-TO-SPEECH -------------------------------------------

function initTTS() {
  if (!window.speechSynthesis) return;
  const pick = () => {
    const voices = speechSynthesis.getVoices();
    state.voice =
      voices.find(v => v.lang === 'es-MX') ||
      voices.find(v => v.lang.startsWith('es-')) ||
      voices.find(v => v.lang.startsWith('es')) ||
      voices[0] || null;
  };
  pick();
  speechSynthesis.onvoiceschanged = pick;
}

function speak(text) {
  if (!state.ttsEnabled || !window.speechSynthesis || !text) return;

  speechSynthesis.cancel();

  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*_#`~]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n+/g, '. ')
    .trim()
    .slice(0, 500); // Cap length for TTS

  if (!clean) return;

  const utt = new SpeechSynthesisUtterance(clean);
  utt.voice = state.voice;
  utt.lang = 'es-MX';
  utt.rate = 1.05;
  utt.pitch = 1;
  utt.volume = 1;

  utt.onstart = () => {
    state.isSpeaking = true;
    setBodyState('speaking');
    setStatus('speaking', 'Hablando...');
    dom.vizWrap.classList.add('active');
  };
  utt.onend = utt.onerror = () => {
    state.isSpeaking = false;
    setBodyState('');
    setStatus('', 'En línea · 24/7');
    dom.vizWrap.classList.remove('active');
  };

  // iOS workaround: speechSynthesis pauses after 15s
  const keepAlive = setInterval(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      speechSynthesis.resume();
    } else {
      clearInterval(keepAlive);
    }
  }, 10000);

  speechSynthesis.speak(utt);
}

// ---- API CALL -------------------------------------------------

async function callAPI(userText) {
  state.messages.push({ role: 'user', content: userText });
  const body = JSON.stringify({ messages: state.messages });

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

// ---- SEND MESSAGE ---------------------------------------------

async function sendMessage(text) {
  if (!text || state.isThinking) return;

  addUserMsg(text);
  dom.txtInput.value = '';
  dom.quickPrompts.hidden = true;

  const loaderId = showLoader();
  state.isThinking = true;
  setBodyState('thinking');
  setStatus('thinking', 'Pensando...');

  try {
    const data = await callAPI(text);
    removeLoader(loaderId);

    const reply = data.text || '';
    const actions = data.actions || [];

    if (reply) {
      addAssistantMsg(reply, actions);
      speak(reply);
      state.messages.push({ role: 'assistant', content: reply });
    }

    for (const action of actions) {
      executeAction(action.name, action.input);
    }

  } catch (err) {
    removeLoader(loaderId);
    const offline = !navigator.onLine;
    const errMsg = offline
      ? 'Sin conexión a internet. Por favor revisa tu red.'
      : `Ocurrió un error: ${err.message}. Intenta de nuevo.`;
    addAssistantMsg(errMsg);
    speak(errMsg);
    state.messages.pop(); // remove failed user msg from history
  } finally {
    state.isThinking = false;
    setBodyState('');
    setStatus('', 'En línea · 24/7');
  }
}

// ---- EXECUTE CLIENT-SIDE ACTIONS ------------------------------

function executeAction(name, input) {
  const handlers = {
    open_url:          () => openURL(input.url, input.label),
    make_call:         () => makeCall(input.phone, input.name),
    send_whatsapp:     () => sendWhatsApp(input.phone, input.message),
    search_web:        () => searchWeb(input.query, input.site),
    open_maps:         () => openMaps(input.query, input.mode, input.destination),
    send_email:        () => sendEmail(input.to, input.subject, input.body),
    set_reminder:      () => setReminder(input.title, input.message, input.delay_minutes),
    copy_to_clipboard: () => copyText(input.text, input.label),
  };
  const fn = handlers[name];
  if (fn) setTimeout(fn, 500);
}

function openURL(url, label) {
  window.open(url, '_blank', 'noopener,noreferrer');
  addActionBadge(`🔗 ${label}`);
}

function makeCall(phone, name) {
  const clean = phone.replace(/\D/g, '');
  window.location.href = `tel:${clean}`;
  addActionBadge(`📞 Llamando a ${name || clean}`);
}

function sendWhatsApp(phone, message) {
  const clean = phone.replace(/\D/g, '');
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  addActionBadge('💬 Abriendo WhatsApp');
}

function searchWeb(query, site) {
  const base = {
    google:  `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    twitter: `https://twitter.com/search?q=${encodeURIComponent(query)}`,
    news:    `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=es-419`,
  };
  const url = base[site] || base.google;
  window.open(url, '_blank', 'noopener,noreferrer');
  addActionBadge(`🔍 Buscando: ${query}`);
}

function openMaps(query, mode, destination) {
  let url;
  if (mode === 'directions' && destination) {
    url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  addActionBadge(`🗺️ Abriendo Maps`);
}

function sendEmail(to, subject, body) {
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  addActionBadge(`✉️ Abriendo correo`);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    addActionBadge(`📋 Copiado: ${label}`);
  } catch {
    addActionBadge(`📋 No se pudo copiar automáticamente`);
  }
}

async function setReminder(title, message, delayMinutes) {
  const ms = Math.max(1, delayMinutes) * 60 * 1000;
  addActionBadge(`⏰ Recordatorio en ${delayMinutes} min: ${title}`);

  if (!('Notification' in window)) {
    addSystemNote('Las notificaciones no están disponibles en este navegador.');
    return;
  }

  if (Notification.permission === 'denied') {
    addSystemNote('Las notificaciones están bloqueadas. Actívalas en Configuración del navegador.');
    return;
  }

  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      addSystemNote('Sin permiso de notificaciones. Actívalo en Configuración.');
      return;
    }
  }

  setTimeout(() => {
    new Notification(title, {
      body: message || title,
      icon: '/jarvis/icon-192.png',
      badge: '/jarvis/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'jarvis-reminder',
    });
  }, ms);
}

// ---- UI HELPERS -----------------------------------------------

function addUserMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg msg--user';
  div.innerHTML = `<div class="msg-bubble">${escapeHTML(text)}</div>`;
  dom.messages.appendChild(div);
  scrollBottom();
}

function addAssistantMsg(text, actions = []) {
  const div = document.createElement('div');
  div.className = 'msg msg--assistant';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'J';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatText(text);

  div.appendChild(avatar);
  div.appendChild(bubble);
  dom.messages.appendChild(div);
  scrollBottom();
}

function addActionBadge(label) {
  const badge = document.createElement('div');
  badge.className = 'msg msg--assistant';
  badge.style.cssText = 'max-width:100%;';
  badge.innerHTML = `<div style="width:26px;flex-shrink:0;"></div><span class="msg-action">${escapeHTML(label)}</span>`;
  dom.messages.appendChild(badge);
  scrollBottom();
}

function addSystemNote(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  dom.messages.appendChild(el);
  scrollBottom();
}

let loaderIdx = 0;
function showLoader() {
  const id = `loader-${++loaderIdx}`;
  const el = document.createElement('div');
  el.id = id;
  el.className = 'msg msg--assistant';
  el.innerHTML = `
    <div class="msg-avatar">J</div>
    <div class="msg-bubble"><div class="dots"><span></span><span></span><span></span></div></div>
  `;
  dom.messages.appendChild(el);
  scrollBottom();
  return id;
}

function removeLoader(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollBottom() {
  requestAnimationFrame(() => {
    dom.messages.scrollTop = dom.messages.scrollHeight;
  });
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatText(text) {
  // Bold
  let t = escapeHTML(text);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Line breaks
  t = t.replace(/\n/g, '<br>');
  return t;
}

// ---- MIC BUTTON (tap or hold) ---------------------------------

function bindMic() {
  const btn = dom.btnMic;

  // Pointer events for touch and mouse
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  // Prevent context menu on long press (mobile)
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---- KEYBOARD -------------------------------------------------

function bindInput() {
  dom.txtInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = dom.txtInput.value.trim();
      if (text) {
        stopListening();
        sendMessage(text);
      }
    }
  });

  dom.btnSend.addEventListener('click', () => {
    const text = dom.txtInput.value.trim();
    if (text) {
      stopListening();
      sendMessage(text);
    }
  });

  dom.btnClear.addEventListener('click', () => {
    state.messages = [];
    dom.messages.innerHTML = '';
    dom.quickPrompts.hidden = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    stopListening();
    addSystemNote('Nueva conversación iniciada');
  });

  dom.btnTts.addEventListener('click', () => {
    state.ttsEnabled = !state.ttsEnabled;
    dom.btnTts.textContent = state.ttsEnabled ? '🔊' : '🔇';
    if (!state.ttsEnabled && window.speechSynthesis) speechSynthesis.cancel();
  });
}

function bindQuickPrompts() {
  dom.quickPrompts.addEventListener('click', (e) => {
    const btn = e.target.closest('.qp');
    if (!btn) return;
    const prompt = btn.dataset.p;
    sendMessage(prompt);
  });
}

// ---- PWA INSTALL ----------------------------------------------

function initPWA() {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    dom.installBanner.hidden = false;
  });

  dom.btnInstall.addEventListener('click', async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    const { outcome } = await state.deferredInstall.userChoice;
    if (outcome === 'accepted') dom.installBanner.hidden = true;
    state.deferredInstall = null;
  });

  window.addEventListener('appinstalled', () => {
    dom.installBanner.hidden = true;
    addSystemNote('¡JARVIS instalado! Ya lo tienes en tu pantalla de inicio.');
  });
}

// ---- NOTIFICATIONS PERMISSION --------------------------------

function initNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    dom.notifBanner.hidden = false;
    dom.btnNotif.addEventListener('click', async () => {
      const perm = await Notification.requestPermission();
      dom.notifBanner.hidden = true;
      if (perm === 'granted') {
        addSystemNote('Notificaciones activadas. Puedes pedirme recordatorios.');
      }
    });
  }
}

// ---- WAKE LOCK (keeps screen on while listening) --------------

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    await navigator.wakeLock.request('screen');
  } catch { /* silent */ }
}

// ---- INIT -----------------------------------------------------

function init() {
  initDom();
  initSpeechRecognition();
  initTTS();
  initPWA();
  initNotifications();
  requestWakeLock();
  bindMic();
  bindInput();
  bindQuickPrompts();

  // Welcome
  setTimeout(() => {
    addAssistantMsg(WELCOME);
    speak(WELCOME);
  }, 300);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
