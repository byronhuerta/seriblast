/* =============================================================
   JARVIS — AI Assistant for Seriblast
   Voice + AI + Phone tools: mic, speaker, camera, WhatsApp
   ============================================================= */

(function () {
  'use strict';

  const CONFIG = {
    apiEndpoint: '/.netlify/functions/jarvis',
    whatsapp: '5215580530887',
    pages: {
      inicio: 'index.html',
      servicios: 'servicios.html',
      cotizador: 'cotizador.html',
      galeria: 'galeria.html',
      nosotros: 'nosotros.html',
      contacto: 'contacto.html',
    },
    welcomeMessage:
      '¡Hola! Soy JARVIS, tu asistente de Seriblast. Puedo hablar contigo por voz, ayudarte a cotizar, mostrarte nuestros servicios y mucho más. ¿En qué te puedo ayudar?',
  };

  // ---- DOM BUILDER -----------------------------------------------

  function buildHTML() {
    const bars = Array.from({ length: 18 }, (_, i) =>
      `<div class="jarvis-viz-bar" style="--i:${i}"></div>`
    ).join('');

    return `
      <button id="jarvis-fab" aria-label="Abrir asistente JARVIS" aria-expanded="false">
        <div class="jarvis-fab-ring"></div>
        <div class="jarvis-fab-ring jarvis-fab-ring--2"></div>
        <div class="jarvis-fab-pulse"></div>
        <span class="jarvis-fab-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
        </span>
      </button>

      <div id="jarvis-panel" role="dialog" aria-modal="true" aria-label="Asistente JARVIS">
        <div class="jarvis-panel-inner">

          <!-- HEADER -->
          <div class="jarvis-header">
            <div class="jarvis-header-left">
              <div class="jarvis-avatar">
                <div class="jarvis-avatar-core">J</div>
                <div class="jarvis-avatar-ring"></div>
              </div>
              <div>
                <div class="jarvis-name">JARVIS</div>
                <div class="jarvis-status" id="jarvis-status">En línea · 24/7</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button id="jarvis-tts-toggle" class="jarvis-icon-btn" aria-label="Activar/desactivar voz" title="Voz on/off" style="width:34px;height:34px;border-radius:8px;font-size:16px;">🔊</button>
              <button id="jarvis-close" class="jarvis-close" aria-label="Cerrar JARVIS">✕</button>
            </div>
          </div>

          <!-- INSTALL BANNER -->
          <div id="jarvis-install-banner">
            <span>📱 Instala JARVIS en tu celular para acceso rápido</span>
            <button class="jarvis-install-btn" id="jarvis-install-btn">Instalar</button>
          </div>

          <!-- MESSAGES -->
          <div class="jarvis-messages" id="jarvis-messages" role="log" aria-live="polite"></div>

          <!-- VOICE VISUALIZER -->
          <div class="jarvis-viz" id="jarvis-viz" aria-hidden="true">${bars}</div>

          <!-- QUICK ACTIONS -->
          <div class="jarvis-quick-actions" id="jarvis-quick-actions">
            <button class="jarvis-chip" data-prompt="¿Qué servicios ofrecen?">Servicios</button>
            <button class="jarvis-chip" data-prompt="Quiero una cotización">Cotizar</button>
            <button class="jarvis-chip" data-prompt="¿Cuánto cuesta el grabado láser?">Grabado láser</button>
            <button class="jarvis-chip" data-prompt="¿Cómo los contacto?">Contacto</button>
            <button class="jarvis-chip" data-prompt="¿Hacen envíos?">Envíos</button>
          </div>

          <!-- INPUT -->
          <div class="jarvis-input-area">
            <button id="jarvis-camera" class="jarvis-icon-btn" aria-label="Tomar foto del producto" title="Foto de producto">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <input id="jarvis-input" type="text" placeholder="Pregúntame algo..." autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="send" aria-label="Escribe tu mensaje">
            <button id="jarvis-mic" class="jarvis-icon-btn" aria-label="Hablar por micrófono" title="Hablar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button id="jarvis-send" class="jarvis-icon-btn" aria-label="Enviar mensaje">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // ---- JARVIS CLASS ----------------------------------------------

  class Jarvis {
    constructor() {
      this.isOpen = false;
      this.isListening = false;
      this.isSpeaking = false;
      this.ttsEnabled = true;
      this.messages = [];
      this.recognition = null;
      this.voice = null;
      this.deferredInstallPrompt = null;
      this.dom = {};

      this._mount();
      this._setupSpeechRecognition();
      this._setupTTS();
      this._setupPWA();
      this._bindEvents();
      this._showWelcome();
    }

    // ---- MOUNT --------------------------------------------------

    _mount() {
      const wrapper = document.createElement('div');
      wrapper.id = 'jarvis-container';
      wrapper.innerHTML = buildHTML();
      document.body.appendChild(wrapper);

      const g = (id) => document.getElementById(id);
      this.dom = {
        fab: g('jarvis-fab'),
        panel: g('jarvis-panel'),
        messages: g('jarvis-messages'),
        input: g('jarvis-input'),
        mic: g('jarvis-mic'),
        send: g('jarvis-send'),
        camera: g('jarvis-camera'),
        status: g('jarvis-status'),
        viz: g('jarvis-viz'),
        close: g('jarvis-close'),
        ttsToggle: g('jarvis-tts-toggle'),
        installBanner: g('jarvis-install-banner'),
        installBtn: g('jarvis-install-btn'),
        quickActions: g('jarvis-quick-actions'),
      };

      // Show camera button if supported
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.dom.camera.style.display = 'flex';
      }
    }

    // ---- EVENTS -------------------------------------------------

    _bindEvents() {
      this.dom.fab.addEventListener('click', () => this.toggle());
      this.dom.close.addEventListener('click', () => this.close());
      this.dom.send.addEventListener('click', () => this._handleSend());
      this.dom.mic.addEventListener('click', () => this._toggleListening());
      this.dom.camera.addEventListener('click', () => this._handleCamera());
      this.dom.ttsToggle.addEventListener('click', () => this._toggleTTS());
      this.dom.installBtn.addEventListener('click', () => this._installApp());

      this.dom.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._handleSend();
        }
      });

      this.dom.quickActions.addEventListener('click', (e) => {
        const chip = e.target.closest('.jarvis-chip');
        if (chip) {
          const prompt = chip.dataset.prompt;
          this.dom.input.value = prompt;
          this._handleSend();
          // Hide quick actions after first use
          this.dom.quickActions.style.display = 'none';
        }
      });

      // Close on backdrop click (mobile)
      this.dom.panel.addEventListener('click', (e) => {
        if (e.target === this.dom.panel) this.close();
      });

      // Handle keyboard visibility on mobile
      this.dom.input.addEventListener('focus', () => {
        setTimeout(() => {
          this.dom.messages.scrollTop = this.dom.messages.scrollHeight;
        }, 300);
      });
    }

    // ---- OPEN / CLOSE ------------------------------------------

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.dom.panel.classList.add('open');
      this.dom.fab.classList.add('active');
      this.dom.fab.setAttribute('aria-expanded', 'true');
      this.dom.input.focus();
      if (navigator.vibrate) navigator.vibrate(15);
    }

    close() {
      this.isOpen = false;
      this.dom.panel.classList.remove('open');
      this.dom.fab.classList.remove('active');
      this.dom.fab.setAttribute('aria-expanded', 'false');
      this._stopListening();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    // ---- SPEECH RECOGNITION ------------------------------------

    _setupSpeechRecognition() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      this.recognition = new SR();
      this.recognition.lang = 'es-MX';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (e) => {
        const transcript = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join('');
        this.dom.input.value = transcript;
        if (e.results[0].isFinal) {
          this._stopListening();
          this._handleSend();
        }
      };

      this.recognition.onerror = () => this._stopListening();
      this.recognition.onend = () => {
        if (this.isListening) this._stopListening();
      };
    }

    _toggleListening() {
      this.isListening ? this._stopListening() : this._startListening();
    }

    _startListening() {
      if (!this.recognition) {
        this._addMessage('assistant', 'Tu navegador no soporta reconocimiento de voz. Puedes escribir tu mensaje.');
        return;
      }
      // Stop TTS if speaking
      if (window.speechSynthesis) window.speechSynthesis.cancel();

      this.isListening = true;
      this.dom.mic.classList.add('listening');
      this.dom.viz.classList.add('active');
      this._setStatus('listening', 'Escuchando...');
      this.dom.input.placeholder = 'Escuchando...';
      if (navigator.vibrate) navigator.vibrate([20, 80, 20]);

      try {
        this.recognition.start();
      } catch {
        this._stopListening();
      }
    }

    _stopListening() {
      this.isListening = false;
      this.dom.mic.classList.remove('listening');
      this.dom.viz.classList.remove('active');
      this._setStatus('online', 'En línea · 24/7');
      this.dom.input.placeholder = 'Pregúntame algo...';
      if (this.recognition) {
        try { this.recognition.abort(); } catch {}
      }
    }

    // ---- TTS ---------------------------------------------------

    _setupTTS() {
      if (!window.speechSynthesis) return;
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice =
          voices.find((v) => v.lang === 'es-MX') ||
          voices.find((v) => v.lang.startsWith('es')) ||
          voices[0] ||
          null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }

    _speak(text) {
      if (!this.ttsEnabled || !window.speechSynthesis) return;

      speechSynthesis.cancel();
      const clean = text
        .replace(/[*_#`~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\n+/g, '. ')
        .trim();
      if (!clean) return;

      const utt = new SpeechSynthesisUtterance(clean);
      utt.voice = this.voice;
      utt.lang = 'es-MX';
      utt.rate = 1.05;
      utt.pitch = 1;
      utt.volume = 1;

      utt.onstart = () => {
        this.isSpeaking = true;
        this.dom.viz.classList.add('speaking');
        this._setStatus('speaking', 'Hablando...');
      };
      utt.onend = utt.onerror = () => {
        this.isSpeaking = false;
        this.dom.viz.classList.remove('speaking');
        this._setStatus('online', 'En línea · 24/7');
      };

      speechSynthesis.speak(utt);
    }

    _toggleTTS() {
      this.ttsEnabled = !this.ttsEnabled;
      this.dom.ttsToggle.textContent = this.ttsEnabled ? '🔊' : '🔇';
      this.dom.ttsToggle.title = this.ttsEnabled ? 'Voz activada' : 'Voz desactivada';
      if (!this.ttsEnabled && window.speechSynthesis) speechSynthesis.cancel();
    }

    // ---- CAMERA ------------------------------------------------

    async _handleCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        const canvas = document.createElement('canvas');
        await new Promise((res) => { video.onloadedmetadata = res; });
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        stream.getTracks().forEach((t) => t.stop());

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        this._addMessage('user', '📷 [Foto del producto enviada]');
        this._addMessage('assistant', 'Recibí tu foto. Lamentablemente no puedo analizar imágenes directamente en este chat, pero puedes enviarla por WhatsApp y nuestro equipo te dará una cotización personalizada.');
        this._addToolBadge('📲 Enviando a WhatsApp...');
        const msg = '¡Hola! Quiero cotizar un proyecto y te envío una foto del producto.';
        setTimeout(() => this._toolOpenWhatsApp({ message: msg }), 800);
      } catch {
        this._addMessage('assistant', 'No pude acceder a la cámara. Puedes enviar tu foto directamente por WhatsApp.');
      }
    }

    // ---- SEND / API --------------------------------------------

    async _handleSend() {
      const text = this.dom.input.value.trim();
      if (!text) return;

      this.dom.input.value = '';
      this._addMessage('user', text);
      this._setLoading(true);

      this.messages.push({ role: 'user', content: text });

      try {
        const data = await this._callAPI();
        this._processResponse(data);
      } catch (err) {
        const isOffline = !navigator.onLine;
        this._addMessage(
          'assistant',
          isOffline
            ? 'Parece que no tienes conexión. Por favor verifica tu internet e intenta de nuevo.'
            : 'Hubo un problema al procesar tu solicitud. Por favor intenta de nuevo o contáctanos por WhatsApp.'
        );
        this.messages.pop(); // Remove failed user message from history
      } finally {
        this._setLoading(false);
      }
    }

    async _callAPI() {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.messages }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      return res.json();
    }

    _processResponse(data) {
      let textContent = '';
      const toolCalls = [];

      for (const block of data.content || []) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push(block);
        }
      }

      if (textContent) {
        this._addMessage('assistant', textContent);
        this._speak(textContent);
      }

      for (const tool of toolCalls) {
        this._executeTool(tool.name, tool.input);
      }

      // Add assistant message to history for context
      this.messages.push({ role: 'assistant', content: data.content });
    }

    _executeTool(name, input) {
      const handlers = {
        navigate: (i) => this._toolNavigate(i),
        open_whatsapp: (i) => this._toolOpenWhatsApp(i),
        start_quote: (i) => this._toolStartQuote(i),
        show_service: (i) => this._toolShowService(i),
      };

      const handler = handlers[name];
      if (handler) handler(input);
    }

    // ---- TOOLS -------------------------------------------------

    _toolNavigate({ page }) {
      const url = CONFIG.pages[page];
      if (!url) return;
      this._addToolBadge(`🔀 Navegando a ${page}...`);
      setTimeout(() => { window.location.href = url; }, 1200);
    }

    _toolOpenWhatsApp({ message }) {
      const text = message || '¡Hola! Me gustaría obtener más información sobre los servicios de Seriblast.';
      const url = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
      this._addToolBadge('📲 Abriendo WhatsApp...');
      setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), 600);
    }

    _toolStartQuote({ service, details } = {}) {
      const params = new URLSearchParams();
      if (service) params.set('servicio', service);
      if (details) params.set('detalles', details);
      const qs = params.toString();
      this._addToolBadge('📋 Abriendo cotizador...');
      setTimeout(() => {
        window.location.href = `cotizador.html${qs ? '?' + qs : ''}`;
      }, 1200);
    }

    _toolShowService({ service_id }) {
      this._addToolBadge(`🔍 Mostrando servicio...`);
      setTimeout(() => {
        window.location.href = `servicios.html#${service_id}`;
      }, 1200);
    }

    // ---- MESSAGES UI ------------------------------------------

    _showWelcome() {
      this._addMessage('assistant', CONFIG.welcomeMessage);
    }

    _addMessage(role, content) {
      const msg = document.createElement('div');
      msg.className = `jarvis-msg jarvis-msg--${role}`;

      if (role === 'assistant') {
        const avatar = document.createElement('div');
        avatar.className = 'jarvis-msg-avatar';
        avatar.textContent = 'J';
        msg.appendChild(avatar);
      }

      const bubble = document.createElement('div');
      bubble.className = 'jarvis-msg-content';
      bubble.textContent = content;
      msg.appendChild(bubble);

      this.dom.messages.appendChild(msg);
      this._scrollToBottom();
    }

    _addToolBadge(label) {
      const badge = document.createElement('div');
      badge.className = 'jarvis-tool-badge';
      badge.style.cssText = 'margin: 0 16px 4px; align-self: flex-start;';
      badge.innerHTML = label;
      this.dom.messages.appendChild(badge);
      this._scrollToBottom();
    }

    _scrollToBottom() {
      requestAnimationFrame(() => {
        this.dom.messages.scrollTop = this.dom.messages.scrollHeight;
      });
    }

    _setLoading(show) {
      const existingLoader = document.getElementById('jarvis-loading');
      if (show) {
        if (existingLoader) return;
        const loader = document.createElement('div');
        loader.id = 'jarvis-loading';
        loader.className = 'jarvis-msg jarvis-msg--assistant jarvis-msg--loading';
        loader.innerHTML = `
          <div class="jarvis-msg-avatar">J</div>
          <div class="jarvis-msg-content">
            <span class="jarvis-dots"><span></span><span></span><span></span></span>
          </div>`;
        this.dom.messages.appendChild(loader);
        this._scrollToBottom();
        this._setStatus('processing', 'Procesando...');
      } else {
        if (existingLoader) existingLoader.remove();
        this._setStatus('online', 'En línea · 24/7');
      }
    }

    _setStatus(state, text) {
      this.dom.status.className = `jarvis-status ${state}`;
      this.dom.status.textContent = text;
    }

    // ---- PWA ---------------------------------------------------

    _setupPWA() {
      // Service Worker registration
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }

      // Install prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredInstallPrompt = e;
        this.dom.installBanner.classList.add('show');
      });

      window.addEventListener('appinstalled', () => {
        this.dom.installBanner.classList.remove('show');
        this.deferredInstallPrompt = null;
      });
    }

    async _installApp() {
      if (!this.deferredInstallPrompt) return;
      this.deferredInstallPrompt.prompt();
      const { outcome } = await this.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        this.dom.installBanner.classList.remove('show');
      }
      this.deferredInstallPrompt = null;
    }
  }

  // ---- INIT -------------------------------------------------------

  function init() {
    // Avoid double-init
    if (document.getElementById('jarvis-container')) return;
    window.JARVIS = new Jarvis();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
