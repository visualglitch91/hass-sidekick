import { HassEntity } from "home-assistant-js-websocket";
import { createSidekickBase } from "./base";
import { sleep } from "./internalUtils";
import axios from "axios";

export function createUtils(base: ReturnType<typeof createSidekickBase>) {
  const sync_states = (entityAId: string, entityBId: string) => {
    let locked = false;

    const onStateChange = ({ next }: { next: HassEntity }) => {
      const stateA = base.state(entityAId);
      const stateB = base.state(entityBId);

      if (!locked && stateA !== stateB) {
        locked = true;

        const entityIds = [entityAId, entityBId];

        if (next.state === "on") {
          base.turn_on(entityIds);
        } else {
          base.turn_off(entityIds);
        }

        setTimeout(() => {
          locked = false;
        }, 900);
      }
    };

    base.track.state(entityAId, onStateChange);
    base.track.state(entityBId, onStateChange);
  };

  return {
    utils: {
      sleep,
      sync_states,
      get: axios.get.bind(axios),
      put: axios.put.bind(axios),
      post: axios.post.bind(axios),
      request: axios.request.bind(axios),
    },
  };
}
