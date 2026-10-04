import { ref } from "vue";

export interface EditorCompositionChange {
  id: string;
  composing: boolean;
}

/** Leave the IME's temporary DOM text alone until its candidate is committed. */
export function editorCompositionValue(
  content: string,
  input: HTMLTextAreaElement | null | undefined,
  composing: boolean
): string {
  return composing && input ? input.value : content;
}

export function useEditorComposition(
  options: {
    onChange?(composing: boolean): void;
  } = {}
) {
  const isComposing = ref(false);

  function start(): void {
    if (isComposing.value) return;
    isComposing.value = true;
    options.onChange?.(true);
  }

  function isComposingInput(event: Event): boolean {
    if ("isComposing" in event && event.isComposing === true) start();
    return isComposing.value;
  }

  function finish(commit: () => void): void {
    if (!isComposing.value) return;
    isComposing.value = false;
    try {
      commit();
    } finally {
      options.onChange?.(false);
    }
  }

  function reset(): void {
    finish(() => {});
  }

  function valueForRender(
    content: string,
    input: HTMLTextAreaElement | null | undefined
  ): string {
    // Read the DOM on each render; a computed value would cache an older
    // candidate and overwrite a later composition update on an unrelated render.
    return editorCompositionValue(content, input, isComposing.value);
  }

  return {
    isComposing,
    start,
    finish,
    reset,
    isComposingInput,
    valueForRender
  };
}

export type EditorComposition = ReturnType<typeof useEditorComposition>;
