import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateCategory, EstimateStatus, EstimateSubgroup } from '../types';
import type { AIEstimateRequest } from './openRouterService';

const createJsonResponse = (payload: unknown) => {
  const bodyText = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => bodyText,
  } as Response;
};

const baseRequest: AIEstimateRequest = {
  area: 120,
  buildingType: 'Каркасный дом',
  region: 'Московская область',
  historicalEstimates: [
    {
      id: 'h-1',
      estimateNumber: 'SM-2026-001-HIST',
      client: 'Client',
      date: '2026-01-20',
      status: EstimateStatus.DRAFT,
      version: 1,
      items: [],
      total: 0,
      buildingType: 'Каркасный дом',
      area: 120,
    },
  ],
  existingItems: [],
  materials: [
    {
      id: 'm-1',
      name: 'Доска обрезная',
      price: 100,
      lastUpdated: '2026-01-01',
      category: EstimateCategory.GENERAL,
    },
  ],
  works: [
    {
      id: 'w-1',
      name: 'Монтаж каркаса',
      price: 200,
      category: EstimateCategory.GENERAL,
    },
  ],
};

describe('generateEstimateWithAI stage 2', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VITE_OPENROUTER_API_KEY = 'test-key';
    process.env.VITE_OPENROUTER_BASE_URL = 'https://example.com/openrouter';
    process.env.VITE_OPENROUTER_MODEL = 'test-model';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VITE_OPENROUTER_API_KEY;
    delete process.env.VITE_OPENROUTER_BASE_URL;
    delete process.env.VITE_OPENROUTER_MODEL;
  });

  it('fires all stage 2 block requests without waiting sequentially', async () => {
    const stage2Resolvers: Array<() => void> = [];
    let stage2Calls = 0;

    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body || '{}')) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = (requestBody.messages || []).map(message => String(message.content || '')).join('\n');

      if (prompt.includes('Этап 1/3')) {
        return Promise.resolve(createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  blocks: [
                    { category: EstimateCategory.GENERAL, intent: 'A', keyWorks: [], volumeHints: { areaFactor: 1 } },
                    { category: EstimateCategory.LOGISTICS, intent: 'B', keyWorks: [], volumeHints: { areaFactor: 1 } },
                  ],
                  assumptions: [],
                  warnings: [],
                }),
              },
            },
          ],
        }));
      }

      if (prompt.includes('Этап 2/3')) {
        stage2Calls += 1;
        return new Promise<Response>(resolve => {
          stage2Resolvers.push(() => {
            resolve(createJsonResponse({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ items: [], suggestions: [], warnings: [] }),
                  },
                },
              ],
            }));
          });
        });
      }

      if (prompt.includes('Этап 3/3')) {
        return Promise.resolve(createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({ items: [], suggestions: [], warnings: [] }),
              },
            },
          ],
        }));
      }

      return Promise.resolve(createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ items: [], suggestions: [], warnings: [] }),
            },
          },
        ],
      }));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { generateEstimateWithAI } = await import('./openRouterService');
    const generationPromise = generateEstimateWithAI(baseRequest);

    await vi.waitFor(() => {
      expect(stage2Calls).toBe(2);
      expect(stage2Resolvers).toHaveLength(2);
    });

    stage2Resolvers.forEach(resolve => resolve());
    await generationPromise;
  });

  it('details every explicitly selected section beyond the legacy six-block limit', async () => {
    const selectedSections = [
      EstimateCategory.FOUNDATION,
      EstimateCategory.GRILLAGE,
      EstimateCategory.WALLS,
      EstimateCategory.ROOF,
      EstimateCategory.WINDOWS,
      EstimateCategory.ELECTRICAL,
      EstimateCategory.WATER_SUPPLY,
      EstimateCategory.SEWERAGE,
      EstimateCategory.LOGISTICS,
    ];
    let stage2Calls = 0;

    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body || '{}')) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = (requestBody.messages || []).map(message => String(message.content || '')).join('\n');

      if (prompt.includes('Этап 1/3')) {
        return Promise.resolve(createJsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                blocks: selectedSections.slice(0, 6).map(category => ({
                  category,
                  intent: '',
                  keyWorks: [],
                  volumeHints: { areaFactor: 1 },
                })),
                assumptions: [],
                warnings: [],
              }),
            },
          }],
        }));
      }

      if (prompt.includes('Этап 2/3')) {
        stage2Calls += 1;
      }

      return Promise.resolve(createJsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({ items: [], suggestions: [], warnings: [] }),
          },
        }],
      }));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { generateEstimateWithAI } = await import('./openRouterService');
    await generateEstimateWithAI({ ...baseRequest, selectedSections });

    expect(stage2Calls).toBe(selectedSections.length);
  });
});

describe('AI reliability guards', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VITE_OPENROUTER_API_KEY = 'test-key';
    process.env.VITE_OPENROUTER_BASE_URL = 'https://example.com/openrouter';
    process.env.VITE_OPENROUTER_MODEL = 'test-model';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { __aiTestMarker?: number }).__aiTestMarker;
    delete process.env.VITE_OPENROUTER_API_KEY;
    delete process.env.VITE_OPENROUTER_BASE_URL;
    delete process.env.VITE_OPENROUTER_MODEL;
  });

  it('never evaluates malformed model output as JavaScript', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({
      choices: [{ message: { content: '{"items": (globalThis.__aiTestMarker = 1, [])}' } }],
    })));
    const { aiAutocomplete } = await import('./openRouterService');

    const items = await aiAutocomplete('доска', EstimateCategory.GENERAL, [], baseRequest.materials, baseRequest.works, 120);

    expect(items).toEqual([]);
    expect((globalThis as typeof globalThis & { __aiTestMarker?: number }).__aiTestMarker).toBeUndefined();
  });

  it('does not retry permanent provider errors or expose their response body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'sensitive provider payload',
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const { aiAutocomplete } = await import('./openRouterService');

    await expect(aiAutocomplete('доска', EstimateCategory.GENERAL, [], baseRequest.materials, baseRequest.works, 120))
      .rejects.toThrow('AI provider returned HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('changes the generation cache identity when scope, counts, or prices change', async () => {
    const { createEstimateGenerationCacheKey } = await import('./openRouterService');
    const baseKey = createEstimateGenerationCacheKey(baseRequest);

    expect(createEstimateGenerationCacheKey({ ...baseRequest, scopeDescription: 'Только работы' })).not.toBe(baseKey);
    expect(createEstimateGenerationCacheKey({ ...baseRequest, windowCount: 8 })).not.toBe(baseKey);
    expect(createEstimateGenerationCacheKey({
      ...baseRequest,
      materials: baseRequest.materials.map(material => ({ ...material, price: material.price + 1 })),
    })).not.toBe(baseKey);
  });

  it('propagates cancellation instead of generating fallback items', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { generateEstimateWithAI } = await import('./openRouterService');
    const controller = new AbortController();
    controller.abort();

    await expect(generateEstimateWithAI({ ...baseRequest, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a clarification state before calling the model for contradictory scope', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { generateEstimateWithAI } = await import('./openRouterService');

    const result = await generateEstimateWithAI({
      ...baseRequest,
      scopeDescription: 'Только работы, работы не нужны, только материалы',
    });

    expect(result.status).toBe('needs_clarification');
    expect(result.source).toBe('rules');
    expect(result.items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the result and total as incomplete when a catalog price is unknown', async () => {
    const materialWithoutPrice = { ...baseRequest.materials[0], price: 0 };
    vi.stubGlobal('fetch', vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ content?: string }> };
      const prompt = (body.messages || []).map(message => String(message.content || '')).join('\n');
      if (prompt.includes('Этап 1/3')) {
        return createJsonResponse({ choices: [{ message: { content: JSON.stringify({
          blocks: [{ category: EstimateCategory.GENERAL, intent: '', keyWorks: [], volumeHints: { areaFactor: 1 } }],
          assumptions: [],
          warnings: [],
        }) } }] });
      }
      return createJsonResponse({ choices: [{ message: { content: JSON.stringify({
        items: [{
          name: materialWithoutPrice.name,
          unit: 'шт',
          quantity: 2,
          price: 0,
          category: EstimateCategory.GENERAL,
          subgroup: EstimateSubgroup.MATERIALS,
        }],
        suggestions: [],
        warnings: [],
      }) } }] });
    }));
    const { generateEstimateWithAI } = await import('./openRouterService');

    const result = await generateEstimateWithAI({
      ...baseRequest,
      materials: [materialWithoutPrice],
      selectedSections: [EstimateCategory.GENERAL],
    });

    expect(result.status).toBe('partial');
    expect(result.pricing.status).toBe('incomplete');
    expect(result.pricing.unknownItemIds).toHaveLength(1);
    expect(result.warnings.some(warning => warning.includes('не считаются бесплатными'))).toBe(true);
  });

  it('drops model items outside explicitly selected sections', async () => {
    const cable = {
      id: 'm-cable',
      name: 'Кабель силовой',
      price: 100,
      lastUpdated: '2026-01-01',
      category: EstimateCategory.ELECTRICAL,
    };
    vi.stubGlobal('fetch', vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ content?: string }> };
      const prompt = (body.messages || []).map(message => String(message.content || '')).join('\n');
      if (prompt.includes('Этап 1/3')) {
        return createJsonResponse({ choices: [{ message: { content: JSON.stringify({
          blocks: [{ category: EstimateCategory.ROOF, intent: '', keyWorks: [], volumeHints: { areaFactor: 1 } }],
          assumptions: [],
          warnings: [],
        }) } }] });
      }
      return createJsonResponse({ choices: [{ message: { content: JSON.stringify({
        items: [{ name: cable.name, unit: 'м/п', quantity: 10, price: 0, category: EstimateCategory.ELECTRICAL, subgroup: EstimateSubgroup.MATERIALS }],
        suggestions: [],
        warnings: [],
      }) } }] });
    }));
    const { generateEstimateWithAI } = await import('./openRouterService');

    const result = await generateEstimateWithAI({
      ...baseRequest,
      materials: [cable],
      selectedSections: [EstimateCategory.ROOF],
    });

    expect(result.items).toEqual([]);
    expect(result.warnings.some(warning => warning.includes('противоречащих выбранному составу'))).toBe(true);
  });

  it('does not silently cap countable materials by floor area', async () => {
    const { sanitizeQuantities } = await import('./openRouterService');
    const [item] = sanitizeQuantities([{
      id: 'fasteners',
      name: 'Гвозди',
      unit: 'шт',
      quantity: 500,
      price: 1,
      total: 500,
      category: EstimateCategory.WALLS,
      subgroup: EstimateSubgroup.MATERIALS,
    }], 100);

    expect(item.quantity).toBe(500);
  });

  it('preserves the tariff quantity and unit for work items', async () => {
    const { sanitizeQuantities } = await import('./openRouterService');
    const [item] = sanitizeQuantities([{
      id: 'wall-work',
      name: 'Монтаж стен',
      unit: 'м2',
      quantity: 84,
      price: 500,
      total: 42000,
      category: EstimateCategory.WALLS,
      subgroup: EstimateSubgroup.WORKS,
    }], 100);

    expect(item.quantity).toBe(84);
    expect(item.unit).toBe('м2');
  });

  it('uses section coverage when converting packaged wall materials', async () => {
    const { applySmartPackagingRules } = await import('./openRouterService');
    const [item] = applySmartPackagingRules([{
      id: 'membrane',
      name: 'Мембрана 25 м2',
      unit: 'м2',
      quantity: 112,
      price: 100,
      total: 11200,
      category: EstimateCategory.WALLS,
      subgroup: EstimateSubgroup.MATERIALS,
    }], 100);

    expect(item.unit).toBe('шт');
    expect(item.quantity).toBe(7);
  });
});
