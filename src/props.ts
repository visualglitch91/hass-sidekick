import { get } from "lodash";
import { HassEntities } from "home-assistant-js-websocket";

export function createPropsHelpers(getEntities: () => HassEntities) {
  const entity = (id: string) => {
    return getEntities()[id];
  };

  return {
    entity,
    getEntities,
    state: (id: string) => {
      return entity(id)?.state;
    },
    state_is: (id: string, state: string) => {
      return entity(id)?.state === state;
    },
    state_not: (id: string, state: string) => {
      return entity(id)?.state !== state;
    },
    attr: (id: string, attribute: string) => {
      return get(entity(id), `attributes.${attribute}`);
    },
    attr_is: (id: string, attribute: string, value: any) => {
      return get(entity(id), `attributes.${attribute}`) === value;
    },
    attr_not: (id: string, attribute: string, value: any) => {
      return get(entity(id), `attributes.${attribute}`) !== value;
    },
  };
}
