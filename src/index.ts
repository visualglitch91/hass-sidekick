import { createUtils } from "./utils";
import { createSidekickBase, SidekickConfig } from "./base";
import { getModules } from "./internalUtils";

export function createSidekick(config: SidekickConfig) {
  const base = createSidekickBase(config);

  return {
    ...base,
    ...createUtils(base),
  };
}

export function createSidekickApp({
  modulesDir,
  ...config
}: SidekickConfig & {
  modulesDir: string;
}) {
  global.sk = createSidekick(config);

  getModules(modulesDir).forEach((modulePath) => {
    import(modulePath);
  });
}
