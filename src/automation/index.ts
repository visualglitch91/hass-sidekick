import { curry } from "lodash";
import { HassEntity } from "home-assistant-js-websocket";
import { AutomationHelpersParams, createBaseAutomationHelpers } from "./base";

export function createAutomationHelpers(params: AutomationHelpersParams) {
  const base = createBaseAutomationHelpers(params);

  const _hold = (
    startTrigger: (start: () => void) => void,
    abortTrigger: (abort: () => void) => void,
    holdTime: number,
    handler: (data: { prev: HassEntity; next: HassEntity }) => void
  ) => {
    let timeout = 0;

    const start = () => {
      abort();
      timeout = setTimeout(handler, holdTime);
    };

    const abort = () => {
      clearTimeout(timeout);
    };

    startTrigger(start);
    abortTrigger(abort);
  };

  const state_to_hold = curry(
    (
      entityId: string,
      value: string,
      holdTimeMs: number,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      _hold(
        base.track.state_to(entityId, value),
        base.track.state_from(entityId, value),
        holdTimeMs,
        handler
      );
    }
  );

  const state_from_hold = curry(
    (
      entityId: string,
      value: string,
      holdTimeMs: number,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      _hold(
        base.track.state_from(entityId, value),
        base.track.state_to(entityId, value),
        holdTimeMs,
        handler
      );
    }
  );

  const attr_to_hold = curry(
    (
      entityId: string,
      attribute: string,
      value: string | number | boolean,
      holdTimeMs: number,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      _hold(
        base.track.attr_to(entityId, attribute, value),
        base.track.attr_from(entityId, attribute, value),
        holdTimeMs,
        handler
      );
    }
  );

  const attr_from_hold = curry(
    (
      entityId: string,
      attribute: string,
      value: string | number | boolean,
      holdTimeMs: number,
      handler: (data: { prev: HassEntity; next: HassEntity }) => void
    ) => {
      _hold(
        base.track.attr_from(entityId, attribute, value),
        base.track.attr_to(entityId, attribute, value),
        holdTimeMs,
        handler
      );
    }
  );

  return {
    ...base,
    track: {
      ...base.track,
      state_to_hold,
      state_from_hold,
      attr_to_hold,
      attr_from_hold,
    },
  };
}
