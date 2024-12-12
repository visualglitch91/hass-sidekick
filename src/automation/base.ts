import { CronJob } from "cron";
import { Express, Request } from "express";
import { curry, get, memoize } from "lodash";
import { filter, map, Subject } from "rxjs";
import { HassEntities, HassEntity } from "home-assistant-js-websocket";

export interface AutomationHelpersParams {
  express: Express;
  allEvents$: Subject<{ event_type: string; data: any }>;
  updates$: Subject<{
    prev: HassEntities;
    next: HassEntities;
  }>;
}

export function createBaseAutomationHelpers({
  express,
  allEvents$,
  updates$,
}: AutomationHelpersParams) {
  const event$ = memoize((eventType: string) => {
    return allEvents$.pipe(filter((event) => event.event_type === eventType));
  });

  const entityChange$ = memoize((entityId: string) => {
    return updates$.pipe(
      map(({ prev, next }) => ({
        prev: prev[entityId],
        next: next[entityId],
      })),
      filter(({ prev, next }) => Boolean(prev && next))
    );
  });

  const stateChange$ = memoize((entityId: string) => {
    return entityChange$(entityId).pipe(
      filter(({ prev, next }) => prev.state !== next.state)
    );
  });

  const attrChange$ = memoize(
    (entityId: string, attribute: string) => {
      return entityChange$(entityId).pipe(
        filter(
          ({ prev, next }) =>
            get(prev.attributes, attribute) !== get(next.attributes, attribute)
        )
      );
    },
    (entityId, attribute) => `${entityId}.${attribute}`
  );

  const multiple = (...triggers: ((handler: () => void) => void)[]) => {
    return (handler: () => void) => {
      triggers.forEach((trigger) => trigger(handler));
    };
  };

  const cron = curry((cronString: string, handler: () => void) => {
    new CronJob(cronString, () => handler(), null, true);
  });

  const event = curry(
    (eventType: string, handler: (eventData: any) => void) => {
      event$(eventType).subscribe(({ data }) => handler(data));
    }
  );

  const state = curry(
    (
      entityId: string,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      stateChange$(entityId).subscribe(handler);
    }
  );

  const state_to = curry(
    (
      entityId: string,
      value: string,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      stateChange$(entityId)
        .pipe(filter(({ next }) => next.state === value))
        .subscribe(handler);
    }
  );

  const state_from = curry(
    (
      entityId: string,
      value: string,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      stateChange$(entityId)
        .pipe(filter(({ prev }) => prev.state === value))
        .subscribe(handler);
    }
  );

  const attr = curry(
    (
      entityId: string,
      attribute: string,
      handler: (data: { prev: any; next: any }) => void
    ) => {
      attrChange$(entityId, attribute).subscribe(handler);
    }
  );

  const attr_to = curry(
    (
      entityId: string,
      attribute: string,
      value: string | number | boolean,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      attrChange$(entityId, attribute)
        .pipe(filter(({ next }) => get(next.attributes, attribute) === value))
        .subscribe(handler);
    }
  );

  const attr_from = curry(
    (
      entityId: string,
      attribute: string,
      value: string | number | boolean,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      attrChange$(entityId, attribute)
        .pipe(filter(({ prev }) => get(prev.attributes, attribute) === value))
        .subscribe(handler);
    }
  );

  const webhook = <
    T extends {
      Querystring?: Record<string, any>;
      Body?: Record<string, any>;
    }
  >(
    webhookId: string,
    handler: (
      req: Request<{}, {}, T["Body"], T["Querystring"]>,
      res: Express.Response
    ) => void | Promise<any>
  ) => {
    express.post(`/webhook/${webhookId}`, async (req, res) => {
      try {
        const result = await handler(req, res);
        res.send(typeof result === "undefined" ? { ok: true } : result);
      } catch (err: any) {
        res.status(500).send({ error: err?.message || err });
      }
    });
  };

  return {
    webhook,
    track: {
      multiple,
      cron,
      event,
      state,
      state_to,
      state_from,
      attr,
      attr_to,
      attr_from,
    },
  };
}
