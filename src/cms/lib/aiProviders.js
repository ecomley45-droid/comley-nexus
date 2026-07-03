// Shared catalog of AI providers used by the Dashboard prompt bar and the
// Profile page's per-AI settings. Kept as a single constant so the two
// surfaces stay in sync — the Profile page picks defaults from here, the
// Dashboard reads which providers are "connected" and offers their models.

export const AI_PROVIDERS = [
  {
    id: 'claude',
    label: 'Claude',
    models: [
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
    defaultModel: 'claude-sonnet-5',
    defaultContext: 200000,
    maxContext: 500000,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    models: [
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'o1', label: 'o1' },
    ],
    defaultModel: 'gpt-5',
    defaultContext: 128000,
    maxContext: 256000,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { value: 'gemini-2-5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2-0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1-5-pro', label: 'Gemini 1.5 Pro' },
    ],
    defaultModel: 'gemini-2-0-flash',
    defaultContext: 1000000,
    maxContext: 2000000,
  },
];

export const isAiProvider = (id) => AI_PROVIDERS.some((p) => p.id === id);

export function connectedAiProviders(integrations = {}, aiSettings = {}) {
  return AI_PROVIDERS.filter((p) => integrations[p.id]).map((p) => ({
    ...p,
    activeModel: aiSettings[p.id]?.model || p.defaultModel,
    contextWindow: aiSettings[p.id]?.context_window ?? p.defaultContext,
    temperature: aiSettings[p.id]?.temperature ?? 0.7,
    systemPrompt: aiSettings[p.id]?.system_prompt ?? '',
  }));
}
