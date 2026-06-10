import axios from 'axios';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const API_URL = 'https://cdn.xgapi.top/v1/chat/completions';
const API_KEY = 'sk-r5Clizar6aV39YsxLbHR3rW209LqmnYa5fLT1iePRBtfZT47';

/**
 * AI 文本对话
 */
export const chatCompletion = async (
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> => {
  try {
    const response = await axios.post<ChatCompletionResponse>(
      API_URL,
      {
        model: options?.model || 'gemini-3.5-flash',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens || 2000,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`
        },
        timeout: 180000
      }
    );

    return response.data.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error('AI chat error:', error);
    throw new Error(error.response?.data?.error || 'AI 对话失败');
  }
};

/**
 * AI 图片分析
 */
export const analyzeImage = async (
  imageUrl: string,
  prompt: string,
  options?: {
    model?: string;
    maxTokens?: number;
  }
): Promise<string> => {
  try {
    const response = await axios.post<ChatCompletionResponse>(
      API_URL,
      {
        model: options?.model || 'gemini-3.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: options?.maxTokens || 1000,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`
        },
        timeout: 180000
      }
    );

    return response.data.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error('AI image analysis error:', error);
    throw new Error(error.response?.data?.error || 'AI 图片分析失败');
  }
};

/**
 * AI 多图片分析
 */
export const analyzeMultipleImages = async (
  imageUrls: string[],
  prompt: string,
  options?: {
    model?: string;
    maxTokens?: number;
  }
): Promise<string> => {
  const doRequest = async (): Promise<string> => {
    const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: prompt }
    ];
    imageUrls.forEach(url => {
      content.push({ type: 'image_url', image_url: { url } });
    });

    const response = await axios.post<ChatCompletionResponse>(
      API_URL,
      {
        model: options?.model || 'gemini-3.5-flash',
        messages: [{ role: 'user', content }],
        max_tokens: options?.maxTokens || 2000,
        stream: false
      },
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        timeout: 300000
      }
    );
    const respContent = response.data.choices[0]?.message?.content || '';
    console.log('AI分析原始响应:', respContent.substring(0, 300));
    if (!respContent) console.error('AI分析响应为空');
    return respContent;
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await doRequest();
    } catch (error: any) {
      const status = error.response?.status;
      console.warn(`AI分析第${attempt}次失败 (${status || 'network'}):`, error.message?.substring(0, 100));
      if (attempt < maxRetries) {
        const delay = attempt * 5000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`AI分析失败: ${error.response?.data?.error || error.message || '服务暂不可用请稍后重试'}`);
    }
  }
  throw new Error('AI分析服务暂时不可用，请稍后重试');
};
