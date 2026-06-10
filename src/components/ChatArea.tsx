import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ModeSelector, ChatMode } from './chat/ModeSelector';
import { DeepseekChatPage } from '../pages/chat/DeepseekChatPage';

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

interface ChatAreaProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  onUpdateConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
  isDialog?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversations,
  activeConversationId,
  onUpdateConversations,
  isDialog,
}) => {
  const [title, setTitle] = useState('新对话');

  // 缓存每个对话最后使用的模式（兼容旧对话没有 mode 字段的情况）
  const modeCacheRef = useRef<Record<string, ChatMode>>({});
  // 新建空对话时的默认模式
  const [pendingMode, setPendingMode] = useState<ChatMode>(() => (localStorage.getItem('sf_chatMode') as ChatMode) || 'deepseek-chat');

  const activeConv = conversations.find(c => c.id === activeConversationId);
  const messages = activeConv?.messages || [];

  // 确定当前对话的有效模式：
  // 1. 对话自身有 mode → 用它的
  // 2. 对话无 mode 但缓存里有 → 用缓存的
  // 3. 空对话（无 mode 无消息）→ 用 pendingMode
  const effectiveMode = activeConv?.mode
    ? (activeConv.mode as ChatMode)
    : (modeCacheRef.current[activeConversationId] || pendingMode);

  const isLocked = (activeConv?.messages?.length || 0) > 0;

  // 切换对话时，更新缓存、重置标题
  useEffect(() => {
    setTitle('新对话');
    // 如果对话有 mode，更新缓存
    if (activeConv?.mode) {
      modeCacheRef.current[activeConversationId] = activeConv.mode as ChatMode;
    }
  }, [activeConversationId]);

  // 如果对话已有消息，更新标题
  useEffect(() => {
    if (messages.length > 0) {
      const first = messages.find(m => m.type === 'user');
      if (first) {
        const short = first.content.length > 18 ? first.content.substring(0, 18) + '...' : first.content;
        setTitle(short);
      }
    }
  }, [activeConversationId]);

  // 用户切换模式时：保存到对话 + 更新缓存 + 更新 pendingMode
  const handleModeChange = useCallback((mode: ChatMode) => {
    setPendingMode(mode);
    localStorage.setItem('sf_chatMode', mode);
    modeCacheRef.current[activeConversationId] = mode;
    onUpdateConversations(prev => prev.map(c =>
      c.id === activeConversationId ? { ...c, mode } : c
    ));
  }, [activeConversationId, onUpdateConversations]);

  const handleUpdateMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    onUpdateConversations(prev => prev.map(c =>
      c.id === activeConversationId ? { ...c, messages: updater(c.messages || []) } : c
    ));
  }, [activeConversationId, onUpdateConversations]);

  const renderPanel = () => {
    const props = {
      messages,
      onUpdateMessages: handleUpdateMessages,
    };
    switch (effectiveMode) {
      case 'deepseek-chat':
        return <DeepseekChatPage {...props} />;
      default:
        return <DeepseekChatPage {...props} />;
    }
  };

  return (
    <div className={`flex-1 ${isDialog ? 'h-screen' : 'h-full'} flex bg-white min-w-0`}>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {!isDialog && (
          <div className="flex items-center justify-between px-6 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
            <span className="text-sm font-semibold text-[#171717] truncate max-w-[200px]">{title}</span>
            <div className="flex items-center gap-1">
              <ModeSelector mode={effectiveMode} onModeChange={handleModeChange} disabled={isLocked} />
            </div>
          </div>
        )}

        {/* Active Panel */}
        {renderPanel()}
      </div>
    </div>
  );
};
