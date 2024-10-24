import { KyInstance } from "ky";
import Sidekick from "./Sidekick";
import * as utils from "./utils";

export default function createModule(
  callback: (params: {
    sidekick: Sidekick;
    ky: KyInstance;
    utils: typeof utils;
  }) => void
) {
  return callback;
}
