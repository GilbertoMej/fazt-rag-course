import { useState, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatArea from "./components/ChatArea";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className={`app ${sidebarOpen ? "app--sidebar-open" : ""}`}>
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <div className="app__main">
        <TopBar onToggleSidebar={toggleSidebar} />
        <ChatArea />
      </div>
    </div>
  );
}