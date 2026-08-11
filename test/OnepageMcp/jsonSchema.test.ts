import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { normalizeInputSchema, pickSchemaProperties } from '../../nodes/OnepageMcp/mcp/jsonSchema';

describe('normalizeInputSchema', () => {
  it('keeps a regular object schema untouched, including nested structures', () => {
    const schema = {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['draft', 'live'] } },
          required: ['status'],
        },
        ids: { type: 'array', items: { type: 'number' } },
      },
      required: ['filter'],
      additionalProperties: false,
    };

    expect(normalizeInputSchema(schema)).toBe(schema);
  });

  it('treats a tool without parameters as an empty object schema', () => {
    expect(normalizeInputSchema({ type: 'object', properties: {} })).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('turns a missing or empty schema into an empty object schema', () => {
    expect(normalizeInputSchema(undefined)).toEqual({ type: 'object', properties: {} });
    expect(normalizeInputSchema(null)).toEqual({ type: 'object', properties: {} });
    expect(normalizeInputSchema({})).toEqual({ type: 'object', properties: {} });
    expect(normalizeInputSchema('nonsense')).toEqual({ type: 'object', properties: {} });
  });

  it('accepts an object schema declared through a type union', () => {
    const schema = { type: ['object', 'null'], properties: { a: { type: 'string' } } };
    expect(normalizeInputSchema(schema)).toBe(schema);
  });

  it('accepts an untyped schema that only declares properties', () => {
    const schema = { properties: { a: { type: 'string' } } };
    expect(normalizeInputSchema(schema)).toBe(schema);
  });

  it('wraps a scalar root schema in a "value" property, like n8n does', () => {
    expect(normalizeInputSchema({ type: 'string', maxLength: 10 })).toEqual({
      type: 'object',
      properties: { value: { type: 'string', maxLength: 10 } },
      required: ['value'],
    });
  });
});

describe('pickSchemaProperties', () => {
  const schema = {
    type: 'object',
    properties: { pageId: { type: 'string' }, limit: { type: 'number' } },
    required: ['pageId'],
  };

  it('keeps only the declared properties', () => {
    expect(pickSchemaProperties({ pageId: 'p1', limit: 5, rogue: true }, schema)).toEqual({
      pageId: 'p1',
      limit: 5,
    });
  });

  it('omits declared properties the caller did not send', () => {
    expect(pickSchemaProperties({ pageId: 'p1' }, schema)).toEqual({ pageId: 'p1' });
  });

  it('passes everything through when the schema allows additional properties', () => {
    expect(
      pickSchemaProperties({ pageId: 'p1', extra: 1 }, { ...schema, additionalProperties: true }),
    ).toEqual({ pageId: 'p1', extra: 1 });
  });

  it('drops every argument for a tool without parameters', () => {
    expect(pickSchemaProperties({ anything: 1 }, { type: 'object', properties: {} })).toEqual({});
  });

  it('never copies prototype-polluting keys', () => {
    const args = JSON.parse('{"__proto__": {"polluted": true}, "pageId": "p1"}') as IDataObject;

    const permissive = pickSchemaProperties(args, { type: 'object', additionalProperties: true });
    expect(Object.prototype.hasOwnProperty.call(permissive, '__proto__')).toBe(false);
    expect(permissive).toEqual({ pageId: 'p1' });

    // Built via JSON.parse so `__proto__` really is an own property of `properties`,
    // which an object literal could not express.
    const hostileProperties = JSON.parse(
      '{"__proto__": {"type": "object"}, "pageId": {"type": "string"}}',
    ) as IDataObject;
    const declared = pickSchemaProperties(args, { type: 'object', properties: hostileProperties });
    expect(Object.prototype.hasOwnProperty.call(declared, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
