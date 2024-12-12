import {
  Connection,
  createLongLivedTokenAuth,
  createConnection as _createConnection,
} from "home-assistant-js-websocket";
import { sleep } from "./internalUtils";
import { createAPI } from "./api";

const wnd = globalThis;

if (!wnd.WebSocket) {
  wnd.WebSocket = require("ws");
}

export async function createConnection({
  host,
  token,
}: {
  host: string;
  token: string;
}) {
  let haRunning = false;
  let connection: Connection | null = null;
  const api = createAPI({ host, token });

  const waitForHomeAssistant = async () => {
    while (!haRunning) {
      try {
        console.log("Checking if Home Assistant is running...");

        const { state } = await api
          .get("config", { timeout: 2000 })
          .then((res) => res.data);

        if (state === "RUNNING") {
          haRunning = true;
          break;
        }
      } catch (err) {}

      await sleep(1000);
    }
  };

  await waitForHomeAssistant();

  const auth = createLongLivedTokenAuth(host, token);

  connection = await _createConnection({ auth });

  connection.addEventListener("disconnected", () => {
    haRunning = false;
    console.log("Disconnected");
    connection.suspendReconnectUntil(waitForHomeAssistant());
  });

  return connection;
}
