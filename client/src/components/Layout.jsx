import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import ChatBot from './ChatBot.jsx';
import { useState } from 'react';

export default function Layout() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar onOpenChat={() => setChatOpen(true)} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
      <ChatBot open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
