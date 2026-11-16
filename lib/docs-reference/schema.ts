/**
 * Turns the zod input shapes of the API actions and MCP tools into rows for the docs
 * tables, so a parameter, its range or its description is written once, in the code.
 */
import { z } from "zod";

export type ParamRow = { name: string; type: string; required: boolean; description: string };

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const number = (value: number) => value.toLocaleString("en-US");

/** "integer, 10 to 100", "one of: spot, perps", "array of string (1 to 14)". */
export function describeType(schema: JsonSchema): string {
  if (schema.enum) return `one of: ${schema.enum.join(", ")}`;
  const type = Array.isArray(schema.type) ? schema.type.join(" or ") : (schema.type ?? "any");
  if (type === "number" || type === "integer") {
    const { minimum: min, maximum: max } = schema;
    if (min !== undefined && max !== undefined) return `${type}, ${number(min)} to ${number(max)}`;
    if (min !== undefined) return `${type}, at least ${number(min)}`;
    if (max !== undefined) return `${type}, at most ${number(max)}`;
    return type;
  }
  if (type === "string") {
    if (schema.format === "uuid") return "string (uuid)";
    if (schema.maxLength !== undefined) return `string, up to ${number(schema.maxLength)} characters`;
    return "string";
  }
  if (type === "array") {
    const items = schema.items ? describeType(schema.items) : "any";
    const count = schema.maxItems !== undefined ? ` (${schema.minItems ?? 0} to ${schema.maxItems})` : "";
    return `array of ${items}${count}`;
  }
  return type;
}

export function paramRows(shape: z.ZodRawShape): ParamRow[] {
  const schema = z.toJSONSchema(z.object(shape), { unrepresentable: "any" }) as JsonSchema;
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    type: describeType(property),
    required: required.has(name),
    description: property.description ?? "",
  }));
}
