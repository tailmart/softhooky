import React, { useState } from 'react';
import { Plus, Search, X, MessageSquare, Trash2, ArrowLeft, Check, Hash, Sparkles } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  messages: Array<{ type: 'user' | 'ai'; content: string; images?: string[] }>;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations, activeConversationId, onSelectConversation, onDeleteConversation, onNewConversation
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.messages.some(msg => msg.content?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredConversations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredConversations.map(c => c.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selected.size === 0) return;
    Array.from(selected).forEach(id => {
      if (conversations.length > 1) onDeleteConversation(id);
    });
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleExitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const formatDate = (id: string) => {
    const timestamp = parseInt(id);
    if (isNaN(timestamp)) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="w-[260px] h-full flex flex-col flex-shrink-0 bg-gray-50/80 border-r border-gray-200">
      {/* 顶部 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">对话历史</h2>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setSelectMode(true)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="选择">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </button>
            <button onClick={onNewConversation} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="新建">
              <Plus size={16} className="text-gray-400" />
            </button>
          </div>
        </div>
        <button onClick={onNewConversation} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 hover:bg-gray-800 rounded-xl text-white transition-all text-xs font-medium">
          <Plus size={14} />
          新建对话
        </button>
      </div>

      {/* 搜索 */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
          />
        </div>
      </div>

      {/* 选择模式工具栏 */}
      {selectMode && (
        <div className="mx-3 mb-2 px-3 py-2 bg-blue-50 rounded-lg flex items-center justify-between border border-blue-100">
          <button onClick={handleExitSelectMode} className="text-blue-500 hover:text-blue-600 transition-colors">
            <ArrowLeft size={14} />
          </button>
          <span className="text-[11px] text-blue-600 font-medium">{selected.size} 项</span>
          <button onClick={toggleAll} className="text-[11px] text-blue-400 hover:text-blue-500 transition-colors">
            {selected.size === filteredConversations.length ? '取消' : '全选'}
          </button>
          {selected.size > 0 && (
            <button onClick={handleBatchDelete} className="text-red-500 hover:text-red-600 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-none">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 px-4">
            <MessageSquare size={28} className="mb-2 opacity-30" />
            <p className="text-xs text-center">暂无对话</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredConversations.map(conv => {
              const isActive = conv.id === activeConversationId;
              const isSelected = selected.has(conv.id);
              const isHovered = hoveredId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => selectMode ? toggleSelect(conv.id) : onSelectConversation(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isActive && !selectMode
                      ? 'bg-white shadow-sm border border-gray-200'
                      : isHovered
                        ? 'bg-white/50'
                        : ''
                  }`}
                >
                  {selectMode ? (
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-blue-500' : 'border border-gray-300 bg-white'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                  ) : (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'bg-gray-900' : 'bg-gray-100'
                    }`}>
                      <Hash size={14} className={isActive ? 'text-white' : 'text-gray-400'} />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] truncate ${
                      isActive && !selectMode ? 'text-gray-900 font-medium' : 'text-gray-600'
                    }`}>
                      {conv.title}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(conv.id)}</p>
                  </div>

                  {!selectMode && isHovered && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <X size={12} className="text-gray-300" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
