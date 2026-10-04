import type { ChatMessage } from "../../types/conversation";
import type { ConversationHistoryChange } from "@deepwrite/contracts";
import type { MessageMutation } from "./message-mutations";
import { clonePersistenceValue } from "./persistence-changes";

export type FieldMutation = Omit<
  Extract<MessageMutation, { type: "field" }>,
  "previous" | "value"
> & { revision: number };
export function recordFieldMutation(
  event: Extract<MessageMutation, { type: "field" }>,
  revision: number
): FieldMutation {
  const { previous, value, ...mutation } = event;
  if (event.appendText !== undefined) return { ...mutation, revision };
  const appendText =
    !event.removed &&
    typeof previous === "string" &&
    typeof value === "string" &&
    value.startsWith(previous)
      ? value.slice(previous.length)
      : undefined;
  return {
    ...mutation,
    revision,
    ...(appendText !== undefined ? { appendText } : {})
  };
}
const contains = (parent: (string | number)[], child: (string | number)[]) =>
  parent.length <= child.length &&
  parent.every((part, index) => part === child[index]);
function readPath(message: ChatMessage, path: (string | number)[]): unknown {
  let value: unknown = message;
  for (const part of path) {
    if (!value || typeof value !== "object")
      throw new Error(
        "Cannot capture a field inside an unloaded conversation detail."
      );
    value = Reflect.get(value, part);
  }
  return value;
}

/** A replaced object already contains subsequent writes below it. Read that
 * object once at capture; emitting its descendant appends as well duplicates
 * text. Pure tail appends keep their captured chunks; only their target is read
 * to reject a detail that was unloaded before capture.
 */
export function captureFieldChanges(
  events: FieldMutation[],
  message: ChatMessage
): ConversationHistoryChange[] {
  const replacements = new Map<string, FieldMutation>();
  const appends = new Map<
    string,
    { path: (string | number)[]; chunks: string[] }
  >();
  for (const event of events) {
    const key = JSON.stringify(event.path);
    if (event.appendText !== undefined) {
      const append = appends.get(key) ?? { path: event.path, chunks: [] };
      append.chunks.push(event.appendText);
      appends.set(key, append);
    } else replacements.set(key, event);
  }
  const parents = [...replacements.values()].filter(
    (candidate) =>
      ![...replacements.values()].some(
        (other) =>
          other !== candidate &&
          other.path.length < candidate.path.length &&
          contains(other.path, candidate.path)
      )
  );
  const result: ConversationHistoryChange[] = parents.map((event) => {
    const value = readPath(message, event.path);
    if (value === undefined) {
      if (!event.removed)
        throw new Error(
          "Cannot capture an unloaded conversation field as a removal."
        );
      return { op: "remove", path: event.path };
    }
    return { op: "set", path: event.path, value: clonePersistenceValue(value) };
  });
  for (const append of appends.values()) {
    if (parents.some((parent) => contains(parent.path, append.path))) continue;
    if (typeof readPath(message, append.path) !== "string")
      throw new Error("Cannot append to an unloaded conversation field.");
    const text = append.chunks.join("");
    for (let offset = 0; offset < text.length; offset += 64 * 1024) {
      result.push({
        op: "append",
        path: append.path,
        text: text.slice(offset, offset + 64 * 1024)
      });
    }
  }
  return result;
}
