import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { protocol } from "electron";
import {
  BookIdentityResolveCoverAssetInputSchema,
  BookIdentityResolveCoverAssetResultSchema,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts";
import { identityCore, type IdentityCore } from "./core-client";

export const COVER_PROTOCOL_SCHEME = "deepwrite-cover";

export function registerCoverScheme(
  registrar: Pick<typeof protocol, "registerSchemesAsPrivileged"> = protocol
): void {
  registrar.registerSchemesAsPrivileged([
    {
      scheme: COVER_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ]);
}

export interface CoverAsset {
  path: string;
  mimeType: string;
  byteSize: number;
}

export type CoverAssetResolver = (
  book: ChatAssistantProjectRef,
  file: string
) => Promise<CoverAsset>;

export function createCoverProtocolHandler(
  resolveAsset: CoverAssetResolver,
  openAsset: (path: string, flags: number) => Promise<FileHandle> = open
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { Allow: "GET" } });
    let book: ChatAssistantProjectRef;
    let file: string;
    try {
      const url = new URL(request.url);
      const validQuery =
        !url.search || /^\?revision=\d{1,15}$/u.test(url.search);
      if (
        url.protocol !== `${COVER_PROTOCOL_SCHEME}:` ||
        url.hostname !== "asset" ||
        url.port ||
        url.username ||
        url.password ||
        !validQuery ||
        url.hash ||
        /(?:%2e|%2f|%5c|\.\.)/iu.test(request.url)
      )
        throw new Error("invalid URL");
      const segments = url.pathname.split("/").slice(1).map(decodeURIComponent);
      const parsed = BookIdentityResolveCoverAssetInputSchema.parse({
        book: { projectType: segments[0], projectId: segments[1] },
        file: segments.slice(2).join("/")
      });
      book = parsed.book;
      file = parsed.file;
    } catch {
      return new Response(null, { status: 400 });
    }
    let handle: FileHandle | undefined;
    try {
      const asset = await resolveAsset(book, file);
      handle = await openAsset(
        asset.path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.size !== asset.byteSize ||
        stat.size <= 0 ||
        stat.size > 25 * 1024 * 1024
      )
        throw new Error("invalid image");
      if (request.signal.aborted) throw new Error("aborted");
      const stream = handle.createReadStream({
        autoClose: true,
        start: 0,
        end: stat.size - 1
      });
      handle = undefined;
      const abort = () => stream.destroy();
      request.signal.addEventListener("abort", abort, { once: true });
      stream.once("close", () =>
        request.signal.removeEventListener("abort", abort)
      );
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        {
          headers: {
            "Content-Type": asset.mimeType,
            "Content-Length": String(asset.byteSize),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    } catch {
      await handle?.close().catch(() => undefined);
      return new Response(null, { status: 404 });
    }
  };
}

export function coreCoverAssetResolver(core: IdentityCore): CoverAssetResolver {
  return async (book, file) =>
    BookIdentityResolveCoverAssetResultSchema.parse(
      await identityCore(
        core,
        "bookIdentity.resolveCoverAsset",
        { book, file },
        book
      )
    );
}

export function installCoverProtocolHandler(
  core: IdentityCore,
  installer: Pick<typeof protocol, "handle"> = protocol
): void {
  installer.handle(
    COVER_PROTOCOL_SCHEME,
    createCoverProtocolHandler(coreCoverAssetResolver(core))
  );
}
