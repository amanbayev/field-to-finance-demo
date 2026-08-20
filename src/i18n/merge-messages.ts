type Messages = Record<string, unknown>;

function isRecord(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeMessages<T extends Messages>(base: T, overlay: T): T {
  const result: Messages = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = mergeMessages(current, value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
