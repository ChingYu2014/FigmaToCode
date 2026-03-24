import { tailwindCodeGenTextStyles } from "./../../../packages/backend/src/tailwind/tailwindMain";
import {
  run,
  flutterMain,
  tailwindMain,
  swiftuiMain,
  htmlMain,
  composeMain,
  postSettingsChanged,
} from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { retrieveGenericSolidUIColors } from "backend/src/common/retrieveUI/retrieveColors";
import { flutterCodeGenTextStyles } from "backend/src/flutter/flutterMain";
import { htmlCodeGenTextStyles } from "backend/src/html/htmlMain";
import { swiftUICodeGenTextStyles } from "backend/src/swiftui/swiftuiMain";
import { composeCodeGenTextStyles } from "backend/src/compose/composeMain";
import { PluginSettings, SettingWillChangeMessage } from "types";

let userPluginSettings: PluginSettings;

export const defaultPluginSettings: PluginSettings = {
  framework: "HTML",
  showLayerNames: false,
  useOldPluginVersion2025: false,
  responsiveRoot: false,
  flutterGenerationMode: "snippet",
  swiftUIGenerationMode: "snippet",
  composeGenerationMode: "snippet",
  roundTailwindValues: true,
  roundTailwindColors: true,
  useColorVariables: true,
  customTailwindPrefix: "",
  embedImages: false,
  embedVectors: false,
  htmlGenerationMode: "html",
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: false,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

// A helper type guard to ensure the key belongs to the PluginSettings type
function isKeyOfPluginSettings(key: string): key is keyof PluginSettings {
  return key in defaultPluginSettings;
}

const getUserSettings = async () => {
  const possiblePluginSrcSettings =
    (await figma.clientStorage.getAsync("userPluginSettings")) ?? {};

  const updatedPluginSrcSettings = {
    ...defaultPluginSettings,
    ...Object.keys(defaultPluginSettings).reduce((validSettings, key) => {
      if (
        isKeyOfPluginSettings(key) &&
        key in possiblePluginSrcSettings &&
        typeof possiblePluginSrcSettings[key] ===
          typeof defaultPluginSettings[key]
      ) {
        validSettings[key] = possiblePluginSrcSettings[key] as any;
      }
      return validSettings;
    }, {} as Partial<PluginSettings>),
  };

  userPluginSettings = updatedPluginSrcSettings as PluginSettings;
  return userPluginSettings;
};

const initSettings = async () => {
  await getUserSettings();
  postSettingsChanged(userPluginSettings);
  safeRun(userPluginSettings);
};

// Used to prevent running from happening again.
let isLoading = false;
const safeRun = async (settings: PluginSettings) => {
  if (isLoading === false) {
    try {
      isLoading = true;
      await run(settings);
      // hack to make it not immediately set to false when complete. (executes on next frame)
      setTimeout(() => {
        isLoading = false;
      }, 1);
    } catch (e) {
      isLoading = false;
      if (e && typeof e === "object" && "message" in e) {
        const error = e as Error;
        console.error("Plugin error:", error.stack);
        figma.ui.postMessage({ type: "error", error: error.message });
      } else {
        const errorMessage = String(e);
        console.error("Plugin error:", errorMessage);
        figma.ui.postMessage({
          type: "error",
          error: errorMessage || "Unknown error occurred",
        });
      }

      figma.ui.postMessage({ type: "conversion-complete", success: false });
    }
  }
};

const standardMode = async () => {
  figma.showUI(__html__, { width: 450, height: 700, themeColors: true });
  await initSettings();

  figma.on("selectionchange", () => {
    safeRun(userPluginSettings);
  });

  figma.loadAllPagesAsync();
  figma.on("documentchange", () => {
    safeRun(userPluginSettings);
  });

  figma.ui.onmessage = async (msg) => {
    if (msg.type === "pluginSettingWillChange") {
      const { key, value } = msg as SettingWillChangeMessage<unknown>;
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
      safeRun(userPluginSettings);
    } else if (msg.type === "export-selection-png") {
      const nodes = figma.currentPage.selection;
      if (nodes.length === 0) {
        figma.ui.postMessage({ type: "export-png-result", data: null });
        return;
      }
      try {
        const node = nodes[0];
        const pngBytes = await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 },
        });
        figma.ui.postMessage({
          type: "export-png-result",
          data: Array.from(pngBytes),
        });
      } catch (error) {
        console.error("Error exporting PNG:", error);
        figma.ui.postMessage({ type: "export-png-result", data: null });
      }
    } else if (msg.type === "get-selection-json") {
      const nodes = figma.currentPage.selection;
      if (nodes.length === 0) {
        figma.ui.postMessage({
          type: "selection-json",
          data: { message: "No nodes selected" },
        });
        return;
      }
      const result: {
        json?: SceneNode[];
        oldConversion?: any;
        newConversion?: any;
      } = {};

      try {
        result.json = (await Promise.all(
          nodes.map(
            async (node) =>
              (
                (await node.exportAsync({
                  format: "JSON_REST_V1",
                })) as any
              ).document,
          ),
        )) as SceneNode[];
      } catch (error) {
        console.error("Error exporting JSON:", error);
      }

      try {
        const newNodes = await nodesToJSON(nodes, userPluginSettings);
        const removeParent = (node: any) => {
          if (node.parent) {
            delete node.parent;
          }
          if (node.children) {
            node.children.forEach(removeParent);
          }
        };
        newNodes.forEach(removeParent);
        result.newConversion = newNodes;
      } catch (error) {
        console.error("Error in new conversion:", error);
      }

      const nodeJson = result;

      figma.ui.postMessage({
        type: "selection-json",
        data: nodeJson,
      });
    }
  };
};

const codegenMode = async () => {
  await getUserSettings();

  figma.codegen.on(
    "generate",
    async ({ language, node }: CodegenEvent): Promise<CodegenResult[]> => {
      const convertedSelection = await nodesToJSON([node], userPluginSettings);

      switch (language) {
        case "html":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "html" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];
        case "html_jsx":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "jsx" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_svelte":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "svelte" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_styled_components":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  {
                    ...userPluginSettings,
                    htmlGenerationMode: "styled-components",
                  },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "tailwind":
          return [
            {
              title: "Code",
              code: await tailwindMain(convertedSelection, {
                ...userPluginSettings,
                tailwindGenerationMode: "html",
              }),
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: tailwindCodeGenTextStyles(),
              language: "HTML",
            },
          ];

        case "tailwind_jsx":
          return [
            {
              title: "Code",
              code: await tailwindMain(convertedSelection, {
                ...userPluginSettings,
                tailwindGenerationMode: "jsx",
              }),
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: tailwindCodeGenTextStyles(),
              language: "HTML",
            },
          ];

        case "flutter":
          return [
            {
              title: "Code",
              code: await flutterMain(convertedSelection, userPluginSettings),
              language: "PLAINTEXT",
            },
            {
              title: "Text Styles",
              code: flutterCodeGenTextStyles(),
              language: "PLAINTEXT",
            },
          ];

        case "swiftUI":
          return [
            {
              title: "Code",
              code: await swiftuiMain(convertedSelection, userPluginSettings),
              language: "PLAINTEXT",
            },
            {
              title: "Text Styles",
              code: swiftUICodeGenTextStyles(),
              language: "PLAINTEXT",
            },
          ];

        // case "compose":
        //   return [
        //     {
        //       title: "Code",
        //       code: composeMain(convertedSelection, userPluginSettings),
        //       language: "PLAINTEXT",
        //     },
        //     {
        //       title: "Text Styles",
        //       code: composeCodeGenTextStyles(),
        //       language: "PLAINTEXT",
        //     },
        //   ];

        default:
          return [];
      }
    },
  );

  figma.codegen.on("preferenceschange", async (event: CodegenPreferencesEvent) => {
    const { propertyName, newValue } = event;
    if (isKeyOfPluginSettings(propertyName)) {
      const typedValue =
        typeof defaultPluginSettings[propertyName] === "boolean"
          ? newValue === "true"
          : newValue;
      (userPluginSettings as any)[propertyName] = typedValue;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
    }
  });
};

if (figma.editorType === "dev" || figma.mode === "codegen") {
  codegenMode();
} else {
  standardMode();
}
