import api from './api';
import { getAuthToken } from './authService';

interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  width?: number;
  height?: number;
}

interface Connection {
  id: string;
  sourceId: string;
  sourcePort: string;
  targetId: string;
  targetPort: string;
}

export interface WorkflowData {
  id: number;
  name: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  createdAt?: string;
  updatedAt?: string;
}

function getHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const workflowService = {
  async list(): Promise<WorkflowData[]> {
    try {
      const res = await api.get('/api/workflows', { headers: getHeaders() });
      if (res.data.success) return res.data.data || [];
      return [];
    } catch (error) {
      console.error('Failed to list workflows:', error);
      return [];
    }
  },

  async create(name: string, nodes: WorkflowNode[], connections: Connection[]): Promise<number | null> {
    try {
      const res = await api.post('/api/workflows', { name, nodes, connections }, { headers: getHeaders() });
      if (res.data.success) return res.data.data.id;
      return null;
    } catch (error) {
      console.error('Failed to create workflow:', error);
      return null;
    }
  },

  async update(id: number, name: string, nodes: WorkflowNode[], connections: Connection[]): Promise<boolean> {
    try {
      const res = await api.put(`/api/workflows/${id}`, { name, nodes, connections }, { headers: getHeaders() });
      return res.data.success === true;
    } catch (error) {
      console.error('Failed to update workflow:', error);
      return false;
    }
  },

  async delete(id: number): Promise<boolean> {
    try {
      const res = await api.delete(`/api/workflows/${id}`, { headers: getHeaders() });
      return res.data.success === true;
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      return false;
    }
  }
};
