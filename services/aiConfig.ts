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
  model: getEnv('VITE_OPENROUTER_MODEL') || 'arcee-ai/trinity-mini:free',
  siteUrl: getEnv('VITE_OPENROUTER_SITE_URL'),
  siteName: getEnv('VITE_OPENROUTER_SITE_NAME'),
};

export const hasOpenRouterKey = (): boolean => {
  return Boolean(AI_CONFIG.apiKey && AI_CONFIG.apiKey.trim().length > 0);
};
