import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Trash2, Save, Download, RotateCcw, Image as ImageIcon,
  Type, Wand2, Eye, X, Sparkles, Copy, Check, Upload, MousePointer2,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Layers, Boxes,
  Coins, CreditCard, History, Users, Gift, TrendingUp, User, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateImage, editImage } from '../../services/imageService';
import { getAvailableModels } from '../../services/modelService';
import { fileToDataUrl } from '../../services/cosService';
import { getPricing } from '../../services/pricingService';
import { imageLibraryService } from '../../services/imageLibraryService';
import { ImageLibraryModal } from '../../components/canvas/ImageLibraryModal';
import { CreditCheckModal } from '../../components/CreditCheckModal';
import { getCurrentUser } from '../../services/authService';
import { workflowService, WorkflowData } from '../../services/workflowService';
import { WORKFLOW_PRESETS, PRESET_CATEGORIES, WorkflowPreset } from './workflowPresets';

interface Position { x: number; y: number; }
interface NodeData { [key: string]: any; }
interface WorkflowNode { id: string; type: string; position: Position; data: NodeData; width?: number; height?: number; }
interface Connection { id: string; sourceId: string; sourcePort: string; targetId: string; targetPort: string; }
interface NodeTypeDef {
  type: string; label: string; icon: React.ElementType; color: string;
  description: string; category: string;
  inputs: { id: string; label: string }[];
  outputs: { id: string; label: string }[];
  defaultData: NodeData;
}

const ASPECT_RATIOS = ['智能', '1:1', '3:4', '4:3', '9:16', '16:9', '21:9'];
const RESOLUTIONS = ['2K', '4K'];
const ASPECT_DIMS: Record<string, [number, number]> = { '智能': [14,14], '1:1': [14,14], '3:4': [10.5,14], '4:3': [14,10.5], '9:16': [8,14], '16:9': [14,8], '21:9': [14,6] };

const NODE_TYPES: NodeTypeDef[] = [
  { type: 'start', label: '开始', icon: Play, color: '#2563EB', description: '工作流入口', category: '基础', inputs: [], outputs: [{ id: 'out', label: '' }], defaultData: { description: '', referenceImages: [] } },
  { type: 'prompt', label: '提示词优化', icon: Type, color: '#7C3AED', description: 'AI分析参考图并优化提示词', category: '基础', inputs: [{ id: 'in', label: '' }], outputs: [{ id: 'out', label: '' }], defaultData: { prompt: '', autoOptimize: true } },
  { type: 'imageAnalyze', label: '图片分析', icon: Sparkles, color: '#0891B2', description: 'AI分析图片内容并输出描述文字', category: '分析', inputs: [{ id: 'in', label: '' }], outputs: [{ id: 'out', label: '' }], defaultData: { instruction: '请用中文详细描述这张图片中的主体、背景、物品、光线、构图等所有视觉元素' } },
  { type: 'imageGen', label: '图片生成', icon: ImageIcon, color: '#2563EB', description: '选择模型生成图片', category: '生成', inputs: [{ id: 'in', label: '' }], outputs: [{ id: 'out', label: '' }], defaultData: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', batchSize: 1 } },
  { type: 'imageEdit', label: '图片编辑', icon: Wand2, color: '#D97706', description: '二次编辑图片', category: '生成', inputs: [{ id: 'in', label: '' }], outputs: [{ id: 'out', label: '' }], defaultData: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K' } },
  { type: 'output', label: '输出', icon: Eye, color: '#059669', description: '输出最终结果', category: '输出', inputs: [{ id: 'in', label: '' }], outputs: [], defaultData: { saveToLibrary: true } },
];

const CANVAS_GRID_SIZE = 20;
const NODE_WIDTH = 220;
const PORT_RADIUS = 5;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const MAX_REF_IMAGES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const DEFAULT_WORKFLOW = (): { nodes: WorkflowNode[]; connections: Connection[] } => ({
  nodes: [
    { id: 'node-start-1', type: 'start', position: { x: 80, y: 200 }, data: { description: '', referenceImages: [] } },
    { id: 'node-imgen-1', type: 'imageGen', position: { x: 420, y: 190 }, data: { model: 'nanobann2', aspectRatio: '1:1', resolution: '2K', batchSize: 1 } },
    { id: 'node-output-1', type: 'output', position: { x: 760, y: 200 }, data: { saveToLibrary: true } },
  ],
  connections: [
    { id: 'conn-1', sourceId: 'node-start-1', sourcePort: 'out', targetId: 'node-imgen-1', targetPort: 'in' },
    { id: 'conn-2', sourceId: 'node-imgen-1', sourcePort: 'out', targetId: 'node-output-1', targetPort: 'in' },
  ]
});

let idCounter = 0;
const genId = (prefix: string) => `${prefix}-${Date.now()}-${++idCounter}`;
const getNodeTypeDef = (type: string): NodeTypeDef => NODE_TYPES.find(nt => nt.type === type) || NODE_TYPES[0];

function getPortPosition(node: WorkflowNode, portId: string, isInput: boolean): Position {
  const def = getNodeTypeDef(node.type);
  const w = node.width || NODE_WIDTH;
  if (isInput) {
    const idx = def.inputs.findIndex(p => p.id === portId);
    const count = def.inputs.length;
    const spacing = Math.min(30, (w - 40) / Math.max(count, 1));
    const startX = w / 2 - (count - 1) * spacing / 2;
    return { x: node.position.x + startX + idx * spacing, y: node.position.y };
  } else {
    const idx = def.outputs.findIndex(p => p.id === portId);
    const count = def.outputs.length;
    const spacing = Math.min(30, (w - 40) / Math.max(count, 1));
    const startX = w / 2 - (count - 1) * spacing / 2;
    return { x: node.position.x + startX + idx * spacing, y: node.position.y + (node.height || 100) };
  }
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cp = Math.max(50, Math.min(Math.abs(x2 - x1) * 0.5, 150));
  return `M ${x1} ${y1} C ${x1} ${y1 + cp}, ${x2} ${y2 - cp}, ${x2} ${y2}`;
}

function topologicalSort(nodes: WorkflowNode[], connections: Connection[]): WorkflowNode[] {
  const adj = new Map<string, string[]>(); const inDeg = new Map<string, number>();
  for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0); }
  for (const c of connections) { adj.get(c.sourceId)?.push(c.targetId); inDeg.set(c.targetId, (inDeg.get(c.targetId) || 0) + 1); }
  const q: string[] = []; for (const [id, d] of inDeg) { if (d === 0) q.push(id); }
  const result: WorkflowNode[] = [];
  while (q.length > 0) {
    const id = q.shift()!; const node = nodes.find(n => n.id === id); if (node) result.push(node);
    for (const next of adj.get(id) || []) { const nd = (inDeg.get(next) || 1) - 1; inDeg.set(next, nd); if (nd === 0) q.push(next); }
  }
  if (result.length < nodes.length) { for (const n of nodes) { if (!result.find(r => r.id === n.id)) result.push(n); } }
  return result;
}

const optimizePrompt = async (text: string, imageUrls?: string[]): Promise<string> => {
  const API_TOKEN = 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
  let imageDescriptions = '';
  if (imageUrls && imageUrls.length > 0) {
    const results = await Promise.all(imageUrls.map(async (url) => {
      try {
        const res = await fetch('https://api.xgapi.top/v1/chat/completions', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemini-3.5-flash',
            messages: [{ role: 'user', content: [{ type: 'text', text: '请用中文详细描述这张图片中的主体、背景、物品、光线、构图等所有视觉元素' }, { type: 'image_url', image_url: { url } }] }],
            max_tokens: 500, temperature: 0.1
          })
        });
        const r = await res.json(); return r.choices?.[0]?.message?.content || '';
      } catch { return ''; }
    }));
    imageDescriptions = results.filter(Boolean).map(d => `\n【参考图分析】\n${d}\n`).join('');
  }
  try {
    const res = await fetch('https://api.xgapi.top/v1/chat/completions', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: "system", content: `你是一个专业的 AI 绘画提示词优化专家。${imageDescriptions ? '以下是用户上传的参考图分析结果，请基于这些真实描述来优化提示词，不要虚构图片中不存在的内容。' : ''}请将用户输入的简短描述优化为详细、高质量的中文提示词。优化后的提示词应包含主体、环境、光照、风格、构图、色彩等细节，并输出为纯文本，不要包含任何解释性文字。` },
          { role: "user", content: imageDescriptions ? `【参考图分析】\n${imageDescriptions}\n\n【用户需求】\n${text}` : text }
        ],
        model: "gemini-3.5-flash", temperature: 0.1, top_p: 1, stream: false
      })
    });
    const result = await res.json();
    if (result.error) return text;
    return result.choices?.[0]?.message?.content || text;
  } catch { return text; }
};

const analyzeImages = async (imageUrls: string[], instruction?: string): Promise<string> => {
  const API_TOKEN = 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';
  if (!imageUrls.length) return '';
  const results = await Promise.all(imageUrls.map(async (url) => {
    try {
      const res = await fetch('https://api.xgapi.top/v1/chat/completions', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3.5-flash',
          messages: [{ role: 'user', content: [{ type: 'text', text: instruction || '请用中文详细描述这张图片中的主体、背景、物品、光线、构图等所有视觉元素' }, { type: 'image_url', image_url: { url } }] }],
          max_tokens: 500, temperature: 0.1
        })
      });
      const r = await res.json(); return r.choices?.[0]?.message?.content || '';
    } catch { return ''; }
  }));
  return results.filter(Boolean).map((d, i) => imageUrls.length > 1 ? `【图片${i + 1}】\n${d}` : d).join('\n\n');
};

// ===== Port =====
const Port: React.FC<{
  x: number; y: number; color: string; isInput: boolean;
  nodeId: string; portId: string;
  onDragStart: (nodeId: string, portId: string, isInput: boolean, e: React.MouseEvent) => void;
  connected: boolean;
}> = ({ x, y, color, isInput, nodeId, portId, onDragStart, connected }) => (
  <g>
    <circle cx={x} cy={y} r={PORT_RADIUS + 4} fill="transparent" className="cursor-crosshair"
      onMouseDown={(e) => { e.stopPropagation(); onDragStart(nodeId, portId, isInput, e); }} />
    <circle cx={x} cy={y} r={PORT_RADIUS} fill={connected ? color : '#fff'} stroke={color} strokeWidth={2}
      className="cursor-crosshair" style={{ pointerEvents: 'none', transition: 'fill 0.15s, stroke 0.15s' }} />
  </g>
);

// ===== WorkflowNodeCard =====
const WorkflowNodeCard: React.FC<{
  node: WorkflowNode; isSelected: boolean; isRunning: boolean;
  onSelect: (id: string) => void; onDragStart: (id: string, e: React.MouseEvent) => void;
  onPortDragStart: (nodeId: string, portId: string, isInput: boolean, e: React.MouseEvent) => void;
  onDelete: (id: string) => void; connections: Connection[];
  availableModels: { value: string; label: string }[]; outputImages?: string[]; onImageClick?: (url: string) => void;
}> = ({ node, isSelected, isRunning, onSelect, onDragStart, onPortDragStart, onDelete, connections, availableModels, outputImages, onImageClick }) => {
  const def = getNodeTypeDef(node.type);
  const Icon = def.icon;
  const hasInput = (p: string) => connections.some(c => c.targetId === node.id && c.targetPort === p);
  const hasOutput = (p: string) => connections.some(c => c.sourceId === node.id && c.sourcePort === p);
  const h = node.height || 100;

  const renderPorts = (ports: { id: string; label: string }[], isInput: boolean) =>
    ports.map((port, i) => {
      const count = ports.length;
      const spacing = Math.min(30, (NODE_WIDTH - 40) / Math.max(count, 1));
      const startX = NODE_WIDTH / 2 - (count - 1) * spacing / 2;
      const px = node.position.x + startX + i * spacing;
      const py = isInput ? node.position.y : node.position.y + h;
      return <Port key={port.id} x={px} y={py} color={def.color} isInput={isInput}
        nodeId={node.id} portId={port.id} onDragStart={onPortDragStart}
        connected={isInput ? hasInput(port.id) : hasOutput(port.id)} />;
    });

  return (
    <g style={{ cursor: 'grab' }} onMouseDown={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      <rect x={node.position.x + 2} y={node.position.y + 2} width={NODE_WIDTH} height={h} rx={12} fill="rgba(0,0,0,0.06)" />
      <rect x={node.position.x} y={node.position.y} width={NODE_WIDTH} height={h} rx={12}
        fill={isSelected ? '#FAFAFA' : '#FFFFFF'} stroke={isSelected ? def.color : '#E5E5E5'}
        strokeWidth={isSelected ? 2 : 1} onMouseDown={(e) => onDragStart(node.id, e)} />
      <rect x={node.position.x} y={node.position.y} width={NODE_WIDTH} height={32} rx={12} fill={def.color + '15'} onMouseDown={(e) => onDragStart(node.id, e)} />
      <rect x={node.position.x} y={node.position.y + 20} width={NODE_WIDTH} height={12} fill={def.color + '15'} onMouseDown={(e) => onDragStart(node.id, e)} />
      <foreignObject x={node.position.x + 10} y={node.position.y + 5} width={NODE_WIDTH - 40} height={24} style={{ pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: def.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={11} color={def.color} strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{def.label}</span>
        </div>
      </foreignObject>
      {isSelected && (
        <g onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} style={{ cursor: 'pointer' }}>
          <circle cx={node.position.x + NODE_WIDTH - 14} cy={node.position.y + 14} r={9} fill="#FEE2E2" />
          <foreignObject x={node.position.x + NODE_WIDTH - 20} y={node.position.y + 8} width={12} height={12}>
            <X size={10} color="#EF4444" strokeWidth={2.5} />
          </foreignObject>
        </g>
      )}
      <foreignObject x={node.position.x + 12} y={node.position.y + 36} width={NODE_WIDTH - 24} height={h - 42} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
          {node.type === 'start' && (<div>
            <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{node.data.description || '点击配置需求...'}</p>
            {node.data.referenceImages?.length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              {node.data.referenceImages.slice(0, 4).map((img: string, i: number) => (
                <div key={i} style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>}
          </div>)}
          {node.type === 'prompt' && <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{node.data.prompt || '等待输入...'}</p>}
          {node.type === 'imageAnalyze' && <div>
            <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontSize: 10, color: '#666' }}>{node.data.instruction || '等待配置...'}</p>
          </div>}
          {node.type === 'imageGen' && <div>
            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: def.color + '10', color: def.color, fontSize: 10, fontWeight: 500 }}>
              {availableModels.find(m => m.value === node.data.model)?.label || node.data.model}
            </span>
            <p style={{ marginTop: 4, fontSize: 10 }}>{node.data.aspectRatio} · {node.data.resolution} · {node.data.batchSize}张</p>
          </div>}
          {node.type === 'imageEdit' && <div>
            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: def.color + '10', color: def.color, fontSize: 10, fontWeight: 500 }}>
              {availableModels.find(m => m.value === node.data.model)?.label || node.data.model}
            </span>
            <p style={{ marginTop: 4, fontSize: 10 }}>{node.data.aspectRatio} · {node.data.resolution}</p>
          </div>}
          {node.type === 'output' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {node.data.saveToLibrary && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#EEF2FF', color: '#4F46E5' }}>保存图库</span>}
            {outputImages && outputImages.length > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#ECFDF5', color: '#059669' }}>{outputImages.length}张结果</span>}
          </div>}
        </div>
      </foreignObject>
      {isRunning && <g>
        <rect x={node.position.x} y={node.position.y} width={NODE_WIDTH} height={h} rx={12} fill={def.color + '08'} stroke={def.color} strokeWidth={2} opacity={0.8}>
          <animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
        </rect>
      </g>}
      {renderPorts(def.inputs, true)}
      {renderPorts(def.outputs, false)}
    </g>
  );
};

// ===== NodeConfigPanel =====
const NodeConfigPanel: React.FC<{
  node: WorkflowNode; onUpdate: (id: string, data: NodeData) => void; onClose: () => void;
  availableModels: { value: string; label: string }[]; onUploadImages: (nodeId: string, files: FileList) => void;
  connections: Connection[]; nodes: WorkflowNode[]; outputImages?: string[]; onImageClick?: (url: string) => void;
  onRunWorkflow?: () => void; isRunning?: boolean;
}> = ({ node, onUpdate, onClose, availableModels, onUploadImages, connections, nodes, outputImages, onImageClick, onRunWorkflow, isRunning }) => {
  const def = getNodeTypeDef(node.type);
  const Icon = def.icon;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const update = (k: string, v: any) => onUpdate(node.id, { ...node.data, [k]: v });

  return (
    <motion.div initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="absolute right-0 top-0 bottom-0 w-[320px] bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: def.color + '15' }}>
            <Icon size={14} color={def.color} strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a]">{def.label}</h3>
            <p className="text-[10px] text-[#999]">{def.description}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X size={14} className="text-[#999]" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {node.type === 'start' && (<>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">需求描述</label>
            <textarea value={node.data.description || ''} onChange={(e) => update('description', e.target.value)}
              placeholder="描述你想要生成的图片效果..."
              className="w-full h-24 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none bg-[#FAFAFA]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">参考图片 <span className="text-[10px] text-[#999] font-normal">(最多{MAX_REF_IMAGES}张)</span></label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files) { onUploadImages(node.id, e.target.files); e.target.value = ''; } }} />
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-blue-300 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              <Upload size={20} className="mx-auto text-gray-300 mb-1" />
              <p className="text-[11px] text-[#999]">点击上传参考图</p>
              <p className="text-[10px] text-[#bbb] mt-0.5">JPG/PNG, 最大 20MB</p>
            </div>
            {node.data.referenceImages?.length > 0 && <div className="mt-2 flex gap-2 flex-wrap">
              {node.data.referenceImages.map((imgUrl: string, i: number) => (
                <div key={i} className="relative w-16 h-16 rounded-lg border border-gray-200 overflow-hidden group">
                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => { const imgs = [...node.data.referenceImages]; imgs.splice(i, 1); update('referenceImages', imgs); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>}
          </div>
        </>)}
        {node.type === 'prompt' && (<>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#555]">提示词</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={node.data.autoOptimize} onChange={(e) => update('autoOptimize', e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500" />
                <span className="text-[10px] text-[#999]">AI自动优化</span>
              </label>
            </div>
            <textarea value={node.data.prompt || ''} onChange={(e) => update('prompt', e.target.value)} placeholder={(() => {
               const inC = connections.filter(c => c.targetId === node.id);
               if (inC.length > 0) {
                 const srcNode = nodes.find(n => n.id === inC[0].sourceId);
                 if (srcNode?.data?.prompt) return srcNode.data.prompt;
                 if (srcNode?.data?.description) return srcNode.data.description;
               }
               return '输入提示词...';
             })()}
              className="w-full h-32 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 resize-none bg-[#FAFAFA]" />
            <button onClick={async () => {
              const inC = connections.filter(c => c.targetId === node.id);
              let imgs: string[] = [];
              for (const c of inC) {
                const srcNode = nodes.find(n => n.id === c.sourceId);
                if (srcNode?.data?.referenceImages?.length) imgs = srcNode.data.referenceImages;
                if (srcNode?.data?.images?.length) imgs = srcNode.data.images;
              }
              const txt = node.data.prompt || '';
              if (!txt.trim()) return;
              update('prompt', '优化中...');
              const optimized = await optimizePrompt(txt, imgs.length > 0 ? imgs : undefined);
              update('prompt', optimized);
            }} className="mt-2 w-full py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5">
              <Sparkles size={12} /> AI优化提示词
            </button>
          </div>
        </>)}
        {node.type === 'imageGen' && (<>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">生成模型</label>
            <div className="space-y-1.5">
              {availableModels.map(m => (
                <button key={m.value} onClick={() => update('model', m.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${node.data.model === m.value ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-gray-50 text-[#666] hover:bg-gray-100 border border-transparent'}`}>
                  <span>{m.label}</span>
                  {node.data.model === m.value && <Check size={12} className="text-blue-500" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">图片比例</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map(r => {
                const [dw, dh] = ASPECT_DIMS[r] || [14,14];
                return (<button key={r} onClick={() => update('aspectRatio', r)}
                  className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[11px] font-medium transition-all ${node.data.aspectRatio === r ? 'bg-blue-500 text-white' : 'bg-gray-50 text-[#666] hover:bg-gray-100'}`}>
                  <div style={{ width: dw, height: dh, borderRadius: 2, background: 'currentColor', opacity: 0.5, flexShrink: 0 }} />
                  <span>{r}</span>
                </button>);
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">分辨率</label>
            <div className="flex gap-1.5">
              {RESOLUTIONS.map(r => (
                <button key={r} onClick={() => update('resolution', r)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${node.data.resolution === r ? 'bg-blue-500 text-white' : 'bg-gray-50 text-[#666] hover:bg-gray-100'}`}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">批量生成</label>
            <div className="flex gap-1.5">
              {[1, 2, 4].map(n => (
                <button key={n} onClick={() => update('batchSize', n)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${node.data.batchSize === n ? 'bg-blue-500 text-white' : 'bg-gray-50 text-[#666] hover:bg-gray-100'}`}>{n}张</button>
              ))}
            </div>
          </div>
        </>)}
        {node.type === 'imageAnalyze' && (<>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">分析指令</label>
            <textarea value={node.data.instruction || ''} onChange={(e) => update('instruction', e.target.value)}
              placeholder="输入分析指令，告诉AI需要关注图片的哪些方面..."
              className="w-full h-24 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-100 focus:border-cyan-300 resize-none bg-[#FAFAFA]" />
            <p className="text-[10px] text-[#999] mt-1">AI将根据指令分析上游传入的图片，输出文字描述</p>
          </div>
        </>)}
        {node.type === 'imageEdit' && (<>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">生成模型</label>
            <div className="space-y-1.5">
              {availableModels.map(m => (
                <button key={m.value} onClick={() => update('model', m.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${node.data.model === m.value ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-gray-50 text-[#666] hover:bg-gray-100 border border-transparent'}`}>
                  <span>{m.label}</span>
                  {node.data.model === m.value && <Check size={12} className="text-amber-500" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">图片比例</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ASPECT_RATIOS.map(r => {
                const [dw, dh] = ASPECT_DIMS[r] || [14,14];
                return (<button key={r} onClick={() => update('aspectRatio', r)}
                  className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[11px] font-medium transition-all ${node.data.aspectRatio === r ? 'bg-amber-500 text-white' : 'bg-gray-50 text-[#666] hover:bg-gray-100'}`}>
                  <div style={{ width: dw, height: dh, borderRadius: 2, background: 'currentColor', opacity: 0.5, flexShrink: 0 }} />
                  <span>{r}</span>
                </button>);
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#555] mb-1.5">分辨率</label>
            <div className="flex gap-1.5">
              {RESOLUTIONS.map(r => (
                <button key={r} onClick={() => update('resolution', r)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${node.data.resolution === r ? 'bg-amber-500 text-white' : 'bg-gray-50 text-[#666] hover:bg-gray-100'}`}>{r}</button>
              ))}
          </div>
          </div>
        </>)}
        {node.type === 'output' && <div>
          <label className="block text-xs font-medium text-[#555] mb-2">输出选项</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FAFAFA] cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" checked={node.data.saveToLibrary} onChange={(e) => update('saveToLibrary', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-500" />
              <div><span className="text-xs font-medium text-[#333]">保存到图库</span><p className="text-[10px] text-[#999]">自动保存生成结果</p></div>
            </label>
          </div>
        </div>}
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[10px] text-[#bbb] space-y-1">
            <div className="flex justify-between"><span>节点ID</span><span className="font-mono">{node.id.split('-').slice(0, 3).join('-')}</span></div>
            <div className="flex justify-between"><span>位置</span><span className="font-mono">({Math.round(node.position.x)}, {Math.round(node.position.y)})</span></div>
          </div>
        </div>
        {node.type === 'start' && (
          <button onClick={onRunWorkflow} disabled={isRunning} className="mt-3 w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: isRunning ? '#9CA3AF' : 'linear-gradient(135deg, #2563EB, #7C3AED)', boxShadow: isRunning ? 'none' : '0 4px 14px rgba(37,99,235,0.3)' }}>
            <Play size={14} fill="white" /> {isRunning ? '运行中...' : '运行工作流'}
          </button>
        )}
        {node.type === 'output' && outputImages && outputImages.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#555]">生成结果</span>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{outputImages.length}张</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {outputImages.map((img, i) => (
                <div key={i} onClick={() => onImageClick?.(img)} className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer aspect-square group">
                  <img src={img} alt={`结果 ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={img} download target="_blank" onClick={(e) => e.stopPropagation()} className="flex-1 py-1 rounded-md bg-white/90 backdrop-blur-sm text-[9px] text-gray-700 hover:bg-white text-center font-medium">下载</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ===== Main WorkflowPage =====
export const WorkflowPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showNodePalette, setShowNodePalette] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<Position>({ x: 0, y: 0 });
  const panOriginRef = useRef<Position>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const nodesRef = useRef<WorkflowNode[]>([]);
  const dragRafRef = useRef<number>(0);
  const connectRafRef = useRef<number>(0);
  const mousePosRef = useRef<Position>({ x: 0, y: 0 });
  const sortedNodesRef = useRef<WorkflowNode[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFrom, setConnectFrom] = useState<{ nodeId: string; portId: string; isInput: boolean } | null>(null);
  const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [workflowHistory, setWorkflowHistory] = useState<{ nodes: WorkflowNode[]; connections: Connection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputImages, setOutputImages] = useState<string[]>([]);
  const [showImageLib, setShowImageLib] = useState(false);
  const [fullScreenImg, setFullScreenImg] = useState<string | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowData[]>([]);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameWorkflowId, setRenameWorkflowId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState('');
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedWorkflowRef = useRef<WorkflowData | null>(null);
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([
    { value: 'nanobann2', label: 'Nanobann2' }, { value: 'gpt-image-2', label: 'GPT Image 2' },
  ]);
  const [generatePrice, setGeneratePrice] = useState(0.3);
  const [showCreditModal, setShowCreditModal] = useState(false);

  // User menu state
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userCredits, setUserCredits] = useState(0);
  const [couponInfo, setCouponInfo] = useState<{ total: number; expiresAt: string | null }>({ total: 0, expiresAt: null });
  const [showSubAccountModal, setShowSubAccountModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const getInitial = (email: string) => email?.charAt(0).toUpperCase() || '?';
  const isLoggedIn = !!user?.email;

  useEffect(() => {
    const dw = DEFAULT_WORKFLOW();
    setNodes(dw.nodes); nodesRef.current = dw.nodes; setConnections(dw.connections);
    setWorkflowHistory([dw]); setHistoryIndex(0);
    // 从 API 加载用户的工作流列表
    workflowService.list().then(list => {
      if (list.length > 0) setSavedWorkflows(list);
    }).catch(() => {});
  }, []);
  useEffect(() => { getAvailableModels().then(m => setAvailableModels(m.map(x => ({ value: x.model_id, label: x.label })))); }, []);
  useEffect(() => { getPricing().then(p => setGeneratePrice(p.nanobann2_generation || 0.3)); }, []);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => () => { if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current); if (connectRafRef.current) cancelAnimationFrame(connectRafRef.current); }, []);

  useEffect(() => {
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    setUserCredits(u.credits || 0);
    const handler = () => { const u2 = JSON.parse(sessionStorage.getItem('user') || '{}'); setUserCredits(u2.credits || 0); };
    window.addEventListener('credits-updated', handler);
    return () => window.removeEventListener('credits-updated', handler);
  }, []);

  useEffect(() => {
    try { const c = JSON.parse(sessionStorage.getItem('coupon_credits') || '{}'); setCouponInfo(c); } catch {}
  }, []);

  // 自动保存：节点/连线变化后防抖保存
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    if (!currentWorkflowId) return;
    // 跳过初始加载时的触发
    if (nodes.length === 0 && connections.length === 0) return;
    autoSaveRef.current = setTimeout(async () => {
      setIsSaving(true);
      const wf = savedWorkflows.find(w => w.id === currentWorkflowId);
      await workflowService.update(currentWorkflowId, wf?.name || '未命名工作流', nodes, connections);
      // 刷新列表
      const list = await workflowService.list();
      if (list.length > 0) setSavedWorkflows(list);
      setIsSaving(false);
    }, 2000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [nodes, connections, currentWorkflowId]);

  const screenToCanvas = useCallback((sx: number, sy: number): Position => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }), [zoom, pan]);
  const pushHistory = useCallback((nn: WorkflowNode[], nc: Connection[]) => {
    setWorkflowHistory(prev => {
      const next = [...prev.slice(0, historyIndex + 1), { nodes: JSON.parse(JSON.stringify(nn)), connections: JSON.parse(JSON.stringify(nc)) }];
      // 最多保留 50 条历史记录
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 50));
  }, [historyIndex]);
  const undo = useCallback(() => { if (historyIndex <= 0) return; const p = workflowHistory[historyIndex - 1]; setNodes(p.nodes); setConnections(p.connections); setHistoryIndex(historyIndex - 1); }, [historyIndex, workflowHistory]);
  const redo = useCallback(() => { if (historyIndex >= workflowHistory.length - 1) return; const n = workflowHistory[historyIndex + 1]; setNodes(n.nodes); setConnections(n.connections); setHistoryIndex(historyIndex + 1); }, [historyIndex, workflowHistory]);

  const updateNodeData = useCallback((nodeId: string, data: NodeData) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data } : n));
  }, []);

  const handleUploadImages = useCallback(async (nodeId: string, files: FileList) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const cur: string[] = node.data.referenceImages || [];
    const rem = MAX_REF_IMAGES - cur.length;
    if (rem <= 0) { alert(`最多${MAX_REF_IMAGES}张`); return; }
    const newImgs: string[] = [];
    for (const f of Array.from(files).slice(0, rem)) {
      if (f.size > MAX_FILE_SIZE) { alert(`${f.name} 超过20MB`); continue; }
      if (!f.type.startsWith('image/')) continue;
      try { newImgs.push(await fileToDataUrl(f, 1200)); } catch { alert(`${f.name} 处理失败`); }
    }
    if (newImgs.length > 0) updateNodeData(nodeId, { ...node.data, referenceImages: [...cur, ...newImgs] });
  }, [nodes, updateNodeData]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).classList.contains('canvas-bg')) {
      setSelectedNodeId(null); setShowConfig(false); setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY }; panOriginRef.current = { ...pan };
    }
  }, [pan]);
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) setPan({ x: panOriginRef.current.x + (e.clientX - panStartRef.current.x), y: panOriginRef.current.y + (e.clientY - panStartRef.current.y) });
    if (draggingNodeId) {
      const cp = screenToCanvas(e.clientX, e.clientY);
      const node = nodesRef.current.find(n => n.id === draggingNodeId);
      if (node) { node.position.x = cp.x - dragOffsetRef.current.x; node.position.y = cp.y - dragOffsetRef.current.y; }
      if (!dragRafRef.current) dragRafRef.current = requestAnimationFrame(() => { setNodes([...nodesRef.current]); dragRafRef.current = 0; });
    }
    if (isConnecting) {
      const r = svgRef.current?.getBoundingClientRect();
      if (r) {
        mousePosRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        if (!connectRafRef.current) {
          connectRafRef.current = requestAnimationFrame(() => {
            setMousePos(mousePosRef.current);
            connectRafRef.current = 0;
          });
        }
      }
    }
  }, [isPanning, draggingNodeId, isConnecting, screenToCanvas]);
  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    setIsPanning(false);
    if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = 0; }
    if (draggingNodeId) { setNodes([...nodesRef.current]); pushHistory(nodesRef.current, connections); }
    setDraggingNodeId(null);
    // When connecting, find the nearest compatible port in canvas coordinates
    if (isConnecting && connectFrom) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (svgRect) {
        // Convert viewport mouse to SVG-relative, then to canvas coords
        const canvasMouse = screenToCanvas(e.clientX - svgRect.left, e.clientY - svgRect.top);
        let bestDist = 80; // snap radius in canvas pixels
        let bestNode: WorkflowNode | null = null;
        let bestPortId = '';
        for (const n of nodes) {
          if (n.id === connectFrom.nodeId) continue;
          const def = getNodeTypeDef(n.type);
          if (!connectFrom.isInput) {
            for (const p of def.inputs) {
              const d = Math.hypot(getPortPosition(n, p.id, true).x - canvasMouse.x, getPortPosition(n, p.id, true).y - canvasMouse.y);
              if (d < bestDist) { bestDist = d; bestNode = n; bestPortId = p.id; }
            }
          }
          if (connectFrom.isInput) {
            for (const p of def.outputs) {
              const d = Math.hypot(getPortPosition(n, p.id, false).x - canvasMouse.x, getPortPosition(n, p.id, false).y - canvasMouse.y);
              if (d < bestDist) { bestDist = d; bestNode = n; bestPortId = p.id; }
            }
          }
        }
        if (bestNode) {
          let sId: string, sPort: string, tId: string, tPort: string;
          if (connectFrom.isInput) { sId = bestNode.id; sPort = bestPortId; tId = connectFrom.nodeId; tPort = connectFrom.portId; }
          else { sId = connectFrom.nodeId; sPort = connectFrom.portId; tId = bestNode.id; tPort = bestPortId; }
          if (!connections.some(c => c.sourceId === sId && c.sourcePort === sPort && c.targetId === tId && c.targetPort === tPort)) {
            setConnections(prev => { const nc = [...prev, { id: genId('conn'), sourceId: sId, sourcePort: sPort, targetId: tId, targetPort: tPort }]; pushHistory(nodes, nc); return nc; });
          }
        }
      }
      setIsConnecting(false); setConnectFrom(null);
    }
  }, [draggingNodeId, isConnecting, connectFrom, connections, nodes, pushHistory, screenToCanvas]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const d = e.deltaY > 0 ? -0.1 : 0.1;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + d));
    const r = svgRef.current?.getBoundingClientRect();
    if (r) { const mx = e.clientX - r.left, my = e.clientY - r.top; setPan({ x: mx - (mx - pan.x) * (nz / zoom), y: my - (my - pan.y) * (nz / zoom) }); }
    setZoom(nz);
  }, [zoom, pan]);

  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId); if (!node) return;
    const cp = screenToCanvas(e.clientX, e.clientY);
    dragOffsetRef.current = { x: cp.x - node.position.x, y: cp.y - node.position.y };
    setDraggingNodeId(nodeId); setSelectedNodeId(nodeId); setShowConfig(true);
  }, [nodes, screenToCanvas]);

  const handlePortDragStart = useCallback((nodeId: string, portId: string, isInput: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault(); setIsConnecting(true); setConnectFrom({ nodeId, portId, isInput });
    const r = svgRef.current?.getBoundingClientRect(); if (r) setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);

  const addNode = useCallback((type: string) => {
    const def = getNodeTypeDef(type);
    const cp = screenToCanvas((containerRef.current?.clientWidth || 800) / 2, (containerRef.current?.clientHeight || 600) / 2);
    const nn: WorkflowNode = { id: genId('node'), type, position: { x: cp.x - NODE_WIDTH / 2, y: cp.y - 40 }, data: JSON.parse(JSON.stringify(def.defaultData)), height: 100 };
    const newNodes = [...nodes, nn]; setNodes(newNodes); pushHistory(newNodes, connections); setSelectedNodeId(nn.id); setShowConfig(true);
  }, [nodes, connections, pushHistory, screenToCanvas]);

  const deleteNode = useCallback((nodeId: string) => {
    const nn = nodes.filter(n => n.id !== nodeId); const nc = connections.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId);
    setNodes(nn); setConnections(nc); pushHistory(nn, nc);
    if (selectedNodeId === nodeId) { setSelectedNodeId(null); setShowConfig(false); }
  }, [nodes, connections, selectedNodeId, pushHistory]);

  const duplicateNode = useCallback((nodeId: string) => {
    const n = nodes.find(nd => nd.id === nodeId); if (!n) return;
    const nn: WorkflowNode = { ...JSON.parse(JSON.stringify(n)), id: genId('node'), position: { x: n.position.x + 40, y: n.position.y + 40 } };
    const newNodes = [...nodes, nn]; setNodes(newNodes); pushHistory(newNodes, connections);
  }, [nodes, connections, pushHistory]);

  const deleteConnection = useCallback((connId: string) => {
    const nc = connections.filter(c => c.id !== connId); setConnections(nc); pushHistory(nodes, nc);
  }, [connections, nodes, pushHistory]);

  // ===== Run Workflow =====
  const runWorkflow = useCallback(async () => {
    const user = getCurrentUser();
    if (!user) { window.dispatchEvent(new CustomEvent('show-auth-modal')); return; }
    // 预估总费用：统计所有 imageGen / imageEdit 节点的生图数量
    const totalGenCount = nodes.reduce((sum, n) => {
      if (n.type === 'imageGen') return sum + (n.data.batchSize || 1);
      if (n.type === 'imageEdit') return sum + 1;
      return sum;
    }, 0);
    if (totalGenCount === 0) { alert('工作流中没有图片生成/编辑节点'); return; }
    const totalCost = totalGenCount * generatePrice;
    if ((user?.credits || 0) < totalCost) {
      alert(`积分不足！本工作流需要 ${totalCost.toFixed(2)} 积分（${totalGenCount}次生图 × ${generatePrice}），当前剩余 ${(user?.credits || 0).toFixed(2)} 积分`);
      setShowCreditModal(true);
      return;
    }
    setIsRunning(true); setOutputImages([]);
    try {
      const sorted = topologicalSort(nodes, connections);
      sortedNodesRef.current = sorted;
      const nodeOutputs = new Map<string, { images?: string[]; prompt?: string; model?: string }>();
      for (const node of sorted) {
        setRunningNodeId(node.id);
        await new Promise(r => setTimeout(r, 300));
        if (node.type === 'start') {
          nodeOutputs.set(node.id, { prompt: node.data.description || '', images: node.data.referenceImages || [] });
        } else if (node.type === 'prompt') {
          const inC = connections.filter(c => c.targetId === node.id);
          let t = ''; let imgs: string[] = [];
          for (const c of inC) { const u = nodeOutputs.get(c.sourceId); if (u) { if (u.prompt) t = u.prompt; if (u.images) imgs = u.images; } }
          let fp = t || node.data.prompt || '';
          if (node.data.autoOptimize && fp.trim()) try { fp = await optimizePrompt(fp, imgs.length > 0 ? imgs : undefined); } catch {}
          nodeOutputs.set(node.id, { prompt: fp, images: imgs });
        } else if (node.type === 'imageAnalyze') {
          const inC = connections.filter(c => c.targetId === node.id);
          let imgs: string[] = [];
          for (const c of inC) { const u = nodeOutputs.get(c.sourceId); if (u?.images?.length) imgs = u.images; }
          if (imgs.length === 0) { nodeOutputs.set(node.id, { prompt: '无待分析的图片' }); continue; }
          const result = await analyzeImages(imgs, node.data.instruction);
          nodeOutputs.set(node.id, { prompt: result, images: imgs });
        } else if (node.type === 'imageGen') {
          const inC = connections.filter(c => c.targetId === node.id);
          let p = ''; let ref: string[] = [];
          for (const c of inC) { const u = nodeOutputs.get(c.sourceId); if (u) { if (u.prompt) p = u.prompt; if (u.images?.length) ref = u.images; } }
          p = p || '';
          let res: any;
          if (ref.length > 0) res = await editImage({ prompt: p, images: ref, model: node.data.model, resolution: node.data.resolution, aspectRatio: node.data.aspectRatio });
          else res = await generateImage({ prompt: p, model: node.data.model, aspectRatio: node.data.aspectRatio, resolution: node.data.resolution, n: node.data.batchSize || 1 });
          nodeOutputs.set(node.id, { images: (res.data || []).map((i: any) => i.url), prompt: p, model: node.data.model });
          setOutputImages(prev => [...prev, ...(res.data || []).map((i: any) => i.url)]);
        } else if (node.type === 'imageEdit') {
          const inC = connections.filter(c => c.targetId === node.id);
          let p = ''; let imgs: string[] = [];
          for (const c of inC) { const u = nodeOutputs.get(c.sourceId); if (u) { if (u.images?.length) imgs = u.images; if (u.prompt) p = u.prompt || p; } }
          let res: any;
          if (imgs.length > 0) res = await editImage({ prompt: p, images: imgs, model: node.data.model, resolution: node.data.resolution, aspectRatio: node.data.aspectRatio });
          else res = await generateImage({ prompt: p, model: node.data.model, aspectRatio: node.data.aspectRatio, resolution: node.data.resolution, n: 1 });
          nodeOutputs.set(node.id, { images: (res.data || []).map((i: any) => i.url), prompt: p });
          setOutputImages(prev => [...prev, ...(res.data || []).map((i: any) => i.url)]);
        } else if (node.type === 'output') {
          const inC = connections.filter(c => c.targetId === node.id);
          let imgs: string[] = []; let p = ''; let m = 'nanobann2';
          for (const c of inC) { const u = nodeOutputs.get(c.sourceId); if (u) { if (u.images?.length) imgs = u.images; if (u.prompt) p = u.prompt; if (u.model) m = u.model; } }
          if (node.data.saveToLibrary) for (const url of imgs) try { await imageLibraryService.saveToLibrary({ image_url: url, prompt: p, model: m, aspect_ratio: '1:1', resolution: '2K', type: 'generated' }); } catch {}
          nodeOutputs.set(node.id, { images: imgs, prompt: p });
        }
      }
    } catch (e: any) {
      console.error('工作流执行失败:', e);
      const err = e?.response?.data?.error;
      alert(`执行失败: ${typeof err === 'string' ? err : err?.message || e?.message || '请重试'}`);
    } finally { setRunningNodeId(null); setIsRunning(false); }
  }, [nodes, connections, generatePrice]);

  const saveWorkflow = useCallback(async () => {
    const name = saveName.trim() || `工作流 ${savedWorkflows.length + 1}`;
    setIsLoading(true);
    const id = await workflowService.create(name, nodes, connections);
    if (id) {
      setCurrentWorkflowId(id);
      const list = await workflowService.list();
      if (list.length > 0) setSavedWorkflows(list);
    }
    setIsLoading(false);
    setShowSaveModal(false); setSaveName('');
  }, [saveName, savedWorkflows, nodes, connections]);
  const loadWorkflow = useCallback((wf: WorkflowData) => {
    setCurrentWorkflowId(wf.id);
    loadedWorkflowRef.current = wf;
    setNodes(wf.nodes); setConnections(wf.connections);
    setWorkflowHistory([{ nodes: JSON.parse(JSON.stringify(wf.nodes)), connections: JSON.parse(JSON.stringify(wf.connections)) }]); setHistoryIndex(0);
    setShowLoadModal(false); setSelectedNodeId(null); setShowConfig(false);
  }, []);
  const clearCanvas = useCallback(() => { setNodes([]); setConnections([]); pushHistory([], []); setSelectedNodeId(null); setShowConfig(false); }, [pushHistory]);

  const loadPreset = useCallback((preset: WorkflowPreset) => {
    setCurrentWorkflowId(null);
    loadedWorkflowRef.current = null;
    setNodes(preset.nodes as WorkflowNode[]);
    setConnections(preset.connections as Connection[]);
    setWorkflowHistory([{ nodes: JSON.parse(JSON.stringify(preset.nodes)), connections: JSON.parse(JSON.stringify(preset.connections)) }]);
    setHistoryIndex(0);
    setShowPresetModal(false);
    setSelectedNodeId(null);
    setShowConfig(false);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) deleteNode(selectedNodeId);
      if (e.key === 'Escape') { setSelectedNodeId(null); setShowConfig(false); setIsConnecting(false); setConnectFrom(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); if (selectedNodeId) duplicateNode(selectedNodeId); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [selectedNodeId, deleteNode, undo, redo, duplicateNode]);

  const renderConns = useMemo(() => connections.map(conn => {
    const sn = nodes.find(n => n.id === conn.sourceId); const tn = nodes.find(n => n.id === conn.targetId);
    if (!sn || !tn) return null;
    const sp = getPortPosition(sn, conn.sourcePort, false); const tp = getPortPosition(tn, conn.targetPort, true);
    const path = bezierPath(sp.x, sp.y, tp.x, tp.y);
    return (
      <g key={conn.id} className="group cursor-pointer" onClick={() => deleteConnection(conn.id)}>
        <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
        <path d={path} fill="none" stroke={getNodeTypeDef(sn.type).color} strokeWidth={2} strokeOpacity={0.6} strokeLinecap="round" className="group-hover:stroke-[3px] group-hover:stroke-opacity-100 transition-all" />
        {isRunning && <circle r={3} fill={getNodeTypeDef(sn.type).color}><animateMotion dur="2s" repeatCount="indefinite" path={path} /></circle>}
      </g>
    );
  }), [connections, nodes, deleteConnection, isRunning]);

  const renderTemp = useMemo(() => {
    if (!isConnecting || !connectFrom) return null;
    const n = nodes.find(nd => nd.id === connectFrom.nodeId); if (!n) return null;
    const sp = getPortPosition(n, connectFrom.portId, connectFrom.isInput);
    const mp = { x: (mousePos.x - pan.x) / zoom, y: (mousePos.y - pan.y) / zoom };
    const path = bezierPath(connectFrom.isInput ? mp.x : sp.x, connectFrom.isInput ? mp.y : sp.y, connectFrom.isInput ? sp.x : mp.x, connectFrom.isInput ? sp.y : mp.y);
    return <path d={path} fill="none" stroke={getNodeTypeDef(n.type).color} strokeWidth={2} strokeDasharray="6 4" strokeOpacity={0.6} strokeLinecap="round" style={{ pointerEvents: 'none' }} />;
  }, [isConnecting, connectFrom, mousePos, nodes, pan, zoom]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const cats = useMemo(() => {
    const m = new Map<string, NodeTypeDef[]>(); for (const nt of NODE_TYPES) { if (!m.has(nt.category)) m.set(nt.category, []); m.get(nt.category)!.push(nt); }
    return Array.from(m.entries());
  }, []);

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#F0F4F8] overflow-hidden select-none">
      <style>{`@keyframes progressFlow { 0% { opacity:0.3; width:0% } 50% { opacity:1; width:100% } 100% { opacity:0.3; width:0% } }`}</style>
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-3 gap-2 flex-shrink-0 z-20">
        <div className="flex items-center gap-1.5 mr-3">
          <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center"><Boxes size={13} className="text-white" /></div>
          <span className="text-sm font-semibold text-gray-800">工作流</span>
        </div>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button onClick={undo} disabled={historyIndex <= 0} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30" title="撤销"><Undo2 size={14} className="text-gray-500" /></button>
        <button onClick={redo} disabled={historyIndex >= workflowHistory.length - 1} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center disabled:opacity-30" title="重做"><Redo2 size={14} className="text-gray-500" /></button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.1))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center" title="放大"><ZoomIn size={14} className="text-gray-500" /></button>
        <span className="text-[11px] text-gray-400 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.1))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center" title="缩小"><ZoomOut size={14} className="text-gray-500" /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center" title="重置"><Maximize2 size={14} className="text-gray-500" /></button>
        <div className="flex-1" />
        <button onClick={() => setShowNodePalette(p => !p)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${showNodePalette ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}`} title="节点面板"><Layers size={14} /></button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {currentWorkflowId && (
          <div className="flex items-center gap-1.5 mr-1">
            <span className="text-[11px] text-gray-500 font-medium max-w-[120px] truncate">{savedWorkflows.find(w => w.id === currentWorkflowId)?.name || '工作流'}</span>
            {isSaving && <span className="text-[10px] text-gray-400 animate-pulse">保存中...</span>}
            {!isSaving && currentWorkflowId && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="已自动保存" />}
          </div>
        )}
        <button onClick={() => setShowSaveModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100" disabled={isLoading}><Save size={12} /> {isLoading ? '保存中...' : '另存为'}</button>
        <button onClick={() => setShowLoadModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100"><Download size={12} /> 加载</button>
        <button onClick={() => setShowPresetModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"><Boxes size={12} /> 模板</button>
        <button onClick={() => { setCurrentWorkflowId(null); loadedWorkflowRef.current = null; clearCanvas(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100"><RotateCcw size={12} /> 新建</button>
        <button onClick={() => setShowImageLib(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100"><ImageIcon size={12} /> 图片库</button>
        {/* Progress Bar */}
        {isRunning && sortedNodesRef.current.length > 0 && (
          <div className="flex items-center gap-1.5 ml-3 flex-1 max-w-[60%] overflow-hidden" style={{ pointerEvents: 'none' }}>
            {sortedNodesRef.current.map((sn, i) => {
              const def = getNodeTypeDef(sn.type);
              const Icon = def.icon;
              const isCurrent = sn.id === runningNodeId;
              const isDone = sortedNodesRef.current.findIndex(n => n.id === runningNodeId) > i;
              return (<div key={sn.id} className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-300 ${isCurrent ? 'bg-blue-100 text-blue-700 scale-105 shadow-sm' : isDone ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  <Icon size={10} className={isCurrent ? 'animate-pulse' : ''} />
                  <span className="truncate">{def.label}</span>
                </div>
                {i < sortedNodesRef.current.length - 1 && (
                  <div className={`h-px flex-1 transition-colors duration-500 ${isDone ? 'bg-green-400' : isCurrent ? 'bg-blue-300' : 'bg-gray-200'}`}>
                    {isCurrent && <div className="h-px bg-blue-500" style={{ animation: 'progressFlow 0.8s ease-in-out infinite' }} />}
                  </div>
                )}
              </div>);
            })}
          </div>
        )}
        {isLoggedIn && (
          <div className="relative ml-auto">
            <button onClick={() => setShowUserMenu(p => !p)}
              className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
              <span className="text-white text-[9px] font-bold">{getInitial(user.email)}</span>
            </button>
            {showUserMenu && (
              <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[8vh]" onClick={() => setShowUserMenu(false)}>
                <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
                <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-black/15 overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
                  <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
                        <span className="text-white text-base font-bold">{getInitial(user.email)}</span>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">{user.email}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Coins size={14} className="text-amber-500" />
                          <span className="text-sm font-bold text-amber-600">{Number(userCredits).toFixed(1)}</span>
                          <span className="text-xs text-gray-400">积分</span>
                          {couponInfo.total > 0 && (
                            <span className="text-[10px] text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded-lg ml-1">
                              {couponInfo.total.toFixed(1)} 积分通过优惠券获得
                              {couponInfo.expiresAt && `，请在 ${Math.ceil((new Date(couponInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} 天内用完`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setShowUserMenu(false)} className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0">
                      <X size={14} className="text-gray-400" />
                    </button>
                  </div>
                  <div className="p-4 space-y-1">
                    {!user?.isSubUser && !user?.recharge_disabled && (
                      <button onClick={() => { setShowUserMenu(false); }}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-blue-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0"><CreditCard size={18} className="text-blue-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">充值</p>
                          <p className="text-xs text-gray-400 mt-0.5">购买积分，解锁更多创作能力</p>
                        </div>
                      </button>
                    )}
                    <button onClick={() => { setShowUserMenu(false); }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-purple-50 transition-all">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><History size={18} className="text-purple-600" /></div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-900">记录</p>
                        <p className="text-xs text-gray-400 mt-0.5">查看充值与消费明细</p>
                      </div>
                    </button>
                    {!user?.isSubUser && (
                      <button onClick={() => { setShowUserMenu(false); setShowSubAccountModal(true); }}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-emerald-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><Users size={18} className="text-emerald-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">子账号</p>
                          <p className="text-xs text-gray-400 mt-0.5">创建和管理子账号</p>
                        </div>
                      </button>
                    )}
                    <button onClick={() => { setShowUserMenu(false); setShowImageLib(true); }}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-amber-50 transition-all">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={18} className="text-amber-600" /></div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-900">图库</p>
                        <p className="text-xs text-gray-400 mt-0.5">查看和管理生成的图片</p>
                      </div>
                    </button>
                    {!user?.isSubUser && (
                      <button onClick={() => { setShowUserMenu(false); setShowCouponModal(true); }}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-pink-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0"><Gift size={18} className="text-pink-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">领券</p>
                          <p className="text-xs text-gray-400 mt-0.5">输入优惠券码兑换积分</p>
                        </div>
                      </button>
                    )}
                    {(() => { try { const u = JSON.parse(sessionStorage.getItem('user') || '{}'); return !!u.is_agent; } catch { return false; } })() && (
                      <a href="/agent"
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-indigo-50 transition-all">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0"><TrendingUp size={18} className="text-indigo-600" /></div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-900">佣金中心</p>
                          <p className="text-xs text-gray-400 mt-0.5">邀请好友赚取佣金</p>
                        </div>
                      </a>
                    )}
                  </div>
                  <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => { setShowUserMenu(false); setShowTermsModal(true); }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">使用条款</button>
                      <span className="w-px h-3 bg-gray-200" />
                      <button onClick={() => { setShowUserMenu(false); setShowPrivacyModal(true); }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">隐私政策</button>
                    </div>
                    <button onClick={() => { logout(); setShowUserMenu(false); }}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 transition-all">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      退出
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Node Palette */}
        <AnimatePresence>
          {showNodePalette && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 200, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="h-full bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden z-10">
              <div className="w-[200px] h-full flex flex-col">
                <div className="px-3 py-2.5 border-b border-gray-100"><h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">节点库</h3></div>
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                  {cats.map(([cat, items]) => (
                    <div key={cat}>
                      <div className="px-2 py-1.5 text-[10px] font-medium text-gray-300 uppercase tracking-wider">{cat}</div>
                      {items.map(nt => {
                        const Icon = nt.icon;
                        return (
                          <button key={nt.type} onClick={() => addNode(nt.type)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-all group text-left" draggable>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: nt.color + '18' }}>
                              <Icon size={13} color={nt.color} strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-700 truncate">{nt.label}</div>
                              <div className="text-[10px] text-gray-400 truncate">{nt.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing" onWheel={handleWheel}>
          <svg ref={svgRef} width="100%" height="100%" className="absolute inset-0"
            onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
            <defs>
              <pattern id="grid-sm" width={CANVAS_GRID_SIZE * zoom} height={CANVAS_GRID_SIZE * zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x % (CANVAS_GRID_SIZE * zoom)} ${pan.y % (CANVAS_GRID_SIZE * zoom)})`}>
                <circle cx={CANVAS_GRID_SIZE * zoom / 2} cy={CANVAS_GRID_SIZE * zoom / 2} r={0.6} fill="rgba(0,0,0,0.08)" />
              </pattern>
              <pattern id="grid-lg" width={CANVAS_GRID_SIZE * 5 * zoom} height={CANVAS_GRID_SIZE * 5 * zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x % (CANVAS_GRID_SIZE * 5 * zoom)} ${pan.y % (CANVAS_GRID_SIZE * 5 * zoom)})`}>
                <circle cx={CANVAS_GRID_SIZE * 5 * zoom / 2} cy={CANVAS_GRID_SIZE * 5 * zoom / 2} r={1} fill="rgba(0,0,0,0.1)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="#F0F4F8" className="canvas-bg" />
            <rect width="100%" height="100%" fill="url(#grid-sm)" className="canvas-bg" />
            <rect width="100%" height="100%" fill="url(#grid-lg)" className="canvas-bg" />
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {renderConns}{renderTemp}
              {nodes.map(node => (
                <WorkflowNodeCard key={node.id} node={node} isSelected={selectedNodeId === node.id} isRunning={runningNodeId === node.id}
                  onSelect={(id) => { setSelectedNodeId(id); setShowConfig(true); }} onDragStart={handleNodeDragStart}
                  onPortDragStart={(nid, pid, isInput, e) => handlePortDragStart(nid, pid, isInput, e)}
                  onDelete={deleteNode} connections={connections} availableModels={availableModels}
                  outputImages={node.type === 'output' ? outputImages : undefined}
                  onImageClick={(url) => setFullScreenImg(url)} />
              ))}
            </g>
          </svg>
          {nodes.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-200/50 flex items-center justify-center"><MousePointer2 size={24} className="text-gray-300" /></div>
              <p className="text-sm text-gray-400">从左侧添加节点到画布</p>
              <p className="text-xs text-gray-300 mt-1">或点击节点添加到画布中心</p>
            </div>
          </div>}
          {/* Mini-map */}
          <div className="absolute bottom-4 left-4 w-40 h-28 bg-white/90 border border-gray-200 rounded-xl overflow-hidden shadow-lg backdrop-blur-sm">
            <svg width="100%" height="100%" viewBox="-200 -100 1600 600">
              <rect x={-200} y={-100} width={1600} height={600} fill="transparent" />
              {connections.map(c => {
                const sn = nodes.find(n => n.id === c.sourceId); const tn = nodes.find(n => n.id === c.targetId);
                if (!sn || !tn) return null;
                return <line key={c.id} x1={sn.position.x + NODE_WIDTH / 2} y1={sn.position.y + 50} x2={tn.position.x + NODE_WIDTH / 2} y2={tn.position.y + 50} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />;
              })}
              {nodes.map(n => <rect key={n.id} x={n.position.x} y={n.position.y} width={NODE_WIDTH} height={80} rx={4} fill={getNodeTypeDef(n.type).color + '30'} stroke={getNodeTypeDef(n.type).color + '60'} strokeWidth={1} />)}
            </svg>
          </div>
        </div>

        {/* Config Panel */}
        <AnimatePresence>
          {showConfig && selectedNode && (
            <NodeConfigPanel node={selectedNode} onUpdate={updateNodeData} onClose={() => { setShowConfig(false); setSelectedNodeId(null); }}
              availableModels={availableModels} onUploadImages={handleUploadImages} connections={connections} nodes={nodes}
              outputImages={outputImages} onImageClick={(url) => setFullScreenImg(url)} onRunWorkflow={runWorkflow} isRunning={isRunning} />
          )}
        </AnimatePresence>

      </div>

      {/* Image Library Modal */}
      <ImageLibraryModal isOpen={showImageLib} onClose={() => setShowImageLib(false)} />

      {/* Fullscreen Image Viewer */}
      <AnimatePresence>
        {fullScreenImg && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center cursor-pointer"
            onClick={() => setFullScreenImg(null)}>
            <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              src={fullScreenImg} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            <button onClick={() => setFullScreenImg(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X size={20} className="text-white" />
            </button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              <a href={fullScreenImg} download target="_blank" className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5 backdrop-blur-sm transition-colors">
                <Download size={14} /> 下载
              </a>
              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fullScreenImg); }} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5 backdrop-blur-sm transition-colors">
                <Copy size={14} /> 复制链接
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset Modal */}
      <AnimatePresence>
        {showPresetModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowPresetModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 w-[620px] max-h-[520px] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">工作流模板</h3>
              <p className="text-[11px] text-gray-400 mb-4">选择一个预设模板快速开始，模板将覆盖当前画布内容</p>
              <div className="flex-1 overflow-y-auto space-y-4">
                {PRESET_CATEGORIES.map(cat => {
                  const presets = WORKFLOW_PRESETS.filter(p => p.category === cat.id);
                  if (presets.length === 0) return null;
                  return (
                    <div key={cat.id}>
                      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{cat.label}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {presets.map(preset => (
                          <div key={preset.id} onClick={() => loadPreset(preset)}
                            className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all group">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow transition-shadow">
                              <span className="text-white text-[10px] font-bold">{preset.name.slice(0, 2)}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 group-hover:text-indigo-700">{preset.name}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{preset.description}</p>
                              <p className="text-[9px] text-gray-300 mt-1">{preset.nodes.length}个节点</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setShowPresetModal(false)} className="w-full py-2 mt-3 rounded-xl text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">关闭</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowSaveModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">保存工作流</h3>
              <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="输入工作流名称..."
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-400 placeholder:text-gray-400"
                autoFocus onKeyDown={e => e.key === 'Enter' && saveWorkflow()} />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowSaveModal(false)} className="flex-1 py-2 rounded-xl text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
                <button onClick={saveWorkflow} disabled={isLoading} className="flex-1 py-2 rounded-xl text-xs text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-colors">{isLoading ? '保存中...' : '保存'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load Modal */}
      <AnimatePresence>
        {showLoadModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowLoadModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 w-[420px] max-h-[400px] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">加载工作流</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {savedWorkflows.length === 0 && <div className="text-center py-8"><p className="text-xs text-gray-400">暂无保存的工作流</p></div>}
                {savedWorkflows.map(wf => (
                  <div key={wf.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-all cursor-pointer" onClick={() => loadWorkflow(wf)}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Boxes size={14} className="text-blue-500" /></div>
                      <div>
                        <p className="text-xs font-medium text-gray-700">{wf.name}</p>
                        <p className="text-[10px] text-gray-400">{wf.nodes.length}个节点 · {wf.connections.length}条连接</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setRenameWorkflowId(wf.id); setRenameName(wf.name); setShowRenameModal(true); }}
                        className="w-6 h-6 rounded-lg hover:bg-blue-100 flex items-center justify-center transition-colors">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={async (e) => { e.stopPropagation(); if (!confirm('确定删除此工作流？')) return; await workflowService.delete(wf.id); const list = await workflowService.list(); setSavedWorkflows(list); if (currentWorkflowId === wf.id) setCurrentWorkflowId(null); }}
                        className="w-6 h-6 rounded-lg hover:bg-red-100 flex items-center justify-center transition-colors">
                        <Trash2 size={11} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowLoadModal(false)} className="w-full py-2 mt-3 rounded-xl text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">关闭</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {showRenameModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowRenameModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-5 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">重命名工作流</h3>
              <input value={renameName} onChange={e => setRenameName(e.target.value)} placeholder="输入新名称..."
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:border-blue-400 placeholder:text-gray-400"
                autoFocus onKeyDown={async e => { if (e.key === 'Enter' && renameWorkflowId) {
                  await workflowService.update(renameWorkflowId, renameName, nodes, connections);
                  const list = await workflowService.list(); setSavedWorkflows(list);
                  setShowRenameModal(false);
                }}} />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowRenameModal(false)} className="flex-1 py-2 rounded-xl text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
                <button onClick={async () => { if (renameWorkflowId) {
                  await workflowService.update(renameWorkflowId, renameName, nodes, connections);
                  const list = await workflowService.list(); setSavedWorkflows(list);
                  setShowRenameModal(false);
                }}} className="flex-1 py-2 rounded-xl text-xs text-white bg-blue-500 hover:bg-blue-600 transition-colors">确定</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreditCheckModal isOpen={showCreditModal} onClose={() => setShowCreditModal(false)} onRecharge={() => {}} />
    </div>
  );
};

export default WorkflowPage;