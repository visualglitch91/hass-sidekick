import { get } from "lodash";
import { HassEntities } from "home-assistant-js-websocket";

export function createPropsHelpers(getEntities: () => HassEntities) {
  const entity = (id: string) => {
    return getEntities()[id];
  };

  return {
    entity,
    state: (id: string) => {
      return entity(id)?.state;
    },
    attr: (id: string, attribute: string) => {
      return get(entity(id), `attributes.${attribute}`);
    },
  };
}
