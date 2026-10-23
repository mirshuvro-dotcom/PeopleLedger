/** Shared JSON-schema fragments (ARCH-09: validate all inputs server side). */
export const uuid = { type: "string", format: "uuid" } as const;
export const isoDate = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
export const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max }) as const;
export const idParams = { type: "object", required: ["id"], additionalProperties: false, properties: { id: uuid } } as const;
export const limit = { type: "integer", minimum: 1, maximum: 100, default: 25 } as const;

export function body<P extends Record<string, unknown>>(required: readonly (keyof P & string)[], properties: P) {
  return { type: "object", required, additionalProperties: false, properties } as const;
}
