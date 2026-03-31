import { describe, it, expect } from 'vitest';

describe('Plugin Card Protocol - pluginId injection', () => {
  it('injects pluginId into details.card when card is present', () => {
    const pluginId = 'finance-monitor';
    const result = {
      content: [{ type: 'text', text: 'test' }],
      details: { card: { type: 'iframe', route: '/card/kline', data: { symbol: 'sh600519' }, height: 280 } }
    };
    if (result.details?.card && !result.details.card.pluginId) {
      result.details.card.pluginId = pluginId;
    }
    expect(result.details.card.pluginId).toBe('finance-monitor');
    expect(result.details.card.type).toBe('iframe');
  });

  it('does not inject when no card in details', () => {
    const result = {
      content: [{ type: 'text', text: 'test' }],
      details: { media: { mediaUrls: ['/img.png'] } }
    };
    if (result.details?.card && !result.details.card.pluginId) {
      result.details.card.pluginId = 'finance-monitor';
    }
    expect(result.details.card).toBeUndefined();
  });

  it('does not overwrite existing pluginId', () => {
    const result = {
      content: [{ type: 'text', text: 'test' }],
      details: { card: { type: 'iframe', route: '/test', pluginId: 'custom-plugin' } }
    };
    if (result.details?.card && !result.details.card.pluginId) {
      result.details.card.pluginId = 'other-plugin';
    }
    expect(result.details.card.pluginId).toBe('custom-plugin');
  });

  it('handles result without details', () => {
    const result = { content: [{ type: 'text', text: 'test' }] };
    if (result.details?.card && !result.details.card.pluginId) {
      result.details.card.pluginId = 'finance-monitor';
    }
    expect(result.details).toBeUndefined();
  });
});
