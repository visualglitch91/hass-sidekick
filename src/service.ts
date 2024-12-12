import { Connection, callService } from "home-assistant-js-websocket";

export function createServiceHelpers(getConnection: () => Connection | null) {
  const service = async (
    domainAndService: string,
    payload?: string | string[] | Record<string, any>
  ) => {
    const connection = getConnection();

    if (!connection) {
      return Promise.resolve();
    }

    const [domain, service] = domainAndService.split(".");

    const entityIds =
      typeof payload === "string"
        ? [payload]
        : Array.isArray(payload)
        ? (payload as string[])
        : null;

    if (entityIds?.some((id) => typeof id !== "string")) {
      throw new Error("Invalid entity id");
    }

    const data = entityIds ? { entity_id: entityIds } : (payload as any);

    return callService(connection, domain, service, data).then(
      () => {},
      (err) => console.error(`Error calling service ${domainAndService}:`, err)
    );
  };

  return {
    service,
    press: (entityIds: string | string[]) => {
      return service("button.press", entityIds);
    },
    turn_on: (entityIds: string | string[]) => {
      return service("homeassistant.turn_on", entityIds);
    },
    turn_off: (entityIds: string | string[]) => {
      return service("homeassistant.turn_off", entityIds);
    },
  };
}
