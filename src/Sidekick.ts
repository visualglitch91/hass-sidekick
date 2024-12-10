import {
  subscribeEntities,
  Connection,
  HassEntities,
  callService,
  HassEntity,
  createLongLivedTokenAuth,
  createConnection,
} from "home-assistant-js-websocket";
import { cloneDeep, get, set } from "lodash";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { filter, map, Observable, Subject } from "rxjs";
import axios, { AxiosInstance } from "axios";
import express, { Express, Request } from "express";
import { CronJob } from "cron";
import PQueue from "p-queue";
import fs from "fs";
import path from "path";
import * as utils from "./utils";

const wnd = globalThis;

if (!wnd.WebSocket) {
  wnd.WebSocket = require("ws");
}

const { includesEntityId, isReturnStable, sleep } = utils;

const queue = new PQueue({
  concurrency: 1,
  interval: 50,
});

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

export default class Sidekick {
  private _haRunning = false;
  private _app: string;
  private _host: string;
  private _token: string;
  private _connection: Connection | null = null;
  private _api: AxiosInstance;
  private _server: Express;
  private _entities: HassEntities = {};
  private _managedEntityIds: string[] = [];

  private _events$ = new Subject<{
    event_type: string;
    data: any;
  }>();

  private _updates$ = new Subject<{
    prev: HassEntities;
    next: HassEntities;
  }>();

  constructor({
    app,
    host,
    token,
    serverPort,
    modulesDir,
    onReady,
  }: {
    app: string;
    host: string;
    token: string;
    serverPort: number;
    modulesDir: string;
    onReady?: () => void;
  }) {
    this._app = app;
    this._host = host;
    this._token = token;

    this._server = express();
    this._server.use(cors());
    this._server.use(express.json());

    this._api = axios.create({
      baseURL: `${host}/api`,
      headers: { Authorization: `Bearer ${token}` },
    });

    this._server.get("/", (_, res) => {
      if (this._haRunning) {
        res.json({ message: "Sidekick is running" });
      } else {
        res.status(403).json({ message: "Sidekick is not running" });
      }
    });

    this._server.listen(serverPort, "0.0.0.0", async () => {
      await this._connect();

      await sleep(100);

      getModules(modulesDir).forEach((modulePath) => {
        import(modulePath).then((module) =>
          module.default({ sidekick: this, axios, utils })
        );
      });

      console.log("Sidekick is running at port", serverPort);

      onReady?.();
    });

    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      // @ts-ignore
      .filter((prop) => typeof this[prop] === "function")
      .forEach((method) => {
        // @ts-ignore
        this[method] = this[method].bind(this);
      });
  }

  getConnection() {
    if (!this._connection) {
      throw new Error("Connection not established");
    }

    return this._connection;
  }

  private async _connect() {
    if (this._connection) {
      throw new Error("Connection already established");
    }

    const waitForHomeAssistant = async () => {
      while (!this._haRunning) {
        try {
          console.log("Checking if Home Assistant is running...");

          const { state } = await this._api
            .get("config", { timeout: 2000 })
            .then((res) => res.data);

          if (state === "RUNNING") {
            this._haRunning = true;
            break;
          }
        } catch (err) {}

        await sleep(1000);
      }
    };

    await waitForHomeAssistant();

    const auth = createLongLivedTokenAuth(this._host, this._token);

    this._connection = await createConnection({ auth });

    this._connection.addEventListener("disconnected", () => {
      this._haRunning = false;
      console.log("Disconnected");
      this.getConnection().suspendReconnectUntil(waitForHomeAssistant());
    });

    this._connection.subscribeEvents((event: any) => {
      this._events$.next(event);
    });

    (() => {
      let prev: HassEntities = {};

      subscribeEntities(this.getConnection(), (entities) => {
        this._updates$.next({ prev, next: entities });
        prev = cloneDeep(entities);
      });

      this._updates$.subscribe(({ next }) => {
        this._entities = next;
      });
    })();

    // Wait for entities to be loaded the first time
    await sleep(500);
  }

  stateChange$(entityId: string) {
    return this._updates$.pipe(
      map(({ prev, next }) => ({
        prev: prev[entityId],
        next: next[entityId],
      })),
      filter(({ prev, next }) => Boolean(prev && next)),
      filter(({ prev, next }) => prev.state !== next.state)
    );
  }

  attributeChange$(entityId: string, attribute: string) {
    return this._updates$.pipe(
      map(({ prev, next }) => ({
        prev: prev[entityId],
        next: next[entityId],
      })),
      filter(({ prev, next }) => Boolean(prev && next)),
      filter(
        ({ prev, next }) =>
          get(prev.attributes, attribute) !== get(next.attributes, attribute)
      )
    );
  }

  getEntities() {
    return this._entities;
  }

  event(eventType: string, data: any) {
    return this._api.post(`events/${eventType}`, {
      json: data,
    });
  }

  setEntityState(entityId: string, state: any) {
    if (!this._haRunning) {
      return Promise.resolve();
    }

    return this._api
      .post(`states/${entityId}`, {
        ...this._entities[entityId],
        state,
      })
      .then(() => {});
  }

  setEntityAttribute(entityId: string, attribute: string, value: any) {
    if (!this._haRunning) {
      return Promise.resolve();
    }

    const clone = cloneDeep(this._entities[entityId]);
    set(clone.attributes, attribute, value);
    return this._api.post(`states/${entityId}`, clone).then(() => {});
  }

  service(domainAndService: string, data: any) {
    const domain = domainAndService.split(".")[0];
    const service = domainAndService.split(".")[1];
    return callService(this.getConnection(), domain, service, data).then(
      () => {},
      (err) => console.error(`Error calling service ${domainAndService}:`, err)
    );
  }

  private async _getUniqueId(entityId: string) {
    const registry = (await this.getConnection().sendMessagePromise({
      type: "config/entity_registry/list",
    })) as any[];

    return registry.find((it) => it.entity_id === entityId)?.unique_id;
  }

  private _createHelper({
    type: domain,
    entityId,
    friendlyName,
    extra,
  }: {
    type: "input_boolean" | "input_button" | "input_select";
    entityId: string;
    friendlyName: string;
    extra?: any;
  }) {
    if (!entityId.startsWith(this._app)) {
      throw new Error(
        `Entities created by Sidekick must start with "${this._app}"`
      );
    }

    const fullEntityId = `${domain}.${entityId}`;

    const promise = (async () => {
      if (this._managedEntityIds.includes(fullEntityId)) {
        throw new Error(`Entity id "${fullEntityId}" is already in use`);
      }

      if (!this._entities[fullEntityId]) {
        let temporaryEntityId = `sidekick_temp_${uuidv4()
          .replace(/-/g, "")
          .substring(0, 10)}`;

        await queue.add(() =>
          this.getConnection().sendMessagePromise({
            ...extra,
            type: `${domain}/create`,
            name: temporaryEntityId,
          })
        );

        await queue.add(() =>
          this.getConnection().sendMessagePromise({
            type: "config/entity_registry/update",
            entity_id: `${domain}.${temporaryEntityId}`,
            new_entity_id: fullEntityId,
          })
        );
      }

      const uniqueId = await this._getUniqueId(fullEntityId);

      if (!uniqueId) {
        throw new Error(`Entity ${fullEntityId} not found in registry`);
      }

      await queue.add(() =>
        this.getConnection().sendMessagePromise({
          ...extra,
          type: `${domain}/update`,
          [`${domain}_id`]: uniqueId,
          name: friendlyName,
        })
      );

      return {
        entityId: fullEntityId,
        uniqueId,
        friendlyName,
      };
    })();

    return { entityId: fullEntityId, promise };
  }

  createInputButton$(
    config: Omit<Parameters<Sidekick["_createHelper"]>[0], "type">
  ) {
    const { entityId } = this._createHelper({
      ...config,
      type: "input_button",
    });

    return this._events$.pipe(
      filter(
        (event) =>
          event.event_type === "call_service" &&
          event.data.domain === "input_button" &&
          event.data.service === "press" &&
          includesEntityId(entityId, event.data.service_data.entity_id)
      )
    );
  }

  createInputBoolean$(
    config: Omit<Parameters<Sidekick["_createHelper"]>[0], "type">
  ) {
    const { entityId } = this._createHelper({
      ...config,
      type: "input_boolean",
    });

    return this._events$.pipe(
      filter(
        (event) =>
          event.event_type === "call_service" &&
          event.data.domain === "input_boolean" &&
          ["turn_on", "turn_off", "toggle"].includes(event.data.service) &&
          includesEntityId(entityId, event.data.service_data.entity_id)
      ),
      map((event) => {
        const isOn = this._entities[entityId].state === "on";

        if (event.data.service === "turn_on" && isOn) {
          return null;
        }

        if (event.data.service === "turn_off" && !isOn) {
          return null;
        }

        return !isOn;
      }),
      filter((it) => it !== null)
    );
  }

  createInputSelect$({
    options,
    ...config
  }: Omit<Parameters<Sidekick["_createHelper"]>[0], "type"> & {
    options: string[];
  }) {
    const { entityId } = this._createHelper({
      ...config,
      type: "input_select",
      extra: { options },
    });

    return this.stateChange$(entityId).pipe(map(({ next }) => next.state));
  }

  createWebhook<
    T extends { Querystring?: Record<string, any>; Body?: Record<string, any> }
  >(
    path: string,
    method: "get" | "post",
    callback: (
      req: Request<{}, {}, T["Body"], T["Querystring"]>,
      res: Express.Response
    ) => void | Promise<any>
  ) {
    return this._server[method](`/webhook/${path}`, (req, res) => {
      const result = callback(req, res);

      if (typeof result === "undefined") {
        return;
      }

      result.then(
        (data) => res.send(typeof data === "undefined" ? { ok: true } : data),
        (err) => res.status(500).send({ error: err.message })
      );
    });
  }

  cron$(cronTime: string) {
    return new Observable((sub) => {
      new CronJob(cronTime, () => sub.next(), null, true);
    });
  }

  press(entityId: string | string[]) {
    const { inputButton, button } = new Array<string>().concat(entityId).reduce(
      (acc, id) => {
        if (id.startsWith("input_button.")) {
          acc.inputButton.push(id);
        } else if (id.startsWith("button.")) {
          acc.button.push(id);
        }

        return acc;
      },
      {
        inputButton: new Array<string>(),
        button: new Array<string>(),
      }
    );

    return Promise.all([
      this.service("input_button.press", { entity_id: inputButton }),
      this.service("button.press", { entity_id: button }),
    ]).then(() => {});
  }

  turnOn(entityId: string | string[]) {
    return this.service("homeassistant.turn_on", {
      entity_id: new Array<string>().concat(entityId),
    });
  }

  turnOff(entityId: string | string[]) {
    return this.service("homeassistant.turn_off", {
      entity_id: new Array<string>().concat(entityId),
    });
  }

  state(entityId: string) {
    return this._entities[entityId]?.state;
  }

  attribute(entityId: string, attribute: string) {
    return get(this._entities[entityId]?.attributes, attribute);
  }

  isState(entityId: string, state: string) {
    return this.state(entityId) === state;
  }

  isAttribute(entityId: string, attribute: string, value: any) {
    return this.attribute(entityId, attribute) === value;
  }

  started$() {
    return this._events$.pipe(
      filter((event) => event.event_type === "homeassistant_started")
    );
  }

  syncStates(entityAId: string, entityBId: string) {
    let locked = false;

    const onStateChange = ({ next }: { next: HassEntity }) => {
      if (locked) {
        return;
      }

      if (this.state(entityAId) !== this.state(entityBId)) {
        locked = true;

        this[next.state === "on" ? "turnOn" : "turnOff"]([
          entityAId,
          entityBId,
        ]);

        setTimeout(() => {
          locked = false;
        }, 500);
      }
    };

    this.stateChange$(entityAId).subscribe(onStateChange);
    this.stateChange$(entityBId).subscribe(onStateChange);
  }

  isStateStable(entityId: string, state: string, time: number) {
    return isReturnStable(() => this.state(entityId) === state, time);
  }

  getEvents$() {
    return this._events$;
  }
}
