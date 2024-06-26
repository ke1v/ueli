import type { Dependencies } from "@Core/Dependencies";
import type { DependencyRegistry } from "@Core/DependencyRegistry";
import type { EnvironmentVariableProvider } from "@Core/EnvironmentVariableProvider";
import type { EventSubscriber } from "@Core/EventSubscriber";
import type { SettingsManager } from "@Core/SettingsManager";
import type { UeliCommand, UeliCommandInvokedEvent } from "@Core/UeliCommand";
import { OperatingSystem } from "@common/Core";
import type { App, BrowserWindow } from "electron";
import { join } from "path";
import { AppIconFilePathResolver } from "./AppIconFilePathResolver";
import {
    BackgroundMaterialProvider,
    BrowserWindowConstructorOptionsProvider,
    DefaultBrowserWindowConstructorOptionsProvider,
    LinuxBrowserWindowConstructorOptionsProvider,
    MacOsBrowserWindowConstructorOptionsProvider,
    VibrancyProvider,
    WindowsBrowserWindowConstructorOptionsProvider,
    defaultWindowSize,
} from "./BrowserWindowConstructorOptionsProvider";
import { BrowserWindowCreator } from "./BrowserWindowCreator";
import { WindowBoundsMemory } from "./WindowBoundsMemory";
import { openAndFocusBrowserWindow } from "./openAndFocusBrowserWindow";
import { sendToBrowserWindow } from "./sendToBrowserWindow";
import { toggleBrowserWindow } from "./toggleBrowserWindow";

export class BrowserWindowModule {
    public static async bootstrap(dependencyRegistry: DependencyRegistry<Dependencies>) {
        const app = dependencyRegistry.get("App");
        const operatingSystem = dependencyRegistry.get("OperatingSystem");
        const settingsManager = dependencyRegistry.get("SettingsManager");
        const eventEmitter = dependencyRegistry.get("EventEmitter");
        const nativeTheme = dependencyRegistry.get("NativeTheme");
        const assetPathResolver = dependencyRegistry.get("AssetPathResolver");

        const windowBoundsMemory = new WindowBoundsMemory(dependencyRegistry.get("Screen"), {});

        const appIconFilePathResolver = new AppIconFilePathResolver(nativeTheme, assetPathResolver, operatingSystem);

        const defaultBrowserWindowOptions = new DefaultBrowserWindowConstructorOptionsProvider(
            app,
            settingsManager,
            appIconFilePathResolver,
        ).get();

        const virancyProvider = new VibrancyProvider(settingsManager);
        const backgroundMaterialProvider = new BackgroundMaterialProvider(settingsManager);

        const browserWindowConstructorOptionsProviders: Record<
            OperatingSystem,
            BrowserWindowConstructorOptionsProvider
        > = {
            Linux: new LinuxBrowserWindowConstructorOptionsProvider(defaultBrowserWindowOptions),
            macOS: new MacOsBrowserWindowConstructorOptionsProvider(defaultBrowserWindowOptions, virancyProvider),
            Windows: new WindowsBrowserWindowConstructorOptionsProvider(
                defaultBrowserWindowOptions,
                backgroundMaterialProvider,
            ),
        };

        const browserWindow = new BrowserWindowCreator(
            browserWindowConstructorOptionsProviders[operatingSystem],
        ).create();

        eventEmitter.emitEvent("browserWindowCreated", { browserWindow });

        nativeTheme.addListener("updated", () => browserWindow.setIcon(appIconFilePathResolver.getAppIconFilePath()));

        BrowserWindowModule.registerBrowserWindowEventListeners(
            browserWindow,
            dependencyRegistry.get("SettingsManager"),
            windowBoundsMemory,
        );

        BrowserWindowModule.registerEvents(
            browserWindow,
            app,
            dependencyRegistry.get("EventSubscriber"),
            windowBoundsMemory,
            settingsManager,
            virancyProvider,
            backgroundMaterialProvider,
        );

        await BrowserWindowModule.loadFileOrUrl(browserWindow, dependencyRegistry.get("EnvironmentVariableProvider"));
    }

    private static registerBrowserWindowEventListeners(
        browserWindow: BrowserWindow,
        settingsManager: SettingsManager,
        windowBoundsMemory: WindowBoundsMemory,
    ) {
        const shouldHideWindowOnBlur = () => settingsManager.getValue("window.hideWindowOnBlur", true);

        browserWindow.on("blur", () => shouldHideWindowOnBlur() && browserWindow.hide());
        browserWindow.on("moved", () => windowBoundsMemory.saveWindowBounds(browserWindow));
        browserWindow.on("resized", () => windowBoundsMemory.saveWindowBounds(browserWindow));
    }

    private static registerEvents(
        browserWindow: BrowserWindow,
        app: App,
        eventSubscriber: EventSubscriber,
        windowBoundsMemory: WindowBoundsMemory,
        settingsManager: SettingsManager,
        vibrancyProvider: VibrancyProvider,
        backgroundMaterialProvider: BackgroundMaterialProvider,
    ) {
        eventSubscriber.subscribe("hotkeyPressed", () => {
            toggleBrowserWindow({
                app,
                browserWindow,
                defaultSize: defaultWindowSize,
                alwaysCenter: settingsManager.getValue("window.alwaysCenter", false),
                bounds: windowBoundsMemory.getBoundsNearestToCursor(),
            });
        });

        eventSubscriber.subscribe("settingUpdated", ({ key, value }: { key: string; value: unknown }) => {
            sendToBrowserWindow(browserWindow, `settingUpdated[${key}]`, { value });
        });

        eventSubscriber.subscribe("settingUpdated[window.alwaysOnTop]", ({ value }: { value: boolean }) => {
            browserWindow.setAlwaysOnTop(value);
        });

        eventSubscriber.subscribe("settingUpdated[window.backgroundMaterial]", () => {
            browserWindow.setBackgroundMaterial(backgroundMaterialProvider.get());
        });

        eventSubscriber.subscribe("settingUpdated[window.vibrancy]", () => {
            browserWindow.setVibrancy(vibrancyProvider.get());
        });

        eventSubscriber.subscribe("navigateTo", ({ pathname }: { pathname: string }) => {
            openAndFocusBrowserWindow(browserWindow);
            sendToBrowserWindow(browserWindow, "navigateTo", { pathname });
        });

        BrowserWindowModule.registerUeliCommandEvents(browserWindow, eventSubscriber);
    }

    private static registerUeliCommandEvents(browserWindow: BrowserWindow, eventSubscriber: EventSubscriber) {
        const eventHandlers: { ueliCommands: UeliCommand[]; handler: (argument: unknown) => void }[] = [
            {
                ueliCommands: ["openAbout", "openExtensions", "openSettings", "show"],
                handler: ({ pathname }: { pathname: string }) => {
                    openAndFocusBrowserWindow(browserWindow);
                    sendToBrowserWindow(browserWindow, "navigateTo", { pathname });
                },
            },
            {
                ueliCommands: ["centerWindow"],
                handler: () => browserWindow.center(),
            },
        ];

        eventSubscriber.subscribe("ueliCommandInvoked", (event: UeliCommandInvokedEvent<unknown>) => {
            for (const eventHandler of eventHandlers) {
                if (eventHandler.ueliCommands.includes(event.ueliCommand)) {
                    eventHandler.handler(event.argument);
                }
            }
        });
    }

    private static async loadFileOrUrl(
        browserWindow: BrowserWindow,
        environmentVariableProvider: EnvironmentVariableProvider,
    ) {
        await (environmentVariableProvider.get("VITE_DEV_SERVER_URL")
            ? browserWindow.loadURL(environmentVariableProvider.get("VITE_DEV_SERVER_URL"))
            : browserWindow.loadFile(join(__dirname, "..", "dist-renderer", "index.html")));
    }
}
