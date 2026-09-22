import supabase from './supabase';

export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  gatewayUrl?: string;
  model: string;
  siteUrl?: string;
  siteName?: string;
};

type RuntimeEnv = Record<string, string | undefined>;

const getRuntimeEnv = (): RuntimeEnv => {
  const globalAny = globalThis as typeof globalThis & {
    __ENV__?: RuntimeEnv;
    process?: { env?: RuntimeEnv };
  };
  return {
    ...(globalAny.process?.env || {}),
    ...(globalAny.__ENV__ || {}),
  };
};

const getViteEnv = (): RuntimeEnv => {
  try {
    return {
      VITE_OPENROUTER_API_KEY: import.meta.env?.VITE_OPENROUTER_API_KEY,
      VITE_AI_GATEWAY_URL: import.meta.env?.VITE_AI_GATEWAY_URL,
      VITE_OPENROUTER_BASE_URL: import.meta.env?.VITE_OPENROUTER_BASE_URL,
      VITE_OPENROUTER_MODEL: import.meta.env?.VITE_OPENROUTER_MODEL,
      VITE_OPENROUTER_SITE_URL: import.meta.env?.VITE_OPENROUTER_SITE_URL,
      VITE_OPENROUTER_SITE_NAME: import.meta.env?.VITE_OPENROUTER_SITE_NAME,
    };
  } catch {
    return {};
  }
};

const resolveEnv = (key: string, fallback?: string): string | undefined => {
  const fromVite = getViteEnv()[key];
  const fromRuntime = getRuntimeEnv()[key];
  const value = (fromVite ?? fromRuntime ?? fallback) as string | undefined;
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return fallback;
  return trimmed;
};

export const AI_CONFIG: OpenRouterConfig = {
  apiKey: resolveEnv('VITE_OPENROUTER_API_KEY') || '',
  baseUrl: resolveEnv('VITE_OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1/chat/completions',
  gatewayUrl: resolveEnv('VITE_AI_GATEWAY_URL'),
  model: resolveEnv('VITE_OPENROUTER_MODEL') || 'nvidia/nemotron-3-ultra-550b-a55b:free',
  siteUrl: resolveEnv('VITE_OPENROUTER_SITE_URL'),
  siteName: resolveEnv('VITE_OPENROUTER_SITE_NAME'),
};

export const hasOpenRouterKey = (): boolean => {
  return Boolean(AI_CONFIG.gatewayUrl || (AI_CONFIG.apiKey && AI_CONFIG.apiKey.trim().length > 0));
};

export const getAIRequestUrl = (): string => AI_CONFIG.gatewayUrl || AI_CONFIG.baseUrl;

export const getAIRequestHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AI_CONFIG.gatewayUrl) {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const accessToken = data.session?.access_token;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  } else if (AI_CONFIG.apiKey) {
    headers.Authorization = `Bearer ${AI_CONFIG.apiKey}`;
  }
  if (AI_CONFIG.siteUrl) headers['HTTP-Referer'] = AI_CONFIG.siteUrl;
  if (AI_CONFIG.siteName) headers['X-Title'] = AI_CONFIG.siteName;
  return headers;
};
