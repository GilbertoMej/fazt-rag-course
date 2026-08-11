import { Menu, ChevronDown } from "lucide-react";

interface TopBarProps {
  onToggleSidebar: () => void;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu"
        onClick={onToggleSidebar}
        aria-label="Abrir panel lateral"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      <button type="button" className="topbar__model" aria-label="Modelo actual">
        <span>Claude</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      <div className="topbar__spacer" />
    </header>
  );
}