// AI coach chat that knows the user's numbers and today's food log.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { store, useStore, todayTotals } from '../lib/store.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';

const SUGGESTIONS = [
  'Can I eat nasi lemak today?',
  "I'm hungry at night, what can I snack on?",
  'My weight is stuck, what should I do?',
  'What should I order at the mamak?',
  'Give me a high-protein breakfast under RM5',
];

// Render **bold** and "- " bullet lines as React elements (no HTML injection possible).
function Bold({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
function Reply({ text }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(bullet[1]); else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (line.trim()) blocks.push({ type: 'p', text: line });
  }
  return blocks.map((b, i) => (b.type === 'ul'
    ? <ul key={i}>{b.items.map((it, j) => <li key={j}><Bold text={it} /></li>)}</ul>
    : <p key={i}><Bold text={b.text} /></p>));
}

export default function Coach() {
  const s = useStore();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const log = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [s.chat, busy]);

  const send = async (text) => {
    text = text.trim();
    if (!text || busy) return;
    setBusy(true);
    const chat = [...store.get().chat, { role: 'user', text }];
    store.set({ chat });
    try {
      const t = todayTotals();
      const r = await api.coach(store.get().profile, chat.slice(-12), { kcal: t.kcal, items: t.items.slice(0, 600) });
      store.set({ chat: [...store.get().chat, { role: 'assistant', text: r.reply }].slice(-40) });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Ask <em>Coach</em> anything</h1></div>
        {s.chat.length > 0 && <button className="btn btn-ghost" onClick={() => store.set({ chat: [] })}><Icon name="trash" /> Clear chat</button>}
      </header>
      <section className="card chat">
        <div className="chat-log" ref={log} aria-live="polite">
          <div className="msg assistant"><div className="msg-who"><Icon name="sparkle" /> Coach</div>
            Hai! I know your targets and what you've eaten today. Ask me about Malaysian food, cravings, or plateaus.</div>
          {s.chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <><div className="msg-who"><Icon name="sparkle" /> Coach</div><Reply text={m.text} /></> : m.text}
            </div>
          ))}
          {busy && <div className="msg assistant"><div className="thinking-dots"><i /><i /><i /></div></div>}
        </div>
        {s.chat.length === 0 && (
          <div className="chat-suggest chips">{SUGGESTIONS.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>
        )}
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); setInput(''); }}>
          <input ref={inputRef} className="input" maxLength={500} autoComplete="off" placeholder="Type your question…" aria-label="Message"
            value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-primary" type="submit" aria-label="Send" disabled={busy}><Icon name="send" /></button>
        </form>
      </section>
    </>
  );
}
