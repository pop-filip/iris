(function () {
  'use strict';

  // Config from script tag: data-server, data-client-id, data-name, data-color, data-position
  var script  = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var SERVER      = (script.getAttribute('data-server')    || 'http://localhost:3002').replace(/\/$/, '');
  var CLIENT_ID   = script.getAttribute('data-client-id')  || 'default';
  var BOT_NAME    = script.getAttribute('data-name')       || 'Iris';
  var COLOR       = script.getAttribute('data-color')      || '#84CC16';
  var POSITION    = script.getAttribute('data-position')   || 'right'; // 'right' | 'left'
  var QUICK_RAW   = script.getAttribute('data-quick-replies') || '';
  var QUICK_REPLIES = QUICK_RAW ? QUICK_RAW.split('|').map(function(s){ return s.trim(); }).filter(Boolean) : [];

  // Generate anonymous session ID
  var userId = localStorage.getItem('iris_uid');
  if (!userId) {
    userId = 'w_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
    localStorage.setItem('iris_uid', userId);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  var css = `
    #iris-widget-btn {
      position: fixed;
      bottom: 24px;
      ${POSITION}: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${COLOR};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9998;
      transition: transform .2s ease, box-shadow .2s ease;
    }
    #iris-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }
    #iris-widget-btn svg { width: 26px; height: 26px; fill: #000; }

    #iris-widget-badge {
      position: absolute;
      top: -3px; right: -3px;
      width: 18px; height: 18px;
      background: #ef4444;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
    }

    #iris-widget-panel {
      position: fixed;
      bottom: 90px;
      ${POSITION}: 24px;
      width: 360px;
      max-width: calc(100vw - 48px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: #111;
      border-radius: 16px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.45);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      border: 1px solid rgba(255,255,255,0.07);
    }
    #iris-widget-panel.open { display: flex; }

    @media (max-width: 480px) {
      #iris-widget-panel {
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        top: auto !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 420px !important;
        max-height: 420px !important;
        border-radius: 20px 20px 0 0 !important;
        box-shadow: 0 -4px 32px rgba(0,0,0,0.5) !important;
      }
      #iris-widget-panel #iris-widget-messages {
        max-height: 260px !important;
      }
      #iris-widget-btn {
        bottom: 16px !important;
        ${POSITION}: 16px !important;
      }
    }

    .iris-quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 12px;
      flex-shrink: 0;
    }
    .iris-qr-btn {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: all .2s;
      white-space: nowrap;
    }
    .iris-qr-btn:hover {
      border-color: ${COLOR};
      color: ${COLOR};
    }

    #iris-widget-header {
      background: ${COLOR};
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    #iris-widget-header-dot {
      width: 8px; height: 8px;
      background: #000;
      border-radius: 50%;
      opacity: .5;
    }
    #iris-widget-header-name {
      font-weight: 700;
      font-size: 15px;
      color: #000;
      flex: 1;
    }
    #iris-widget-close {
      background: none;
      border: none;
      cursor: pointer;
      color: rgba(0,0,0,0.6);
      font-size: 20px;
      line-height: 1;
      padding: 0;
    }
    #iris-widget-close:hover { color: #000; }

    #iris-widget-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: #333 transparent;
    }

    .iris-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.55;
      word-break: break-word;
    }
    .iris-msg.bot {
      background: #1e1e1e;
      color: #e5e5e5;
      border-bottom-left-radius: 3px;
      align-self: flex-start;
    }
    .iris-msg.user {
      background: ${COLOR};
      color: #000;
      border-bottom-right-radius: 3px;
      align-self: flex-end;
      font-weight: 500;
    }
    .iris-msg.typing {
      background: #1e1e1e;
      color: #666;
      align-self: flex-start;
    }
    .iris-typing-dots span {
      display: inline-block;
      width: 6px; height: 6px;
      background: #666;
      border-radius: 50%;
      margin: 0 2px;
      animation: iris-bounce .8s infinite;
    }
    .iris-typing-dots span:nth-child(2) { animation-delay: .15s; }
    .iris-typing-dots span:nth-child(3) { animation-delay: .3s; }
    @keyframes iris-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-5px); }
    }

    #iris-widget-input-row {
      padding: 12px;
      border-top: 1px solid rgba(255,255,255,0.07);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    #iris-widget-input {
      flex: 1;
      background: #1e1e1e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 10px 14px;
      color: #e5e5e5;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 42px;
      max-height: 100px;
      overflow-y: auto;
    }
    #iris-widget-input:focus { border-color: ${COLOR}; }
    #iris-widget-input::placeholder { color: #555; }
    #iris-widget-send {
      width: 42px; height: 42px;
      background: ${COLOR};
      border: none;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity .2s;
    }
    #iris-widget-send:hover { opacity: .85; }
    #iris-widget-send svg { width: 18px; height: 18px; fill: #000; }

    #iris-widget-powered {
      text-align: center;
      font-size: 11px;
      color: #333;
      padding: 6px 0 8px;
      flex-shrink: 0;
    }
    #iris-widget-powered a { color: #444; text-decoration: none; }
    #iris-widget-powered a:hover { color: #666; }
  `;

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── HTML ──────────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'iris-widget-btn';
  btn.setAttribute('aria-label', 'Chat öffnen');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.253 2 11.5c0 2.304.87 4.41 2.303 6.022L3 21l3.75-1.2A10.45 10.45 0 0012 21c5.523 0 10-4.253 10-9.5S17.523 2 12 2z"/>
    </svg>
    <div id="iris-widget-badge"></div>
  `;
  document.body.appendChild(btn);

  var panel = document.createElement('div');
  panel.id = 'iris-widget-panel';
  panel.innerHTML = `
    <div id="iris-widget-header">
      <div id="iris-widget-header-dot"></div>
      <div id="iris-widget-header-name">${BOT_NAME}</div>
      <button id="iris-widget-close" aria-label="Schließen">×</button>
    </div>
    <div id="iris-widget-messages"></div>
    <div id="iris-widget-input-row">
      <textarea id="iris-widget-input" placeholder="Nachricht..." rows="1"></textarea>
      <button id="iris-widget-send" aria-label="Senden">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
    <div id="iris-widget-powered">Powered by <a href="https://digitalnature.at/iris/" target="_blank">Iris · Digital Nature</a></div>
  `;
  document.body.appendChild(panel);

  // ── Logic ─────────────────────────────────────────────────────────────────
  var messages   = panel.querySelector('#iris-widget-messages');
  var input      = panel.querySelector('#iris-widget-input');
  var sendBtn    = panel.querySelector('#iris-widget-send');
  var closeBtn   = panel.querySelector('#iris-widget-close');
  var badge      = btn.querySelector('#iris-widget-badge');
  var unread     = 0;
  var isOpen     = false;
  var isTyping   = false;

  function renderMarkdown(text) {
    // Escape HTML first
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:12px">$1</code>')
      .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul style="padding-left:16px;margin:4px 0">$1</ul>')
      .replace(/\n/g, '<br>');
  }

  function addMessage(text, role) {
    var div = document.createElement('div');
    div.className = 'iris-msg ' + role;
    if (role === 'bot') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function showTyping() {
    var div = document.createElement('div');
    div.className = 'iris-msg typing';
    div.innerHTML = '<div class="iris-typing-dots"><span></span><span></span><span></span></div>';
    div.id = 'iris-typing';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    var el = document.getElementById('iris-typing');
    if (el) el.remove();
  }

  function setUnread(n) {
    unread = n;
    if (n > 0 && !isOpen) {
      badge.style.display = 'flex';
      badge.textContent = n;
    } else {
      badge.style.display = 'none';
    }
  }

  async function send() {
    var text = input.value.trim();
    if (!text || isTyping) return;
    input.value = '';
    input.style.height = '42px';

    addMessage(text, 'user');
    isTyping = true;
    showTyping();

    try {
      var res = await fetch(SERVER + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId: userId, clientId: CLIENT_ID }),
      });
      var data = await res.json();
      removeTyping();

      var reply = data.reply || 'Es tut mir leid, ich konnte keine Antwort generieren.';
      addMessage(reply, 'bot');

      if (!isOpen) setUnread(unread + 1);
    } catch (err) {
      removeTyping();
      addMessage('Verbindungsfehler. Bitte versuche es erneut.', 'bot');
    }
    isTyping = false;
  }

  function showQuickReplies() {
    if (!QUICK_REPLIES.length) return;
    var existing = document.getElementById('iris-quick-replies');
    if (existing) return;
    var wrap = document.createElement('div');
    wrap.className = 'iris-quick-replies';
    wrap.id = 'iris-quick-replies';
    QUICK_REPLIES.forEach(function(label) {
      var btn = document.createElement('button');
      btn.className = 'iris-qr-btn';
      btn.textContent = label;
      btn.addEventListener('click', function() {
        wrap.remove();
        input.value = label;
        send();
      });
      wrap.appendChild(btn);
    });
    // Insert before input row
    panel.insertBefore(wrap, panel.querySelector('#iris-widget-input-row'));
  }

  function open() {
    isOpen = true;
    panel.classList.add('open');
    setUnread(0);
    input.focus();
    // Show greeting if first open
    if (messages.children.length === 0) {
      addMessage('Hallo! Ich bin ' + BOT_NAME + '. Wie kann ich Ihnen helfen? 👋', 'bot');
      showQuickReplies();
    }
  }

  function close() {
    isOpen = false;
    panel.classList.remove('open');
  }

  btn.addEventListener('click', function () { isOpen ? close() : open(); });
  closeBtn.addEventListener('click', close);
  sendBtn.addEventListener('click', send);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', function () {
    this.style.height = '42px';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

})();
