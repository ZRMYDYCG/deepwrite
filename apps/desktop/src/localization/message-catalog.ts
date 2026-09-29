export interface MessageCatalog {
  [key: string]: string | MessageCatalog;
}

/** The build and loader share the same canonical schema representation. */
export function messageCatalogKeys(value: unknown): string[] {
  const keys: string[] = [];
  function visit(node: unknown, prefix: string): void {
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      Object.keys(node).length === 0
    ) {
      throw new Error("The application language catalog is malformed.");
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key || key.includes(".") || key.includes("\n")) {
        throw new Error("The application language catalog has an invalid key.");
      }
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "string") keys.push(path);
      else visit(child, path);
    }
  }
  visit(value, "");
  return keys.sort();
}
