import React from 'react';
import { ChatPanel } from '../../components/shared/ChatPanel';

export const AdminChatPage: React.FC = () => (
  <div className="animate-fadeIn">
    <h1 className="mb-4 text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Team Chat</h1>
    <ChatPanel basePath="/staff" selfId="admin" title="Admin Team Chat" />
  </div>
);
