import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Trash2, ChevronLeft, Image as ImageIcon, X, Loader2, MessageCircle, Copy, Check, Paperclip, Tag, FileText, Megaphone, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthToken } from '../../services/authService';

interface Message {
  type: 'user' | 'ai';
  content: string;
  images?: string[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

/** 从服务端加载历史消息（与PC共用数据） */
const loadServerMessages = async (): Promise<Message[]> => {
  try {
    const token = getAuthToken();
    if (!token) return [];
    const res = await fetch('/api/chat/deepseek/messages', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.messages && data.messages.length > 0) return data.messages;
    }
  } catch {}
  return [];
};

/** 保存消息到服务端（与PC共用数据） */
const saveServerMessages = async (messages: Message[]) => {
  try {
    const token = getAuthToken();
    if (!token) return;
    await fetch('/api/chat/deepseek/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: messages.slice(-30) }),
    });
  } catch {}
};

const QUICK_ACTIONS = [
  { id: 'title', label: '产品标题', desc: '多平台标题优化', icon: Tag, prompt: '请为我撰写一个独立站/亚马逊/TikTok的产品标题，我的产品是：' },
  { id: 'desc', label: '产品描述', desc: '消费者视角卖点', icon: FileText, prompt: '请站在消费者角度，用简短的几句话描述这个产品的吸引力和价值，我的产品是：' },
  { id: 'intro', label: '产品简介', desc: '材质/功能介绍', icon: FileText, prompt: '请为我撰写这个产品的详细简介，包括材质、规格、功能、适用场景等信息，我的产品是：' },
  { id: 'amazon', label: '亚马逊A+', desc: '详情页文案', icon: Tag, prompt: '请为我的产品写一个亚马逊A+页面描述，包括产品故事、关键卖点、规格参数，我的产品是：' },
  { id: 'tiktok', label: 'TikTok脚本', desc: '带货视频文案', icon: Megaphone, prompt: '请为我的产品写一个TikTok视频口播脚本，包括开场钩子、产品展示、行动号召，我的产品是：' },
  { id: 'sell', label: '卖点提炼', desc: '痛点+解决方案', icon: Zap, prompt: '请为我的产品写一个电商详情页的产品卖点清单，突出解决用户哪些痛点，我的产品是：' },
];

// Markdown 渲染（简化版）
const MarkdownText: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '') { elements.push(<div key={`br-${i}`} className="h-2" />); i++; continue; }

    // 分隔线：---  ***  ——— 等
    if (/^[-—*]{3,}$/.test(line) || /^—+$/.test(line)) {
      elements.push(<div key={i} className="border-t border-white/[0.06] my-2" />);
      i++; continue;
    }

    // ### / ## 标题
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      elements.push(<h3 key={i} className="text-sm font-bold text-white mt-3 mb-1">{headingMatch[1]}</h3>);
      i++; continue;
    }

    // **整行加粗**
    if (/^\*\*.+\*\*$/.test(line)) {
      elements.push(<p key={i} className="text-sm font-semibold text-white">{line.replace(/^\*\*|\*\*$/g, '')}</p>);
      i++; continue;
    }

    // 列表项 - 或 *
    if (/^[-*]\s/.test(line)) {
      const text = line.replace(/^[-*]\s+/, '');
      elements.push(<div key={i} className="flex gap-2 text-sm text-white/50"><span className="text-white/30 mt-1 flex-shrink-0">•</span><span>{renderInline(text)}</span></div>);
      i++; continue;
    }

    // 编号列表 1. 1、 1.
    if (/^\d+[.、）)]?\s/.test(line)) {
      const num = line.match(/^\d+/)?.[0] || '';
      const text = line.replace(/^\d+[.、）)]?\s+/, '');
      elements.push(<div key={i} className="flex gap-2 text-sm text-white/50"><span className="text-white/30 w-4 flex-shrink-0 text-right">{num}.</span><span className="flex-1">{renderInline(text)}</span></div>);
      i++; continue;
    }

    // 表格行
    if (line.startsWith('|')) {
      const cells = line.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
      // 跳过表头分隔行 |---|---|
      if (cells.length > 0 && cells.every((c: string) => /^[-:]+$/.test(c.replace(/\s/g, '')))) { i++; continue; }
      // 跳过表格后的空行
      elements.push(<div key={i} className="flex gap-1 text-sm text-white/50 bg-white/[0.06] rounded-lg px-3 py-1.5 my-1">{cells.map((c: string, j: number) => <span key={j} className="flex-1 text-xs">{renderInline(c)}</span>)}</div>);
      i++; continue;
    }

    // 普通段落 — 内联渲染加粗
    elements.push(<p key={i} className="text-sm text-white/50 leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
};

/** 内联渲染：加粗、删除标记等 */
const renderInline = (text: string): React.ReactNode => {
  // 去掉 **加粗** 标记
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((p, j) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={j} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
    }
    // 去掉多余的 * 标记（非加粗的单个*）
    return p.replace(/\*/g, '');
  });
};

interface ChatPageProps { onBack?: () => void; }

export const ChatPage: React.FC<ChatPageProps> = ({ onBack }) => {
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showList, setShowList] = useState(true);
  const notifyChatMode = (inChat: boolean) => {
    window.dispatchEvent(new CustomEvent('mobile-chat-mode', { detail: inChat }));
  };
  useEffect(() => { notifyChatMode(!showList); }, [showList]);
  const [uploadedFiles, setUploadedFiles] = useState<{ preview: string; base64: string }[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [initialized, setInitialized] = useState(false);

  const activeConv = conversations.find(c => c.id === activeConvId);

  // 从服务端加载历史（与PC共用数据）
  useEffect(() => {
    if (initialized || !isAuthenticated) return;
    loadServerMessages().then(stored => {
      if (stored.length > 0) {
        setConversations([{
          id: 'server',
          title: stored[0]?.content?.substring(0, 20) || 'AI对话',
          messages: stored,
          updatedAt: Date.now(),
        }]);
        setActiveConvId('server');
      }
      setInitialized(true);
    });
  }, [initialized, isAuthenticated]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeConv?.messages, isLoading]);

  const createNewChat = useCallback(() => {
    // 清空当前对话（与服务端同步，使用同一ID）
    setConversations(prev => {
      const existing = prev.find(c => c.id === 'server');
      if (existing) {
        return [{ ...existing, messages: [], title: '新对话', updatedAt: Date.now() }];
      }
      return [{ id: 'server', title: '新对话', messages: [], updatedAt: Date.now() }];
    });
    setActiveConvId('server');
    setShowList(false);
    setUploadedFiles([]);
  }, []);

  const deleteConv = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'server') {
      // 清空服务端同步的对话
      setConversations(prev => prev.map(c => c.id === 'server' ? { ...c, messages: [], title: '新对话', updatedAt: Date.now() } : c));
      saveServerMessages([]);
    } else {
      setConversations(prev => prev.filter(c => c.id !== id));
    }
    if (activeConvId === id) { setActiveConvId('server'); }
  }, [activeConvId]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const newFiles: { preview: string; base64: string }[] = [];
    for (let i = 0; i < Math.min(files.length, 4 - uploadedFiles.length); i++) {
      const f = files[i];
      const preview = URL.createObjectURL(f);
      const reader = new FileReader();
      const base64 = await new Promise<string>(resolve => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(f); });
      newFiles.push({ preview, base64 });
    }
    setUploadedFiles(prev => [...prev, ...newFiles].slice(0, 4));
    if (e.target) e.target.value = '';
  }, [uploadedFiles.length]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() && uploadedFiles.length === 0) return;

    const userMsg: Message = { type: 'user', content: input.trim(), images: uploadedFiles.map(f => f.base64) };
    const currentInput = input.trim();
    setInput('');

    const convId = 'server';
    setActiveConvId(convId);
    setShowList(false);
    setConversations(prev => {
      const existing = prev.find(c => c.id === convId);
      if (existing) {
        return prev.map(c => c.id === convId ? {
          ...c, messages: [...c.messages, userMsg], updatedAt: Date.now(),
          title: c.messages.length === 0 ? (currentInput.substring(0, 20) || '图片对话') : c.title,
        } : c);
      }
      return [...prev, { id: convId, title: currentInput.substring(0, 20) || '图片对话', messages: [userMsg], updatedAt: Date.now() }];
    });
    // 立即保存用户消息到服务端
    saveServerMessages((conversations.find(c => c.id === 'server')?.messages || []).concat({
      type: 'user', content: currentInput || (uploadedFiles.length > 0 ? '[图片]' : '')
    }));
    setIsLoading(true);
    setUploadedFiles([]);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('请先登录');

      // 构建历史消息（OpenAI 格式，支持 vision）
      const allMsgs = (conversations.find(c => c.id === 'server')?.messages || []);
      const historyMessages = allMsgs.map(m => ({
        role: m.type === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));
      // 当前消息：如果有图片则用 vision 格式
      const hasImages = uploadedFiles.length > 0;
      const userText = currentInput || (hasImages ? '分析这些图片' : '');
      historyMessages.push({
        role: 'user',
        content: hasImages
          ? [
              { type: 'text', text: userText },
              ...uploadedFiles.map(f => ({ type: 'image_url' as const, image_url: { url: f.base64 } }))
            ]
          : userText,
      });

      const res = await fetch('/api/chat/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: historyMessages }),
      });

      if (res.status === 401) throw new Error('登录已过期');
      const data = await res.json();
      const aiContent = data.success ? data.content : `请求失败: ${data.error || data.message || '请重试'}`;
      const aiMsg: Message = { type: 'ai', content: aiContent };

      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() } : c));
      saveServerMessages(allMsgs.concat({ type: 'user' as const, content: currentInput || '' }, aiMsg));
      window.dispatchEvent(new Event('credits-updated'));
    } catch (err) {
      const errMsg: Message = { type: 'ai', content: '网络异常，请稍后重试。' };
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() } : c));
      saveServerMessages(allMsgs.concat({ type: 'user' as const, content: currentInput || '' }, errMsg));
    } finally { setIsLoading(false); }
  }, [input, isLoading, activeConvId, uploadedFiles]);

  const handleQuickAction = useCallback((prompt: string) => {
    setInput(prompt);
  }, []);

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); }).catch(() => {});
  }, []);

  // 对话列表面
  if (showList) {
    return (
      <div>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white">AI 对话</h1>
            <button onClick={createNewChat} className="mobile-tap flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full text-xs font-medium shadow-lg shadow-blue-500/25">
              <Plus size={14} /> 新对话
            </button>
          </div>
        </div>
        <div className="px-4 pb-6 space-y-2">
          {!initialized ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-3 shadow-sm border border-white/[0.06]">
                <MessageCircle size={28} className="text-white/20" />
              </div>
              <p className="text-sm font-medium text-white/30 mb-4">开始你的第一段 AI 对话</p>
              <div className="flex flex-wrap justify-center gap-2 px-4">
                {QUICK_ACTIONS.map(qa => {
                  const Icon = qa.icon;
                  return (
                    <button key={qa.id} onClick={() => { createNewChat(); setTimeout(() => handleQuickAction(qa.prompt), 100); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] rounded-full border border-white/[0.06] text-xs text-white/40 mobile-tap">
                      <Icon size={13} className="text-white/30" /> {qa.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            conversations.map(conv => (
              <button key={conv.id} onClick={() => { setActiveConvId(conv.id); setShowList(false); }}
                className="mobile-tap w-full bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/25">
                  <span className="text-white text-xs font-bold">{conv.title.charAt(0) || '?'}</span>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{conv.title}</p>
                  <p className="text-xs text-white/30 truncate mt-0.5">{conv.messages[conv.messages.length - 1]?.content || '空对话'}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-white/20">{new Date(conv.updatedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                  <span onClick={(e) => deleteConv(conv.id, e)} className="mobile-tap w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/10 cursor-pointer">
                    <Trash2 size={13} className="text-white/20" />
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // 聊天视图
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0a] flex-shrink-0">
        <button onClick={() => { setShowList(true); setActiveConvId(null); }} className="mobile-tap w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ChevronLeft size={18} className="text-white/40" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{activeConv?.title || 'AI 对话'}</p>
        </div>
      </div>

      {/* Quick actions */}
      {(!activeConv || activeConv.messages.length === 0) && (
        <div className="px-4 pt-3 pb-2 mobile-scroll-x">
          <div className="flex gap-2">
            {QUICK_ACTIONS.map(qa => {
              const Icon = qa.icon;
              return (
                <button key={qa.id} onClick={() => handleQuickAction(qa.prompt)}
                  className="mobile-tap flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.06] rounded-full text-xs font-medium text-white/50 border border-white/[0.06]">
                  <Icon size={14} className="text-white/40" /> {qa.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {(!activeConv || activeConv.messages.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
                <Sparkles size={28} className="text-white" />
            </div>
            <p className="text-sm font-medium text-white">电商文案助手</p>
            <p className="text-xs text-white/30 mt-1 text-center px-8">产品标题、卖点提炼、TikTok脚本、产品描述</p>
          </div>
        ) : (
          activeConv.messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-bubble-in`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                msg.type === 'user'
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-white/[0.04] border border-white/[0.06] text-white rounded-bl-md'
              }`}>
                {msg.type === 'ai' ? (
                  <div className="relative">
                    <MarkdownText content={msg.content} />
                    <button onClick={() => handleCopy(msg.content, idx)}
                      className={`mt-2 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                        copiedIdx === idx ? 'text-green-400 bg-green-500/10' : 'text-white/30 hover:text-white/40'
                      }`}>
                      {copiedIdx === idx ? <><Check size={11} /> 已复制</> : <><Copy size={11} /> 复制</>}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {msg.images.map((img, i) => (
                          <img key={i} src={img} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/20" />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start animate-bubble-in">
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="text-white/30 animate-spin" />
                <span className="text-sm text-white/30">思考中...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0a] px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {/* Uploaded files preview */}
        {uploadedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 px-1">
            {uploadedFiles.map((f, i) => (
              <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/[0.06]">
                <img src={f.preview} className="w-full h-full object-cover" />
                <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))} className="absolute top-0 right-0 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center">
                  <X size={8} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 bg-white/[0.06] rounded-2xl px-3 py-2 min-h-[44px]">
          {/* 上传按钮 - 输入框超过2行时隐藏 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`mobile-tap flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.04] transition-all duration-150 ${
              input.length > 60 ? 'opacity-0 w-0 px-0 overflow-hidden ml-[-8px]' : ''
            }`}
          >
            <Paperclip size={17} className="text-white/30" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // 自适应高度
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                // 重置高度
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
              }
            }}
            placeholder="输入产品名称或描述..."
            rows={1}
            className={`flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none py-1 resize-none leading-relaxed ${
              input.length > 60 ? 'ml-0' : ''
            }`}
          />
          <button onClick={sendMessage} disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading}
            className={`mobile-tap flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              (input.trim() || uploadedFiles.length > 0) && !isLoading ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-white/[0.06] text-white/20'
            }`}>
            <Send size={15} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
      </div>
    </div>
  );
};
