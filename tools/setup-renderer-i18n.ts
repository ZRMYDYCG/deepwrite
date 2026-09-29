import { initializeTestTranslations } from "../apps/desktop/src/test-utils/rendererI18n";

// Integration tests can import Renderer controllers too. Register the serialized
// fixture in every context, without evaluating hundreds of resource modules.
await initializeTestTranslations();
