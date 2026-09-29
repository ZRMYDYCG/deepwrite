import { messageCatalogKeys } from "../../../localization/message-catalog";
import resources from "virtual:deepwrite-locale-resources";
import type { AppLocale } from "../../../localization/locale";
import type { MessageSchema } from "./messages";
import { registerMessageCatalog } from "./index";

/** XHR supports packaged file:// assets as well as the Vite development server. */
function readCatalog(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "json";
    request.timeout = 15_000;
    request.onload = () => {
      if (
        (request.status === 0 || request.status === 200) &&
        request.response &&
        typeof request.response === "object"
      ) {
        resolve(request.response);
      } else
        reject(
          new Error("The application language resources could not be read.")
        );
    };
    request.onerror = () =>
      reject(
        new Error("The application language resources could not be loaded.")
      );
    request.ontimeout = () =>
      reject(
        new Error("Loading the application language resources timed out.")
      );
    request.send();
  });
}

export async function loadMessageCatalogs(): Promise<void> {
  const catalogs = await Promise.all(
    (
      Object.entries(resources) as [
        AppLocale,
        { url: string; schema: string }
      ][]
    ).map(async ([language, resource]) => {
      const messages = await readCatalog(resource.url);
      const shape = new TextEncoder().encode(
        messageCatalogKeys(messages).join("\n")
      );
      const digest = await crypto.subtle.digest("SHA-256", shape);
      const schema = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (schema !== resource.schema) {
        throw new Error("The application language catalog is incomplete.");
      }
      return { language, messages: messages as MessageSchema };
    })
  );
  for (const { language, messages } of catalogs)
    registerMessageCatalog(language, messages);
}
