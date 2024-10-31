import { AssetPathResolver } from "@Core/AssetPathResolver";
import type { EnvironmentVariableProvider } from "@Core/EnvironmentVariableProvider";
import type { FileSystemUtility } from "@Core/FileSystemUtility";
import type { FileImageGenerator } from "@Core/ImageGenerator";
import type { IniFileParser } from "@Core/IniFileParser";
import type { Image } from "@common/Core/Image";
import { describe, vi } from "vitest";
import type { Settings } from "../Settings";
import { LinuxApplicationRepository } from "./LinuxApplicationRepository";

describe(LinuxApplicationRepository, () => {
    describe(LinuxApplicationRepository.prototype.getApplications, () => {
        const mockFilepaths: Record<string, string[]> = {
            "/usr/share/applications": ["org.app1.desktop", "app2.desktop", "app3.desktop", "app4.desktop"],
            "/home/user/my/folder/applications": ["app5.desktop"],
        };

        const mockDesktopFiles: Record<string, Record<string, Record<string, string>>> = {
            // Standard apps, show on all desktops
            "/usr/share/applications/org.app1.desktop": {
                "Desktop Entry": {
                    Name: "App1",
                    Exec: "/path/to/app1",
                    Icon: "app1",
                },
            },
            "/home/user/my/folder/applications/app5.desktop": {
                "Desktop Entry": {
                    Name: "App5",
                    Exec: "/path/to/app5",
                    Icon: "doesntExist",
                },
            },
            // NoDisplay, shouldn't show for any desktop
            "/usr/share/applications/app2.desktop": {
                "Desktop Entry": {
                    Name: "App2",
                    Exec: "/path/to/app2",
                    Icon: "app2",
                    NoDisplay: "true",
                },
            },
            // OnlyShowIn Desktop1
            "/usr/share/applications/app3.desktop": {
                "Desktop Entry": {
                    Name: "App3",
                    Exec: "/path/to/app3",
                    Icon: "app3",
                    OnlyShowIn: "Desktop1;",
                },
            },
            // NotShowIn Desktop1
            "/usr/share/applications/app4.desktop": {
                "Desktop Entry": {
                    Name: "App4",
                    Exec: "/path/to/app4",
                    Icon: "app4",
                    NotShowIn: "Desktop1;",
                },
            },
        };

        const getSettingsMock = vi.fn().mockImplementation((v) => {
            if (v === "linuxFolders") {
                return ["/usr/share", "/usr/local/share", "/home/user/my/applications/folder"];
            }
            return undefined;
        });
        const mockSettings = <Settings>{
            getValue: (v) => getSettingsMock(v),
            getDefaultValue: (v) => getSettingsMock(v),
        };

        const isDirectoryMock = vi.fn().mockImplementation((path) => Object.keys(mockFilepaths).includes(path));
        const readDirectoryMock = vi.fn().mockImplementation((path) => {
            const files = mockFilepaths[path];
            if (files) {
                return files;
            }
            throw new Error(`Directory ${path} does not exist.`);
        });
        const readFileMock = vi.fn().mockImplementation((path) => {
            if (Object.keys(mockDesktopFiles).includes(path)) {
                return path;
            }
            throw new Error(`File ${path} does not exist`);
        });

        const mockFileSystemUtility = <FileSystemUtility>{
            isDirectory: (path) => isDirectoryMock(path),
            readDirectory: (path) => readDirectoryMock(path),
            readFile: (path) => readFileMock(path),
        };

        const getImageMock = vi.fn().mockImplementation((file) => {
            if (file === "doesntExist") {
                throw new Error(`Icon ${file} doesn't exist.`);
            }

            return <Image>{
                url: "/url/to/icon/image",
            };
        });
        const getImagesMock = vi.fn().mockImplementation((filePaths) => {
            const images: Record<string, Image> = {};
            for (const file of filePaths) {
                images[file] = <Image>{
                    url: "/url/to/icon/image",
                };
            }
            return images;
        });
        const mockFileImageGenerator = <FileImageGenerator>{
            getImage: (filePath) => getImageMock(filePath),
            getImages: (filePaths) => getImagesMock(filePaths),
        };

        const parseIniMock = vi.fn().mockImplementation((fileString) => mockDesktopFiles[fileString]);
        const mockIniParser = <IniFileParser>{
            parseIniFileContent: (fileString) => parseIniMock(fileString),
        };

        const getEnvironmentVariableMock = vi.fn().mockImplementation((env) => {
            if (env === "ORIGINAL_XDG_CURRENT_DESKTOP") {
                return "Desktop1";
            }
            return undefined;
        });
        const getAllEnvironmentVariableMock = vi.fn().mockReturnValue({
            ORIGINAL_XDG_CURRENT_DESKTOP: "Desktop1",
        });
        const mockEnvironmentVariableProvider = <EnvironmentVariableProvider>{
            get: (env) => getEnvironmentVariableMock(env),
            getAll: () => getAllEnvironmentVariableMock(),
        };

        const getExtensionAssetPathMock = vi.fn().mockReturnValue("genericIcon.png");
        const mockAssetPathResolver = <AssetPathResolver>{
            getExtensionAssetPath: (e, a) => getExtensionAssetPathMock(e, a),
        };

        // return a list of all applications given in list
    });
});
