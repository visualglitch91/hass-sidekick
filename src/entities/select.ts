import { MqttClient } from "mqtt";

export interface SelectConfig {
  mqttClient: MqttClient;
  namespace: string;
  options: string[];
  set_option: (option: string) => void | Promise<void>;
  get_current_option?: () => string | Promise<string>;
  interval?: number;
  unique_id: string;
  name: string;
}

export function createSelect({
  mqttClient,
  namespace,
  options,
  set_option,
  get_current_option,
  interval = 5000,
  unique_id,
  name,
}: SelectConfig) {
  const state_topic = `${namespace}/select/${unique_id}/state`;
  const command_topic = `${namespace}/select/${unique_id}/set`;

  let currentState: string = options[0]; // Default to the first option

  // Publish the current state
  const publishState = async () => {
    mqttClient.publish(state_topic, currentState, { retain: true }, (err) => {
      if (err) {
        console.error(`Failed to publish state to ${state_topic}:`, err);
      }
    });
  };

  // Handle incoming commands
  mqttClient.subscribe(command_topic, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${command_topic}:`, err);
    }
  });

  mqttClient.on("message", async (topic, message) => {
    if (topic === command_topic) {
      const command = message.toString();
      if (options.includes(command)) {
        await set_option(command);
        currentState = command;
        await publishState();
      } else {
        console.warn(`Received invalid command: ${command}`);
      }
    }
  });

  // Periodically check the current state and publish updates
  setInterval(async () => {
    if (get_current_option) {
      const newState = await get_current_option();

      if (newState !== currentState) {
        currentState = newState;
        await publishState();
      }
    }
  }, interval);

  // Initial state publish
  (async () => {
    if (get_current_option) {
      currentState = await get_current_option();
    }
    await publishState();
  })();

  // Publish auto-discovery information
  const publishAutoDiscovery = () => {
    const discoveryPayload = {
      name,
      command_topic,
      state_topic,
      options,
      unique_id,
      platform: "select",
    };

    const discoveryTopic = `homeassistant/select/${namespace}/${unique_id}/config`;

    mqttClient.publish(
      discoveryTopic,
      JSON.stringify(discoveryPayload),
      { retain: true },
      (err) => {
        if (err) {
          console.error(
            `Failed to publish auto-discovery payload to ${discoveryTopic}:`,
            err
          );
        }
      }
    );
  };

  // Call the auto-discovery function
  publishAutoDiscovery();

  return {
    setOption: async (option: string) => {
      if (!options.includes(option)) {
        throw new Error(`Invalid option: ${option}`);
      }
      await set_option(option);
      currentState = option;
      await publishState();
    },
    getCurrentState: () => currentState,
  };
}
