import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Copy, Check, Paperclip, FileText, Image, X, Tag, MessageSquare, Megaphone, Zap, ArrowUpRight } from 'lucide-react';
import { getAuthToken } from '../../services/authService';

const MarkdownText: React.FC<{ content: string }> = ({ content }) => {
  const safeContent = typeof content === 'string' ? content : JSON.stringify(content);

  const renderMarkdown = (mdText: string): React.ReactNode[] => {
    const lines = mdText.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let codeBlockCount = 0;

    const parseTable = (startIdx: number): { table: React.ReactNode; endIdx: number } | null => {
      const tableLines: string[] = [];
      let j = startIdx;
      while (j < lines.length && (lines[j].trim().startsWith('|') || lines[j].trim() === '')) {
        if (lines[j].trim()) tableLines.push(lines[j].trim());
        j++;
      }
      if (tableLines.length < 2) return null;
      const headerCells = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const alignRow = tableLines[1].trim();
      const aligns = headerCells.map(() => 'left' as string);
      if (alignRow.includes(':-')) {
        headerCells.forEach((_, idx) => {
          const cell = tableLines[1].split('|')[idx + 1] || '';
          if (cell.includes(':') && cell.endsWith(':')) aligns[idx] = 'right';
          else if (cell.includes(':')) aligns[idx] = 'center';
        });
      }
      const rows = tableLines.slice(2).map(row =>
        row.split('|').filter(c => c.trim()).map(c => c.trim())
      );
      const textAlign = aligns.map(a => a === 'left' ? 'text-left' : a === 'right' ? 'text-right' : 'text-center');
      const table = (
        <div className="overflow-x-auto my-3 rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {headerCells.map((cell, idx) => (
                  <th key={idx} className={`px-3 py-2 font-semibold text-gray-700 border-b border-gray-200 ${textAlign[idx]}`}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className={`px-3 py-2 text-gray-600 border-b border-gray-100 ${textAlign[cellIdx]}`}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      return { table, endIdx: j };
    };

    while (i < lines.length) {
      const line = lines[i].trim();
      const rawLine = lines[i];

      if (line === '') {
        elements.push(<div key={`br-${i}`} className="h-2" />);
        i++; continue;
      }

      if (rawLine.trim().startsWith('|')) {
        const result = parseTable(i);
        if (result) {
          elements.push(React.cloneElement(result.table as React.ReactElement<any>, { key: `table-${i}` }));
          i = result.endIdx;
          continue;
        }
      }

      if (line.startsWith('```')) {
        const codeLines: string[] = [];
        const firstLine = line.slice(3).trim();
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        const codeContent = codeLines.join('\n');
        const lang = firstLine || 'code';
        elements.push(
          <div key={`code-${codeBlockCount}`} className="my-3 rounded-lg overflow-hidden border border-gray-200">
            <div className="bg-gray-800 text-gray-300 text-[10px] px-3 py-1.5 font-mono flex items-center justify-between">
              <span>{lang}</span>
            </div>
            <pre className="bg-gray-900 text-gray-100 p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">
              <code>{codeContent || ' '}</code>
            </pre>
          </div>
        );
        codeBlockCount++;
        i++; continue;
      }

      if (line.startsWith('#### ')) {
        elements.push(<h4 key={`h-${i}`} className="text-xs font-semibold text-gray-900 mt-3 mb-1">{line.slice(5)}</h4>);
        i++; continue;
      }
      if (line.startsWith('### ')) {
        elements.push(<h3 key={`h-${i}`} className="text-sm font-bold text-gray-800 mt-3 mb-1">{line.slice(4)}</h3>);
        i++; continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={`h-${i}`} className="text-base font-bold text-gray-800 mt-4 mb-1.5">{line.slice(3)}</h2>);
        i++; continue;
      }
      if (line.startsWith('# ')) {
        elements.push(<h1 key={`h-${i}`} className="text-lg font-bold text-gray-800 mt-4 mb-2">{line.slice(2)}</h1>);
        i++; continue;
      }

      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('> ')) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <div key={`quote-${i}`} className="my-2 pl-3 border-l-2 border-blue-300 text-gray-600 text-sm leading-relaxed bg-blue-50/50 rounded-r-lg py-2 pr-3">
            {quoteLines.map((q, idx) => <p key={idx}>{renderInline(q)}</p>)}
          </div>
        );
        continue;
      }

      if (line.match(/^[-*+]\s/) || rawLine.match(/^\s*[-*+]\s/)) {
        const listItems: string[] = [];
        while (i < lines.length) {
          const currLine = lines[i].trim();
          const currRaw = lines[i];
          if (currLine.match(/^[-*+]\s/) || currRaw.match(/^\s*[-*+]\s/)) {
            listItems.push(currLine.replace(/^[-*+]\s/, ''));
            i++;
          } else break;
        }
        elements.push(
          <ul key={`ul-${i}`} className="space-y-1 my-2">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-[7px] flex-shrink-0" />
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (line.match(/^\d+\.\s/) || rawLine.match(/^\s*\d+\.\s/)) {
        const listItems: string[] = [];
        let startNum = 1;
        const numMatch = rawLine.match(/^\s*(\d+)\.\s/);
        if (numMatch) startNum = parseInt(numMatch[1]);
        while (i < lines.length) {
          const currLine = lines[i].trim();
          const currRaw = lines[i];
          if (currLine.match(/^\d+\.\s/) || currRaw.match(/^\s*\d+\.\s/)) {
            listItems.push(currLine.replace(/^\d+\.\s/, ''));
            i++;
          } else break;
        }
        elements.push(
          <ol key={`ol-${i}`} className="space-y-1 my-2 list-none">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                <span className="w-5 h-5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium flex items-center justify-center mt-0.5 flex-shrink-0">
                  {startNum + idx}
                </span>
                <span className="pt-0.5">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      if (line.match(/^[-*_]{3,}$/)) {
        elements.push(<hr key={`hr-${i}`} className="my-3 border-gray-200" />);
        i++; continue;
      }

      elements.push(
        <p key={`p-${i}`} className="text-sm text-gray-700 my-1.5 leading-relaxed">
          {renderInline(line)}
        </p>
      );
      i++;
    }
    return elements;
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(<code key={key++} className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono">{codeMatch[1]}</code>);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      const boldMatch = remaining.match(/^\*\*([\s\S]+?)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={key++} className="font-bold text-[#171717]">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      const italicMatch = remaining.match(/^\*([^*\n]+?)\*/);
      if (italicMatch && !italicMatch[1].includes('\n')) {
        parts.push(<em key={key++} className="italic text-gray-500">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      const strikeMatch = remaining.match(/^~~([^~]+)~~/);
      if (strikeMatch) {
        parts.push(<del key={key++} className="line-through text-gray-400">{strikeMatch[1]}</del>);
        remaining = remaining.slice(strikeMatch[0].length);
        continue;
      }
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(<a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-[#171717]">{linkMatch[1]}</a>);
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }
      if (remaining.startsWith('**')) {
        remaining = remaining.slice(2);
        continue;
      }
      if (remaining.startsWith('*')) {
        remaining = remaining.slice(1);
        continue;
      }
      if (remaining.startsWith('~~')) {
        remaining = remaining.slice(2);
        continue;
      }
      const specialChars = /[`*_~\[\]()]/;
      const nextSpecial = remaining.search(specialChars);
      if (nextSpecial === -1) {
        parts.push(remaining); break;
      } else if (nextSpecial === 0) {
        parts.push(remaining[0]); remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial)); remaining = remaining.slice(nextSpecial);
      }
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  return <div className="space-y-1">{renderMarkdown(safeContent)}</div>;
};

interface Message {
  type: 'user' | 'ai';
  content: string;
  credits?: number;
}

interface DeepseekChatPageProps {
  messages: Message[];
  onUpdateMessages: (updater: (prev: Message[]) => Message[]) => void;
  onFirstMessage?: (text: string) => void;
  conversationTitle?: string;
}

const loadStoredMessages = async (): Promise<Message[]> => {
  try {
    const token = getAuthToken();
    if (!token) return [];
    const res = await fetch('/api/chat/deepseek/messages', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return [];
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.messages && data.messages.length > 0) return data.messages;
    }
  } catch {}
  return [];
};

const QUICK_ACTIONS = [
  { id: 'title', label: '产品标题', desc: '多平台标题优化', icon: Tag, color: 'from-amber-500 to-orange-500', prompt: '请为我撰写一个独立站/亚马逊/TikTok的产品标题，我的产品是：' },
  { id: 'desc', label: '产品描述', desc: '消费者视角卖点', icon: MessageSquare, color: 'from-emerald-500 to-teal-500', prompt: '请站在消费者角度，用简短的几句话描述这个产品的吸引力和价值，我的产品是：' },
  { id: 'intro', label: '产品简介', desc: '材质/功能介绍', icon: FileText, color: 'from-blue-500 to-indigo-500', prompt: '请为我撰写这个产品的详细简介，包括材质、规格、功能、适用场景等信息，我的产品是：' },
  { id: 'amazon', label: '亚马逊A+', desc: '详情页文案', icon: Tag, color: 'from-violet-500 to-purple-500', prompt: '请为我的产品写一个亚马逊A+页面描述，包括产品故事、关键卖点、规格参数，我的产品是：' },
  { id: 'tiktok', label: 'TikTok脚本', desc: '带货视频文案', icon: Megaphone, color: 'from-pink-500 to-rose-500', prompt: '请为我的产品写一个TikTok视频口播脚本，包括开场钩子、产品展示、行动号召，我的产品是：' },
  { id: 'sell', label: '卖点提炼', desc: '痛点+解决方案', icon: Zap, color: 'from-cyan-500 to-sky-500', prompt: '请为我的产品写一个电商详情页的产品卖点清单，突出解决用户哪些痛点，我的产品是：' }
];

export const DeepseekChatPage: React.FC<DeepseekChatPageProps> = ({ messages, onUpdateMessages, onFirstMessage, conversationTitle }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; preview: string; base64: string; pdfUrl?: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (initialized) return;
    const token = getAuthToken();
    if (!token) { setInitialized(true); return; }
    loadStoredMessages().then(stored => {
      if (stored.length > 0) onUpdateMessages(() => stored);
      setInitialized(true);
    });
  }, [initialized, onUpdateMessages]);

  useEffect(() => {
    if (!initialized || messages.length === 0) return;
    const timer = setTimeout(() => {
      const saveMessages = async () => {
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
      saveMessages();
    }, 2000);
    return () => clearTimeout(timer);
  }, [messages, initialized]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    for (const file of files) {
      if (uploadedFiles.length >= 5) break;
      if (file.size > 10 * 1024 * 1024) { alert(`文件 ${file.name} 太大！最大支持 10MB`); continue; }
      try {
        const base64 = await fileToBase64(file);
        const isImage = file.type.startsWith('image/');
        const preview = isImage ? base64 : file.name;
        let pdfUrl: string | null = null;
        if (!isImage && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
          try {
            const token = getAuthToken();
            const res = await fetch('/api/upload/pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ fileName: file.name, base64Data: base64.split(',')[1], contentType: file.type })
            });
            const data = await res.json();
            if (data.success && data.url) pdfUrl = data.url;
          } catch (err) { console.error('PDF上传失败:', err); }
        }
        setUploadedFiles(prev => [...prev, { file, preview, base64, pdfUrl }]);
      } catch (err) { console.error('文件读取失败:', err); }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== index));

  const handleSend = async () => {
    const text = prompt.trim();
    if ((!text || text.trim() === '') && uploadedFiles.length === 0) return;
    if (loading) return;
    setPrompt('');
    if (textRef.current) textRef.current.style.height = 'auto';
    if (messages.length === 0) onFirstMessage?.(text);

    const historyMessages: { role: string; content: any }[] = [
      { role: 'system', content: '你是一个专业电商产品文案撰写助手。你需要掌握：1.平台产品标题撰写 2.简短产品描述 3.产品简介。回复原则：先理解用户产品，再针对性给出文案。' },
      ...messages.slice(-10).map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }))
    ];
    if (historyMessages.length === 0) historyMessages.push({ role: 'user', content: ' ' });

    let currentContent: any = text;
    if (uploadedFiles.length > 0) {
      const contentParts: any[] = [];
      for (const upload of uploadedFiles) {
        const file = upload.file;
        if (file.type.startsWith('image/')) {
          contentParts.push({ type: 'image_url', image_url: { url: upload.base64.startsWith('data:') ? upload.base64 : `data:${file.type};base64,${upload.base64}` } });
        } else if (upload.pdfUrl) {
          contentParts.push({ type: 'text', text: `请分析这个PDF文档: ${upload.pdfUrl}` });
        }
      }
      if (text.trim()) contentParts.push({ type: 'text', text });
      currentContent = contentParts;
    }

    historyMessages.push({ role: 'user', content: currentContent });
    const userMsgContent = uploadedFiles.length > 0 ? (text || '上传文件') + ` [${uploadedFiles.length}个附件]` : text;
    onUpdateMessages(prev => [...prev, { type: 'user', content: userMsgContent }]);
    setUploadedFiles([]);
    setLoading(true);

    try {
      const token = getAuthToken();
      if (!token) { onUpdateMessages(prev => [...prev, { type: 'ai', content: '请先登录后再使用' }]); setLoading(false); return; }
      const res = await fetch('/api/chat/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: historyMessages, model: selectedModel }),
      });
      if (res.status === 401) { onUpdateMessages(prev => [...prev, { type: 'ai', content: '登录已过期，请刷新页面或重新登录' }]); setLoading(false); return; }
      const data = await res.json();
      onUpdateMessages(prev => [...prev, { type: 'ai', content: data.success ? data.content : `请求失败: ${data.message || data.error || '请重试'}` }]);
    } catch (e: any) {
      onUpdateMessages(prev => [...prev, { type: 'ai', content: `网络错误: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  const copyMsg = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-[#E5E5E5] flex-shrink-0 bg-[#F7F7F7]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <h1 className="text-base font-semibold text-[#171717]">电商文案助手</h1>
          <span className="px-2 py-0.5 text-[10px] text-white bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl font-medium">Gemini</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto h-0 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 pb-8">
            {/* Logo */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center mb-5 shadow-lg">
              <Sparkles size={28} className="text-white" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1">电商文案助手</h2>
            <p className="text-sm text-gray-400 mb-8 max-w-xs text-center">选择功能或直接输入产品信息，AI 帮你快速生成专业文案</p>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl w-full">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => { setPrompt(action.prompt); textRef.current?.focus(); }}
                  className="group relative bg-[#F7F7F7] hover:bg-white border border-transparent hover:border-gray-200 rounded-xl p-4 text-left transition-all hover:shadow-md"
                >
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3 shadow-sm`}>
                    <action.icon size={16} className="text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-0.5">{action.label}</h3>
                  <p className="text-[11px] text-gray-400">{action.desc}</p>
                  <ArrowUpRight size={12} className="absolute top-3 right-3 text-gray-200 group-hover:text-gray-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-5 py-5 space-y-5">
            {messages.map((msg, idx) => {
              const isUser = msg.type === 'user';
              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`group ${isUser ? 'max-w-[75%]' : 'max-w-full w-full'}`}>
                    {isUser ? (
                      <div className="bg-[#171717] text-white rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed break-words">
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="bg-[#F5F5F5] text-[#171717] rounded-2xl rounded-bl-md px-5 py-4 text-sm leading-relaxed">
                          <MarkdownText content={msg.content} />
                          {loading && idx === messages.length - 1 && (
                            <span className="inline-block w-1.5 h-3.5 bg-[#171717] ml-1 animate-pulse rounded align-middle" />
                          )}
                        </div>
                        <button
                          onClick={() => copyMsg(idx, msg.content)}
                          className="absolute -bottom-8 right-0 p-1.5 rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="复制"
                        >
                          {copiedIdx === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#F5F5F5] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#171717] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[#E5E5E5] px-4 py-3 bg-white">
        {uploadedFiles.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {uploadedFiles.map((upload, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                {upload.file.type.startsWith('image/') ? (
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200">
                    <img src={upload.preview} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-gray-200 flex flex-col items-center justify-center gap-1 bg-gray-50">
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-[9px] text-gray-400 max-w-[56px] truncate">{upload.file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeFile(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 bg-[#F5F5F5] rounded-2xl px-4 py-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#E8E8E8] transition-colors flex-shrink-0"
          >
            <Paperclip size={16} className="text-[#A3A3A3]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <textarea
            ref={textRef}
            value={prompt}
            onChange={e => {
              setPrompt(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入产品信息或描述需求..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#171717] placeholder:text-[#BDBDBD] resize-none outline-none max-h-[150px] py-1"
          />
          <button
            onClick={handleSend}
            disabled={(!prompt.trim() && uploadedFiles.length === 0) || loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#171717] text-white hover:bg-[#333] transition-colors disabled:bg-[#D4D4D4] disabled:text-[#A3A3A3] flex-shrink-0"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};
