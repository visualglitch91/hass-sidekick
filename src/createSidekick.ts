import WebSocket from "ws";
(global as any).WebSocket = WebSocket;

import {
  createConnection,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";
import ky from "ky";
import fs from "fs";
import path from "path";
import express from "express";
import * as utils from "./utils";
import Sidekick from "./Sidekick";

function getModules(dir: string) {
  const getFiles = (dir: string) => {
    return fs
      .readdirSync(dir)
      .reduce<string[]>((serviceFiles, file): string[] => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          return serviceFiles.concat(getFiles(fullPath));
        } else {
          serviceFiles.push(fullPath);
        }

        return serviceFiles;
      }, []);
  };

  return getFiles(dir);
}

export default async function createSidekick({
  app,
  hass: { host, token },
  server: { port: serverPort },
  modulesDir,
}: {
  app: string;
  hass: { host: string; token: string };
  server: { port: number };
  modulesDir: string;
}) {
  const api = ky.create({
    prefixUrl: `${host}/api`,
    headers: { Authorization: `Bearer ${token}` },
  });

  let running = false;

  while (!running) {
    try {
      console.log("Checking if Home Assistant is running...");

      const { state } = await api
        .get("config", { timeout: 2000 })
        .then((res) => res.json<any>());

      if (state === "RUNNING") {
        running = true;
      }
    } catch (err) {
      await utils.sleep(1000);
    }
  }

  const server = express();
  const auth = createLongLivedTokenAuth(host, token);
  const connection = await createConnection({ auth });

  server.use(express.json());

  return new Promise<Sidekick>((resolve) => {
    server.listen(serverPort, "0.0.0.0", async () => {
      const sidekick = new Sidekick({
        app,
        server,
        connection,
        api,
      });

      await utils.sleep(100);

      getModules(modulesDir).forEach((modulePath) => {
        import(modulePath).then((module) =>
          module.default({ sidekick, ky, utils })
        );
      });

      Object.getOwnPropertyNames(Object.getPrototypeOf(sidekick))
        // @ts-ignore
        .filter((prop) => typeof sidekick[prop] === "function")
        .forEach((method) => {
          // @ts-ignore
          sidekick[method] = sidekick[method].bind(sidekick);
        });

      console.log("Sidekick is running at port", serverPort);

      resolve(sidekick);
    });
  });
}
