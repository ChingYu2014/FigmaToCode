import { useEffect, useState, useRef, useCallback } from "react";
import { PluginUI } from "plugin-ui";
import {
  Framework,
  PluginSettings,
  ConversionMessage,
  Message,
  HTMLPreview,
  LinearGradientConversion,
  SolidColorConversion,
  ErrorMessage,
  SettingsChangedMessage,
  Warning,
} from "types";
import { postUIMessage, postUISettingsChangingMessage } from "./messaging";
import copy from "copy-to-clipboard";

interface AppState {
  code: string;
  textStyles: string;
  selectedNodeName?: string;
  selectedNodeSize?: { width: number; height: number };
  selectedFramework: Framework;
  isLoading: boolean;
  htmlPreview: HTMLPreview;
  settings: PluginSettings | null;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
}

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };

export default function App() {
  const [state, setState] = useState<AppState>({
    code: "",
    textStyles: "",
    selectedFramework: "HTML",
    isLoading: false,
    htmlPreview: emptyPreview,
    settings: null,
    colors: [],
    gradients: [],
    warnings: [],
  });

  const pngCallbackRef = useRef<((data: number[] | null) => void) | null>(null);

  const requestExportPng = useCallback((): Promise<number[] | null> => {
    return new Promise((resolve) => {
      pngCallbackRef.current = resolve;
      postUIMessage(
        { type: "export-selection-png" },
        { targetOrigin: "*" },
      );
      setTimeout(() => {
        if (pngCallbackRef.current) {
          pngCallbackRef.current = null;
          resolve(null);
        }
      }, 10000);
    });
  }, []);

  const rootStyles = getComputedStyle(document.documentElement);
  const figmaColorBgValue = rootStyles
    .getPropertyValue("--figma-color-bg")
    .trim();

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      const untypedMessage = msg as Message;

      // Handle PNG export result
      if (untypedMessage.type === "export-png-result") {
        if (pngCallbackRef.current) {
          pngCallbackRef.current((msg as any).data);
          pngCallbackRef.current = null;
        }
        return;
      }

      switch (untypedMessage.type) {
        case "conversionStart":
          setState((prevState) => ({
            ...prevState,
            code: "",
            isLoading: true,
          }));
          break;

        case "code":
          const conversionMessage = untypedMessage as ConversionMessage;
          setState((prevState) => ({
            ...prevState,
            ...conversionMessage,
            selectedFramework: conversionMessage.settings.framework,
            isLoading: false,
          }));
          break;

        case "pluginSettingChanged":
          const settingsMessage = untypedMessage as SettingsChangedMessage;
          setState((prevState) => ({
            ...prevState,
            settings: settingsMessage.settings,
            selectedFramework: settingsMessage.settings.framework,
          }));
          break;

        case "empty":
          setState((prevState) => ({
            ...prevState,
            code: "",
            selectedNodeName: undefined,
            selectedNodeSize: undefined,
            htmlPreview: emptyPreview,
            warnings: [],
            colors: [],
            gradients: [],
            isLoading: false,
          }));
          break;

        case "error":
          const errorMessage = untypedMessage as ErrorMessage;
          setState((prevState) => ({
            ...prevState,
            colors: [],
            gradients: [],
            code: `Error :(\n// ${errorMessage.error}`,
            isLoading: false,
          }));
          break;

        case "selection-json":
          const json = event.data.pluginMessage.data;
          copy(JSON.stringify(json, null, 2));

        default:
          break;
      }
    };

    return () => {
      window.onmessage = null;
    };
  }, []);

  const handleFrameworkChange = (updatedFramework: Framework) => {
    if (updatedFramework !== state.selectedFramework) {
      setState((prevState) => ({
        ...prevState,
        selectedFramework: updatedFramework,
      }));
      postUISettingsChangingMessage("framework", updatedFramework, {
        targetOrigin: "*",
      });
    }
  };
  const handlePreferencesChange = (
    key: keyof PluginSettings,
    value: boolean | string | number,
  ) => {
    if (state.settings && state.settings[key] === value) {
      // do nothing
    } else {
      postUISettingsChangingMessage(key, value, { targetOrigin: "*" });
    }
  };

  const darkMode = figmaColorBgValue !== "#ffffff";

  return (
    <div className={`${darkMode ? "dark" : ""}`}>
      <PluginUI
        isLoading={state.isLoading}
        code={state.code}
        textStyles={state.textStyles}
        selectedNodeName={state.selectedNodeName}
        selectedNodeSize={state.selectedNodeSize}
        warnings={state.warnings}
        selectedFramework={state.selectedFramework}
        setSelectedFramework={handleFrameworkChange}
        onPreferenceChanged={handlePreferencesChange}
        htmlPreview={state.htmlPreview}
        settings={state.settings}
        colors={state.colors}
        gradients={state.gradients}
        onRequestExportPng={requestExportPng}
      />
    </div>
  );
}
