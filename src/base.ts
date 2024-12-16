import { Subject } from "rxjs";
import {
  subscribeEntities,
  Connection,
  HassEntities,
} from "home-assistant-js-websocket";
import { cloneDeep } from "lodash";
import { createConnection } from "./connection";
import { createPropsHelpers } from "./props";
import { createServiceHelpers } from "./service";
import { createAutomationHelpers } from "./automation";
import { createEntitiesHelpers } from "./entities";
import { createExpressApp } from "./express";

export interface SidekickConfig {
  namespace: string;
  hass: {
    host: string;
    token: string;
  };
  mqtt: {
    url: string;
    authentication?: {
      username: string;
      password: string;
    };
  };
  server: { port: number };
}

export function createSidekickBase({
  namespace,
  hass,
  mqtt,
  server,
}: SidekickConfig) {
  let entities: HassEntities = {};
  let connection: Connection | null = null;

  const allEvents$ = new Subject<{
    event_type: string;
    data: any;
  }>();

  const updates$ = new Subject<{
    prev: HassEntities;
    next: HassEntities;
  }>();

  createConnection(hass).then(
    (conn) => {
      connection = conn;

      let prev: HassEntities = {};

      subscribeEntities(connection, (next) => {
        prev = cloneDeep(entities);
        entities = next;
        updates$.next({ prev, next });
      });

      connection.subscribeEvents((event: any) => {
        allEvents$.next(event);
      });
    },
    (err) => console.error("Failed to connect to Home Assistant:", err)
  );

  const express = createExpressApp({ namespace, port: server.port });

  return {
    express,
    ...createPropsHelpers(() => entities),
    ...createAutomationHelpers({ express, allEvents$, updates$ }),
    ...createServiceHelpers(() => connection),
    ...createEntitiesHelpers({
      namespace,
      mqttUrl: mqtt.url,
      authentication: mqtt.authentication,
    }),
  };
}
