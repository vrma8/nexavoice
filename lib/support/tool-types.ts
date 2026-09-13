
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinitionBase {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  write: boolean;
}

export interface ToolOutcome {
  ok: boolean;
  result: Record<string, unknown>;
  summary: string;
}

export type ToolArgs = Record<string, unknown>;
