import { describe, expect, it } from "vitest";
import {
  MORE_FEATURE_IDS,
  createDefaultMoreFeaturesSettings
} from "@deepwrite/contracts/renderer";
import { configuredMoreFeatures, moreFeatures } from "./sidebarMoreFeatures";

describe("sidebar more features configuration", () => {
  it("covers every configurable feature in the original sidebar order", () => {
    expect(moreFeatures.map(({ id }) => id)).toEqual(MORE_FEATURE_IDS);
  });

  it("retains hidden entries for settings and projects the chosen order for navigation", () => {
    const preferences = createDefaultMoreFeaturesSettings()
      .reverse()
      .map((entry) => ({ ...entry, visible: entry.id !== "chat-assistant" }));
    const configured = configuredMoreFeatures(preferences);
    expect(configured).toHaveLength(moreFeatures.length);
    expect(configured.at(-1)).toMatchObject({
      id: "chat-assistant",
      visible: false,
      feature: { id: "chat-assistant" }
    });
    expect(
      configured
        .filter(({ visible }) => visible)
        .map(({ feature }) => feature.id)
    ).toEqual(preferences.filter(({ visible }) => visible).map(({ id }) => id));
  });
});
