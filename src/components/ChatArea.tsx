import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { askQuestion, type Source } from "../lib/rag";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  pending?: boolean;
  error?: boolean;
}

export default function ChatArea() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // auto-scroll on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const canSend = text.trim().length > 0 && !busy;

  const send = async (question: string) => {
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    const pendingMsg: Message = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setBusy(true);
    try {
      const res = await askQuestion(question);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, content: res.answer, sources: res.sources, pending: false }
            : m,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, content: msg, error: true, pending: false }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    void send(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <main className="chat">
      <div className="chat__scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat__welcome">
            <div className="chat__welcome-logo" aria-hidden="true">
              <Sparkles size={28} />
            </div>
            <h1 className="chat__welcome-title">
              Inicia una conversación o sube documentos
            </h1>
          </div>
        ) : (
          <ul className="chat__messages" aria-label="Mensajes">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className={`chat__message chat__message--${msg.role} ${msg.error ? "chat__message--error" : ""}`}
              >
                <div className="chat__bubble">
                  {msg.pending ? (
                    <span className="chat__typing" aria-label="Pensando">
                      <span /><span /><span />
                    </span>
                  ) : (
                    <span className="chat__bubble-text">{msg.content}</span>
                  )}
                  {msg.sources && msg.sources.length > 0 && (
                    <details className="chat__sources">
                      <summary>
                        {msg.sources.length} fuente{msg.sources.length === 1 ? "" : "s"}
                      </summary>
                      <ul>
                        {msg.sources.map((s, i) => (
                          <li key={s.id}>
                            <span className="chat__source-label">
                              Fuente {i + 1}
                              {s.source ? ` — ${s.source}` : ""}
                              <span className="chat__source-sim">
                                {(s.similarity * 100).toFixed(1)}%
                              </span>
                            </span>
                            <span className="chat__source-excerpt">{s.excerpt}…</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="chat__composer" onSubmit={handleSubmit}>
        <div className="chat__composer-inner">
          <textarea
            ref={textareaRef}
            className="chat__textarea"
            placeholder={
              busy ? "Esperando respuesta…" : "Escribe un mensaje…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Mensaje"
            disabled={busy}
          />
          <button
            type="submit"
            className={`chat__send ${canSend ? "chat__send--active" : ""}`}
            disabled={!canSend}
            aria-label="Enviar mensaje"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="chat__disclaimer">
          Las respuestas usan solo los documentos que subas.
        </p>
      </form>
    </main>
  );
}
