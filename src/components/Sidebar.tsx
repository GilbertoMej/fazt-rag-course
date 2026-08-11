import { Plus, X, Settings, User } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

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

        <div className="sidebar__empty">
          <p>Sube documentos desde el chat para empezar.</p>
        </div>

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
