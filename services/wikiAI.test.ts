import { describe, expect, it } from 'vitest';
import { findRelevantArticleChunks } from './wikiAI';

describe('Wiki AI retrieval', () => {
  it('searches the full article instead of only its opening paragraph', () => {
    const chunks = findRelevantArticleChunks('Как учитывать режим отопления при обследовании?');
    expect(chunks.some(chunk => chunk.article.id === 'insulation-3' && chunk.text.includes('режима отопления'))).toBe(true);
  });

  it('does not invent default sources for an empty or meaningless question', () => {
    expect(findRelevantArticleChunks('и или как')).toEqual([]);
  });
});
