import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}

interface ApiKeyContextType {
  apiKey: string | null;
  isModalOpen: boolean;
  setApiKey: (key: string | null) => void;
  openModal: () => void;
  closeModal: () => void;
  hasApiKey: () => boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const useApiKey = () => {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error('useApiKey must be used within ApiKeyProvider');
  }
  return context;
};

interface ApiKeyProviderProps {
  children: ReactNode;
}

export const ApiKeyProvider: React.FC<ApiKeyProviderProps> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('apiKey');
    if (stored) {
      setApiKeyState(stored);
    }
    // 不再自动打开弹窗，需要用户手动点击打开
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    if (key) {
      sessionStorage.setItem('apiKey', key);
    } else {
      sessionStorage.removeItem('apiKey');
    }
    setApiKeyState(key);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const hasApiKey = useCallback(() => {
    return !!apiKey && apiKey.length > 0;
  }, [apiKey]);

  useEffect(() => {
    if (window.aistudio) {
      window.aistudio.hasSelectedApiKey = async () => hasApiKey();
      window.aistudio.openSelectKey = async () => openModal();
    }
  }, [hasApiKey, openModal]);

  return (
    <ApiKeyContext.Provider value={{ apiKey, isModalOpen, setApiKey, openModal, closeModal, hasApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
};
