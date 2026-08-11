import { describe, expect, it } from 'vitest';

import {
  extractToolCallOutput,
  getErrorDescriptionFromToolCall,
  isStructuredContent,
  stringifyToolOutput,
} from '../../nodes/OnepageMcp/mcp/results';

describe('isStructuredContent', () => {
  it('accepts plain objects only', () => {
    expect(isStructuredContent({ total: 2 })).toBe(true);
    expect(isStructuredContent([{ total: 2 }])).toBe(false);
    expect(isStructuredContent(null)).toBe(false);
    expect(isStructuredContent(undefined)).toBe(false);
    expect(isStructuredContent('text')).toBe(false);
  });
});

describe('extractToolCallOutput', () => {
  it('prefers a legacy toolResult', () => {
    expect(extractToolCallOutput({ toolResult: 'legacy', content: [] })).toBe('legacy');
  });

  it('returns structuredContent before content', () => {
    const structuredContent = { total: 2 };
    expect(
      extractToolCallOutput({
        structuredContent,
        content: [{ type: 'text', text: '{"total":2}' }],
      }),
    ).toBe(structuredContent);
  });

  it('returns the content array when there is no structured content', () => {
    const content = [
      { type: 'text', text: 'first' },
      { type: 'image', data: 'base64', mimeType: 'image/png' },
    ];
    expect(extractToolCallOutput({ content })).toBe(content);
  });

  it('falls back to the whole result', () => {
    const result = { somethingElse: true };
    expect(extractToolCallOutput(result)).toBe(result);
  });
});

describe('getErrorDescriptionFromToolCall', () => {
  it('reads the first text block of an error result', () => {
    expect(
      getErrorDescriptionFromToolCall({
        isError: true,
        content: [{ type: 'image', data: 'x' }, { type: 'text', text: 'page not found' }],
      }),
    ).toBe('page not found');
  });

  it('reads a string toolResult', () => {
    expect(getErrorDescriptionFromToolCall({ toolResult: 'nope' })).toBe('nope');
  });

  it('reads a thrown error message', () => {
    expect(getErrorDescriptionFromToolCall(new Error('socket hang up'))).toBe('socket hang up');
  });

  it('returns undefined when there is nothing readable', () => {
    expect(getErrorDescriptionFromToolCall({ content: [] })).toBeUndefined();
    expect(getErrorDescriptionFromToolCall('plain string')).toBeUndefined();
    expect(getErrorDescriptionFromToolCall(null)).toBeUndefined();
  });
});

describe('stringifyToolOutput', () => {
  it('passes strings through', () => {
    expect(stringifyToolOutput('hello')).toBe('hello');
  });

  it('joins a pure text content array', () => {
    expect(
      stringifyToolOutput([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('a\nb');
  });

  it('serialises mixed content and structured objects as JSON', () => {
    expect(stringifyToolOutput([{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }])).toBe(
      '[{"type":"text","text":"a"},{"type":"image","data":"x"}]',
    );
    expect(stringifyToolOutput({ total: 2 })).toBe('{"total":2}');
  });

  it('handles values JSON cannot serialise', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(stringifyToolOutput(circular)).toBe('[object Object]');
    expect(stringifyToolOutput(undefined)).toBe('');
  });
});
