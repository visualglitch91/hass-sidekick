import {
  subscribeEntities,
  Connection,
  HassEntities,
  callService,
  HassEntity,
} from "home-assistant-js-websocket";
import { cloneDeep, get, set } from "lodash";
import { v4 as uuidv4 } from "uuid";
import { filter, map, Observable } from "rxjs";
import { KyInstance } from "ky";
import { Express, Request } from "express";
import { CronJob } from "cron";
import { includesEntityId, isReturnStable } from "./utils";

export default class Sidekick {
  private _app: string;
  private _connection: Connection;
  private _api: KyInstance;
  private _server: Express;
  private _entities: HassEntities = {};
  private _managedEntityIds: string[] = [];
  private _events$: Observable<{ event_type: string; data: any }>;
  private _updates$: Observable<{ prev: HassEntities; next: HassEntities }>;

  constructor({
    app,
    api,
    server,
    connection,
  }: {
    app: string;
    api: KyInstance;
    server: Express;
    connection: Connection;
  }) {
    this._app = app;
    this._api = api;
    this._server = server;
    this._connection = connection;

    this._events$ = new Observable((sub) => {
      connection.subscribeEvents((event) => sub.next(event as any));
    });

    this._updates$ = new Observable((sub) => {
      let prev: HassEntities = {};

      subscribeEntities(connection, (entities) => {
        sub.next({ prev, next: entities });
        prev = cloneDeep(entities);
      });
    });

    this._updates$.subscribe(({ next }) => {
      this._entities = next;
    });

    server.get("/", (_, res) => {
      res.json({ message: "Sidekick is running!" });
    });
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

  setEntityState(entityId: string, state: boolean) {
    return this._api.post(`states/${entityId}`, {
      json: { ...this._entities[entityId], state: state ? "on" : "off" },
    });
  }

  setEntityAttribute(entityId: string, attribute: string, value: any) {
    const clone = cloneDeep(this._entities[entityId]);
    set(clone.attributes, attribute, value);
    return this._api.post(`states/${entityId}`, { json: clone });
  }

  service(domainAndService: string, data: any) {
    const domain = domainAndService.split(".")[0];
    const service = domainAndService.split(".")[1];
    return callService(this._connection, domain, service, data);
  }

  private _createHelper({
    type: domain,
    entityId,
    friendlyName,
  }: {
    type: "input_boolean" | "input_button";
    entityId: string;
    friendlyName: string;
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
        let temporaryEntityId = uuidv4().replace(/-/g, "").substring(0, 10);

        await this._connection.sendMessagePromise({
          type: `${domain}/create`,
          name: temporaryEntityId,
        });

        await this._connection.sendMessagePromise({
          type: "config/entity_registry/update",
          entity_id: `${domain}.${temporaryEntityId}`,
          new_entity_id: fullEntityId,
        });
      }

      const res = (await this._connection.sendMessagePromise({
        type: "config/entity_registry/list",
      })) as any[];

      const registry = res.find((it) => it.entity_id === fullEntityId);

      if (!registry) {
        throw new Error(`Entity ${fullEntityId} not found in registry`);
      }

      await this._connection.sendMessagePromise({
        type: `${domain}/update`,
        [`${domain}_id`]: registry.unique_id,
        name: friendlyName,
      });
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
    return this.service("homeassistant.turn_on", {
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
    const onStateChange = ({ next }: { next: HassEntity }) => {
      if (this.state(entityAId) !== this.state(entityBId)) {
        this[next.state === "on" ? "turnOn" : "turnOff"]([
          entityAId,
          entityBId,
        ]);
      }
    };

    this.stateChange$(entityAId).subscribe(onStateChange);
    this.stateChange$(entityBId).subscribe(onStateChange);
  }

  isStateStable(entityId: string, state: string, time: number) {
    return isReturnStable(() => this.state(entityId) === state, time);
  }
}
