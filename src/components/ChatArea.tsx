import { useState, useRef, useEffect } from "react";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";

export default function ChatArea() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const canSend = text.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <main className="chat">
      <div className="chat__scroll">
        <div className="chat__welcome">
          <div className="chat__welcome-logo" aria-hidden="true">
            <Sparkles size={28} />
          </div>
          <h1 className="chat__welcome-title">Inicia una conversación o sube documentos</h1>
        </div>
      </div>

      <form className="chat__composer" onSubmit={handleSubmit}>
        <div className="chat__composer-inner">
          <button
            type="button"
            className="chat__icon-btn"
            aria-label="Adjuntar archivo"
          >
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <textarea
            ref={textareaRef}
            className="chat__textarea"
            placeholder="Escribe un mensaje…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Mensaje"
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
