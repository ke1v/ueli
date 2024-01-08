import type { OperatingSystem } from "@common/OperatingSystem";
import { BrowserWindow, type App, type BrowserWindowConstructorOptions } from "electron";
import { join } from "path";
import type { DependencyInjector } from "../DependencyInjector";
import type { SettingsManager } from "../SettingsManager";
import { getBackgroundMaterial } from "./getBackgroundMaterial";

export const createBrowserWindow = (dependencyInjector: DependencyInjector) => {
    const app = dependencyInjector.getInstance<App>("App");
    const operatingSystem = dependencyInjector.getInstance<OperatingSystem>("OperatingSystem");
    const settingsManager = dependencyInjector.getInstance<SettingsManager>("SettingsManager");

    const preloadScriptFilePath = join(__dirname, "..", "dist-preload", "index.js");

    const defaultBrowserWindowOptions: BrowserWindowConstructorOptions = {
        width: 750,
        height: 500,
        frame: false,
        webPreferences: {
            preload: preloadScriptFilePath,
            webSecurity: app.isPackaged,
            spellcheck: false,
        },
    };

    const extendDefaultBrowserWindowOptions = (browserWindowOptions: BrowserWindowConstructorOptions) => {
        return {
            ...defaultBrowserWindowOptions,
            ...browserWindowOptions,
        };
    };

    const browserWindowOptionsMap: Record<OperatingSystem, BrowserWindowConstructorOptions> = {
        macOS: extendDefaultBrowserWindowOptions({ vibrancy: "under-window" }),
        Windows: extendDefaultBrowserWindowOptions({
            autoHideMenuBar: true,
            backgroundMaterial: getBackgroundMaterial(
                settingsManager.getSettingByKey("window.backgroundMaterial", "mica"),
            ),
        }),
        Linux: extendDefaultBrowserWindowOptions({}),
    };

    return new BrowserWindow(browserWindowOptionsMap[operatingSystem]);
};
