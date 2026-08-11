import type { IDataObject } from 'n8n-workflow';
import { isSafeObjectProperty, setSafeObjectProperty } from 'n8n-workflow';

import type { JsonSchemaObject } from './types';

const EMPTY_OBJECT_SCHEMA: JsonSchemaObject = { type: 'object', properties: {} };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectSchema(schema: Record<string, unknown>): boolean {
  if (schema.type === 'object') return true;
  if (Array.isArray(schema.type) && schema.type.includes('object')) return true;
  // No `type`, but object-only keywords present -> treat as an object schema.
  return schema.type === undefined && isPlainObject(schema.properties);
}

/**
 * Turns a server-provided `inputSchema` into an object schema usable as a structured tool schema.
 *
 * Mirrors n8n's `mcpToolToDynamicTool`, which wraps any non-object root schema as
 * `z.object({ value: rawSchema })`. Deviation: an absent / empty / untyped schema becomes
 * `{ type: 'object', properties: {} }` (a tool without parameters) instead of a `value: any`
 * wrapper — the MCP spec requires `inputSchema` to be an object schema, and a synthetic `value`
 * parameter would only mislead the LLM. Both variants end up sending no arguments anyway, because
 * the argument whitelist below is driven by `properties`.
 */
export function normalizeInputSchema(raw: unknown): JsonSchemaObject {
  if (!isPlainObject(raw) || Object.keys(raw).length === 0) {
    return { ...EMPTY_OBJECT_SCHEMA };
  }

  if (isObjectSchema(raw)) {
    return raw as JsonSchemaObject;
  }

  return {
    type: 'object',
    properties: { value: raw },
    required: ['value'],
  };
}

/**
 * Restricts tool-call arguments to the properties declared by the MCP input schema, unless the
 * schema opts into `additionalProperties: true`. Same rule as n8n's `runToolCall`.
 *
 * All writes go through `setSafeObjectProperty`, because both the schema and the arguments come
 * from untrusted sources (MCP server / LLM) and could carry `__proto__` or `constructor` keys.
 */
export function pickSchemaProperties(args: IDataObject, schema: JsonSchemaObject): IDataObject {
  const result: IDataObject = {};

  const keys =
    schema.additionalProperties === true
      ? Object.keys(args)
      : isPlainObject(schema.properties)
        ? Object.keys(schema.properties)
        : [];

  for (const key of keys) {
    if (!isSafeObjectProperty(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    setSafeObjectProperty(result, key, args[key]);
  }

  return result;
}
