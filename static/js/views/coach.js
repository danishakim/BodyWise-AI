// AI coach chat that knows the user's numbers and today's food log.
import { api } from '../api.js';
import { store, todayTotals } from '../store.js';
import { html, mount, icon, toast, $, $$, formatReply } from '../ui.js';

const SUGGESTIONS = [
  'Can I eat nasi lemak today?',
  "I'm hungry at night, what can I snack on?",
  'My weight is stuck, what should I do?',
  'What should I order at the mamak?',
  'Give me a high-protein breakfast under RM5',
];
let busy = false;

export function render(root, ctx) {
  const s = store.get();
  mount(root, html`
    <header class="page-head">
      <div><h1>Ask <em>Coach</em> anything</h1></div>
      ${s.chat.length ? html`<button class="btn btn-ghost" id="clear">${icon.trash} Clear chat</button>` : ''}
    </header>
    <section class="card chat">
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      ${!s.chat.length ? html`<div class="chat-suggest chips">${SUGGESTIONS.map((q) => html`<button class="chip" data-q="${q}">${q}</button>`)}</div>` : ''}
      <form class="chat-form" id="chat-form">
        <input class="input" id="chat-in" maxlength="500" autocomplete="off" placeholder="Type your question…" aria-label="Message">
        <button class="btn btn-primary" type="submit" aria-label="Send">${icon.send}</button>
      </form>
    </section>`);

  const log = $('#chat-log', root);
  const draw = (pending = false) => {
    const msgs = store.get().chat;
    mount(log, html`
      <div class="msg assistant"><div class="msg-who">${icon.sparkle} Coach</div>
        Hai! I know your targets and what you've eaten today. Ask me about Malaysian food, cravings, or plateaus.</div>
      ${msgs.map((m) => html`<div class="msg ${m.role}">${m.role === 'assistant' ? html`<div class="msg-who">${icon.sparkle} Coach</div>${formatReply(m.text)}` : m.text}</div>`)}
      ${pending ? html`<div class="msg assistant"><div class="thinking-dots"><i></i><i></i><i></i></div></div>` : ''}`);
    log.scrollTop = log.scrollHeight;
  };
  draw(busy);

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    const chat = [...store.get().chat, { role: 'user', text }];
    store.set({ chat });
    $('.chat-suggest', root)?.remove();
    draw(true);
    try {
      const { profile } = store.get();
      const t = todayTotals();
      const r = await api.coach(profile, chat.slice(-12), { kcal: t.kcal, items: t.items.slice(0, 600) });
      store.set({ chat: [...store.get().chat, { role: 'assistant', text: r.reply }].slice(-40) });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
      if (document.body.contains(log)) draw();
    }
  }

  $('#chat-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-in', root);
    send(input.value);
    input.value = '';
  });
  $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => send(b.dataset.q)));
  $('#clear', root)?.addEventListener('click', () => { store.set({ chat: [] }); render(root, ctx); });
  $('#chat-in', root).focus({ preventScroll: true });
}
