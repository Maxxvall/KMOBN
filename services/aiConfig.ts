export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  siteUrl?: string;
  siteName?: string;
};

const getEnv = (key: string): string | undefined => {
  try {
    // Vite injects import.meta.env at build time
    return (import.meta as any)?.env?.[key] as string | undefined;
  } catch {
    return undefined;
  }
};

export const AI_CONFIG: OpenRouterConfig = {
  apiKey: getEnv('VITE_OPENROUTER_API_KEY') || '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',
  baseUrl: getEnv('VITE_OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1/chat/completions',
  model: getEnv('VITE_OPENROUTER_MODEL') || 'mistralai/devstral-2512:free',
  siteUrl: getEnv('VITE_OPENROUTER_SITE_URL'),
  siteName: getEnv('VITE_OPENROUTER_SITE_NAME'),
};

export const hasOpenRouterKey = (): boolean => {
  return Boolean(AI_CONFIG.apiKey && AI_CONFIG.apiKey.trim().length > 0);
};
