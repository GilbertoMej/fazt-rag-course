import { Plus, MessageSquare, X, Settings, User } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const mockChats = [
  { id: "1", title: "Bienvenida a Claude" },
  { id: "2", title: "Resumen de TypeScript" },
  { id: "3", title: "Patrones de React" },
  { id: "4", title: "Diseño de base de datos" },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={`sidebar__overlay ${isOpen ? "sidebar__overlay--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`sidebar ${isOpen ? "sidebar--open" : ""}`}
        aria-label="Navegación de chats"
        aria-hidden={!isOpen}
      >
        <div className="sidebar__header">
          <button
            type="button"
            className="sidebar__close"
            onClick={onClose}
            aria-label="Cerrar panel lateral"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="sidebar__new-chat">
          <Plus size={16} aria-hidden="true" />
          <span>Nuevo chat</span>
        </button>

        <nav className="sidebar__section" aria-label="Chats recientes">
          <h2 className="sidebar__section-title">Recientes</h2>
          <ul className="sidebar__chat-list">
            {mockChats.map((chat) => (
              <li key={chat.id}>
                <button type="button" className="sidebar__chat-item">
                  <MessageSquare size={14} aria-hidden="true" />
                  <span className="sidebar__chat-title">{chat.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar__footer">
          <button type="button" className="sidebar__footer-btn">
            <Settings size={16} aria-hidden="true" />
            <span>Ajustes</span>
          </button>
          <button type="button" className="sidebar__user">
            <span className="sidebar__avatar" aria-hidden="true">
              <User size={14} />
            </span>
            <span>Usuario</span>
          </button>
        </div>
      </aside>
    </>
  );
}