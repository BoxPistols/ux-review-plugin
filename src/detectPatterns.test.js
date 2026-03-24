import { describe, it, expect } from 'vitest';
import { detectPatterns } from './detectPatterns.js';

describe('detectPatterns', () => {
  it('レイアウトが NONE の場合はヒントなし', () => {
    const node = {
      layoutMode: 'NONE',
      children: [{ type: 'FRAME' }, { type: 'FRAME' }, { type: 'FRAME' }],
    };
    expect(detectPatterns(node, {})).toEqual([]);
  });

  it('子要素がない場合はヒントなし', () => {
    const node = { layoutMode: 'VERTICAL', children: [] };
    expect(detectPatterns(node, {})).toEqual([]);
  });

  it('VERTICAL に同じ構造が3回以上 → ヒント生成', () => {
    // ステッパー的構造: FRAME(ELLIPSE+TEXT) が5つ縦並び
    const makeStep = () => ({
      type: 'FRAME',
      children: [{ type: 'ELLIPSE' }, { type: 'TEXT' }],
    });
    const node = {
      layoutMode: 'VERTICAL',
      children: [makeStep(), makeStep(), makeStep(), makeStep(), makeStep()],
    };
    const hints = detectPatterns(node, {});
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('VERTICAL');
    expect(hints[0]).toContain('5個');
    expect(hints[0]).toContain('FRAME(ELLIPSE+TEXT)');
  });

  it('HORIZONTAL に同じ構造が4回 → ヒント生成', () => {
    const makeTab = () => ({ type: 'FRAME', children: [{ type: 'TEXT' }] });
    const node = {
      layoutMode: 'HORIZONTAL',
      children: [makeTab(), makeTab(), makeTab(), makeTab()],
    };
    const hints = detectPatterns(node, {});
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('HORIZONTAL');
    expect(hints[0]).toContain('4個');
  });

  it('繰り返しが2回のみ → ヒントなし', () => {
    const node = {
      layoutMode: 'VERTICAL',
      children: [
        { type: 'FRAME', children: [{ type: 'TEXT' }] },
        { type: 'FRAME', children: [{ type: 'TEXT' }] },
      ],
    };
    expect(detectPatterns(node, {})).toEqual([]);
  });

  it('異なる構造が混在 → それぞれ3回以上のもののみヒント', () => {
    const node = {
      layoutMode: 'VERTICAL',
      children: [
        // 構造A: FRAME(TEXT) × 3
        { type: 'FRAME', children: [{ type: 'TEXT' }] },
        { type: 'FRAME', children: [{ type: 'TEXT' }] },
        { type: 'FRAME', children: [{ type: 'TEXT' }] },
        // 構造B: INSTANCE × 2 (3未満 → ヒントなし)
        { type: 'INSTANCE' },
        { type: 'INSTANCE' },
      ],
    };
    const hints = detectPatterns(node, {});
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('3個');
    expect(hints[0]).toContain('FRAME(TEXT)');
  });

  it('子なしの要素の繰り返しも検出', () => {
    const node = {
      layoutMode: 'VERTICAL',
      children: [
        { type: 'RECTANGLE' },
        { type: 'RECTANGLE' },
        { type: 'RECTANGLE' },
      ],
    };
    const hints = detectPatterns(node, {});
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('RECTANGLE');
  });

  it('孫要素のタイプはソートされて比較される', () => {
    // TEXT+ELLIPSE と ELLIPSE+TEXT は同じシグネチャ
    const node = {
      layoutMode: 'VERTICAL',
      children: [
        { type: 'FRAME', children: [{ type: 'TEXT' }, { type: 'ELLIPSE' }] },
        { type: 'FRAME', children: [{ type: 'ELLIPSE' }, { type: 'TEXT' }] },
        { type: 'FRAME', children: [{ type: 'TEXT' }, { type: 'ELLIPSE' }] },
      ],
    };
    const hints = detectPatterns(node, {});
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('FRAME(ELLIPSE+TEXT)');
  });
});
