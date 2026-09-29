import {
  appearanceCustomFontCssFamily,
  appearanceCustomFontSourceUrl,
  type AppearanceCustomFont,
  type AppearanceCustomFontId
} from "@deepwrite/contracts/renderer";

interface FontFaceHandle {
  load(): Promise<unknown>;
}

export interface AppearanceFontRuntimeDependencies {
  createFontFace(family: string, source: string): FontFaceHandle;
  addFontFace(face: FontFaceHandle): void;
  deleteFontFace(face: FontFaceHandle): void;
  loadFontFamily(font: string, text: string): Promise<unknown>;
}

interface RegisteredFont {
  face: FontFaceHandle;
  font: AppearanceCustomFont;
}

interface PendingFontLoad {
  promise: Promise<void>;
  registered: RegisteredFont;
}

// Probe both CJK and Latin glyphs independently of the interface language.
const FONT_LOAD_SAMPLE = "DeepWrite 深度写作";

function fontSource(font: AppearanceCustomFont): string {
  const format = font.format === "ttf" ? "truetype" : "opentype";
  return `url("${appearanceCustomFontSourceUrl(font.id)}") format("${format}")`;
}

export class AppearanceFontRuntime {
  readonly #dependencies: AppearanceFontRuntimeDependencies;
  readonly #registered = new Map<AppearanceCustomFontId, RegisteredFont>();
  readonly #loaded = new Set<AppearanceCustomFontId>();
  readonly #pendingLoads = new Map<AppearanceCustomFontId, PendingFontLoad>();

  constructor(dependencies: AppearanceFontRuntimeDependencies) {
    this.#dependencies = dependencies;
  }

  synchronize(fonts: readonly AppearanceCustomFont[]): void {
    const nextIds = new Set(fonts.map((font) => font.id));
    for (const [id, registered] of this.#registered) {
      if (nextIds.has(id)) continue;
      this.#dependencies.deleteFontFace(registered.face);
      this.#registered.delete(id);
      this.#loaded.delete(id);
      this.#pendingLoads.delete(id);
    }

    for (const font of fonts) {
      if (this.#registered.has(font.id)) continue;
      const face = this.#dependencies.createFontFace(
        appearanceCustomFontCssFamily(font.id),
        fontSource(font)
      );
      this.#dependencies.addFontFace(face);
      this.#registered.set(font.id, { face, font });
    }
  }

  async load(id: AppearanceCustomFontId): Promise<void> {
    if (this.#loaded.has(id)) return;
    const registered = this.#registered.get(id);
    if (!registered) {
      throw new Error(`Custom font is not registered: ${id}`);
    }
    const pending = this.#pendingLoads.get(id);
    if (pending?.registered === registered) return pending.promise;

    const loading = (async () => {
      await registered.face.load();
      if (this.#registered.get(id) !== registered) {
        throw new Error(
          `Custom font registration changed while loading: ${id}`
        );
      }
      const family = appearanceCustomFontCssFamily(id);
      await this.#dependencies.loadFontFamily(
        `1em "${family}"`,
        FONT_LOAD_SAMPLE
      );
      if (this.#registered.get(id) !== registered) {
        throw new Error(
          `Custom font registration changed while loading: ${id}`
        );
      }
      this.#loaded.add(id);
    })();
    this.#pendingLoads.set(id, { promise: loading, registered });
    try {
      await loading;
    } finally {
      if (this.#pendingLoads.get(id)?.promise === loading) {
        this.#pendingLoads.delete(id);
      }
    }
  }

  isRegistered(id: AppearanceCustomFontId): boolean {
    return this.#registered.has(id);
  }

  isLoaded(id: AppearanceCustomFontId): boolean {
    return this.#loaded.has(id);
  }
}

export function createBrowserAppearanceFontRuntime(): AppearanceFontRuntime {
  if (typeof FontFace === "undefined" || !document.fonts) {
    throw new Error("This browser does not support custom fonts.");
  }
  return new AppearanceFontRuntime({
    createFontFace: (family, source) => new FontFace(family, source),
    addFontFace: (face) => {
      document.fonts.add(face as FontFace);
    },
    deleteFontFace: (face) => {
      document.fonts.delete(face as FontFace);
    },
    loadFontFamily: async (font, text) => {
      await document.fonts.load(font, text);
    }
  });
}
