import fs from "fs";
import path from "path";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getModules(dir: string) {
  const getFiles = (dir: string) => {
    return fs
      .readdirSync(dir)
      .reduce<string[]>((moduleFiles, file): string[] => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          return moduleFiles.concat(getFiles(fullPath));
        } else if (
          fullPath.endsWith(".mod.ts") ||
          fullPath.endsWith(".module.ts")
        ) {
          moduleFiles.push(fullPath);
        }

        return moduleFiles;
      }, []);
  };

  return getFiles(dir);
}
