import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { DeepseekChatPage } from './DeepseekChatPage';
import { ConversationList } from '../../components/ConversationList';

interface Message {
  type: 'user' | 'ai';
  content: string;
  images?: string[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  uploadedImages: string[];
  generatedImages: any[];
  mode?: string;
}

const createConversation = (): Conversation => ({
  id: Date.now().toString(),
  title: '新对话',
  messages: [],
  uploadedImages: [],
  generatedImages: []
});

const getStorageKey = (prefix: string) => {
  try {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const userId = user.id || user.email || 'guest';
      return `${prefix}_${userId}`;
    }
  } catch {}
  return `${prefix}_guest`;
};

const saveState = (key: string, data: any) => {
  try {
    const conversations = (data.conversations || []).slice(-15);
    const cleanedData = {
      activeConversationId: data.activeConversationId,
      conversations: conversations.map((conv: any) => ({
        id: conv.id, title: conv.title, mode: conv.mode,
        messages: conv.messages?.slice(-20).map((msg: any) => ({
          type: msg.type, content: msg.content?.substring(0, 500)
        }))
      }))
    };
    localStorage.setItem(key, JSON.stringify(cleanedData));
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') localStorage.removeItem(key);
    else console.error('saveState error:', e);
  }
};

const loadState = (key: string) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

interface DeepseekChatPageWrapperProps {
  title?: string;
}

export const DeepseekChatPageWrapper: React.FC<DeepseekChatPageWrapperProps> = ({ title = '电商文案助手' }) => {
  const [conversations, setConversations] = useState<Conversation[]>([createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const storageKey = getStorageKey('deepseek_canvas_state');

  useEffect(() => {
    const saved = loadState(storageKey);
    if (saved?.conversations?.length > 0) {
      setConversations(saved.conversations);
      const savedId = saved.activeConversationId;
      const exists = saved.conversations.some((c: any) => c.id === savedId);
      setActiveConversationId(exists ? savedId : saved.conversations[0].id);
    } else {
      const newConv = createConversation();
      setConversations([newConv]);
      setActiveConversationId(newConv.id);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveState(storageKey, { conversations, activeConversationId });
  }, [conversations, activeConversationId, isLoaded]);

  const handleNewConversation = useCallback(() => {
    const newConv = createConversation();
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    if (conversations.length <= 1) return;
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeConversationId === id) setActiveConversationId(filtered[0].id);
      return filtered;
    });
  }, [conversations.length, activeConversationId]);

  const handleUpdateConversations = useCallback((updater: (prev: Conversation[]) => Conversation[]) => {
    setConversations(prev => {
      const updated = updater(prev);
      const activeConv = updated.find(c => c.id === activeConversationId);
      if (activeConv && activeConv.messages.length > 0) {
        const firstUserMsg = activeConv.messages.find(m => m.type === 'user');
        if (firstUserMsg && activeConv.title === '新对话') {
          activeConv.title = firstUserMsg.content.substring(0, 20);
        }
      }
      return updated;
    });
  }, [activeConversationId]);

  const handleUpdateMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    handleUpdateConversations(prev => prev.map(c =>
      c.id === activeConversationId ? { ...c, messages: updater(c.messages || []) } : c
    ));
  }, [activeConversationId, handleUpdateConversations]);

  const activeConv = conversations.find(c => c.id === activeConversationId);
  const messages = activeConv?.messages || [];

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Sparkles size={20} className="text-gray-400 animate-pulse" />
          </div>
          <p className="text-xs text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0 h-full bg-white">
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <DeepseekChatPage
          messages={messages}
          onUpdateMessages={handleUpdateMessages}
          conversationTitle={activeConv?.title || title}
        />
      </div>
    </div>
  );
};
