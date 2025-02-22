import type { AssetPathResolver } from "@Core/AssetPathResolver";
import type { EnvironmentVariableProvider } from "@Core/EnvironmentVariableProvider";
import type { FileSystemUtility } from "@Core/FileSystemUtility";
import type { FileImageGenerator } from "@Core/ImageGenerator";
import type { IniFileParser } from "@Core/IniFileParser/";
import type { Logger } from "@Core/Logger";
import type { Image } from "@common/Core/Image";
import { extname } from "path";
import type { Application } from "../Application";
import type { ApplicationRepository } from "../ApplicationRepository";
import type { Settings } from "../Settings";
import { LinuxApplication } from "./LinuxApplication";

export class LinuxApplicationRepository implements ApplicationRepository {
    public constructor(
        private readonly fileSystemUtility: FileSystemUtility,
        private readonly fileImageGenerator: FileImageGenerator,
        private readonly iniParser: IniFileParser,
        private readonly environmentVariableProvider: EnvironmentVariableProvider,
        private readonly assetPathResolver: AssetPathResolver,
        private readonly logger: Logger,
        private readonly settings: Settings,
    ) {}

    public async getApplications(): Promise<Application[]> {
        const folderPaths = this.settings
            .getValue<string[]>("linuxFolders")
            .filter((folderPath) => this.fileSystemUtility.isDirectory(folderPath));

        const filePaths = await this.getApplicationFilePaths(folderPaths);

        return await this.generateLinuxApplications(filePaths);
    }

    private async getApplicationFilePaths(folderPaths: string[]): Promise<string[]> {
        const readDirectoryPromiseResults = await Promise.allSettled(
            folderPaths.map((folderPath) => this.fileSystemUtility.readDirectory(folderPath)),
        );

        const result: string[] = [];

        for (const readDirectoryPromiseResult of readDirectoryPromiseResults) {
            if (readDirectoryPromiseResult.status === "fulfilled") {
                result.push(...readDirectoryPromiseResult.value.filter((filePath) => extname(filePath) === ".desktop"));
            } else {
                this.logger.warn(readDirectoryPromiseResult.reason);
                continue;
            }
        }

        return result;
    }

    private async generateLinuxApplications(filePaths: string[]): Promise<LinuxApplication[]> {
        const applicationPromiseResults = await Promise.allSettled(
            filePaths.map((filePath) => this.generateLinuxApplication(filePath)),
        );

        const applications: LinuxApplication[] = [];

        for (let i = 0; i < applicationPromiseResults.length; i++) {
            const filePath = filePaths[i];
            const promiseReuslt = applicationPromiseResults[i];

            if (promiseReuslt.status === "fulfilled") {
                if (promiseReuslt.value) {
                    applications.push(promiseReuslt.value);
                }
            } else {
                this.logger.warn(`Unable to generate Application for ${filePath}. Reason: ${promiseReuslt.reason}`);
                continue;
            }
        }

        return applications;
    }

    private async generateLinuxApplication(filePath: string): Promise<LinuxApplication | undefined> {
        const config: Record<string, string> = this.iniParser.parseIniFileContent(
            (await this.fileSystemUtility.readFile(filePath)).toString(),
        )["Desktop Entry"];

        if (!config) {
            throw new Error(`Unable to parse .desktop at ${filePath}`);
        }

        const appName = config["Name"] ?? filePath;

        // https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html#recognized-keys
        const desktopEnv = this.environmentVariableProvider.get("ORIGINAL_XDG_CURRENT_DESKTOP")?.split(":") ?? [];

        if (
            config.NoDisplay === "true" ||
            (config.OnlyShowIn && !config.OnlyShowIn.split(";").some((i) => desktopEnv.includes(i))) ||
            (config.NotShowIn && config.NotShowIn.split(";").some((i) => desktopEnv.includes(i)))
        ) {
            return undefined;
        }

        let appIcon = this.getDefaultAppIcon();

        try {
            appIcon = await this.fileImageGenerator.getImage(filePath);
        } catch (error) {
            this.logger.error(`Using fallback icon for ${appName}. Reason: ${error}`);
        }

        return new LinuxApplication(appName, filePath, appIcon);
    }

    private getDefaultAppIcon(): Image {
        return {
            url: `file://${this.assetPathResolver.getExtensionAssetPath("ApplicationSearch", "linux-generic-app-icon.png")}`,
        };
    }
}
