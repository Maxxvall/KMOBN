import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
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
});
