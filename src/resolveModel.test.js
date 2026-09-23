import { describe, it, expect } from 'vitest';
import { resolveModel } from './resolveModel.js';

describe('resolveModel', () => {
  it('選択肢にあるモデルはそのまま', () => {
    expect(resolveModel('gpt-6-luna')).toBe('gpt-6-luna');
  });

  it('外したGeminiの保存値は既定のgpt-6-lunaに戻る', () => {
    expect(resolveModel('gemini-2.5-flash')).toBe('gpt-6-luna');
  });

  it('未保存なら既定', () => {
    expect(resolveModel(undefined)).toBe('gpt-6-luna');
    expect(resolveModel('')).toBe('gpt-6-luna');
  });
});
