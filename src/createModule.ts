import { AxiosInstance } from "axios";
import Sidekick from "./Sidekick";
import * as utils from "./utils";

export default function createModule(
  callback: (params: {
    sidekick: Sidekick;
    axios: AxiosInstance;
    utils: typeof utils;
  }) => void
) {
  return callback;
}
