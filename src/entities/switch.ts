import { MqttClient } from "mqtt";

export interface SwitchConfig {
  mqttClient: MqttClient;
  namespace: string;
  turn_on: () => Promise<void> | void;
  turn_off: () => Promise<void> | void;
  is_on?: () => Promise<boolean> | boolean;
  interval?: number;
  unique_id: string;
  name: string;
}

export function createSwitch({
  mqttClient,
  turn_on,
  turn_off,
  is_on,
  interval = 5000,
  unique_id,
  namespace,
  name,
}: SwitchConfig) {
  const payloadOn = "ON";
  const payloadOff = "OFF";

  const state_topic = `${namespace}/switch/${unique_id}/state`;
  const commandTopic = `${namespace}/switch/${unique_id}/set`;

  let currentState = payloadOff;

  // Publish the current state
  const publishState = async () => {
    mqttClient.publish(state_topic, currentState, { retain: true }, (err) => {
      if (err) {
        console.error(`Failed to publish state to ${state_topic}:`, err);
      }
    });
  };

  // Handle incoming commands
  mqttClient.subscribe(commandTopic, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${commandTopic}:`, err);
    }
  });

  mqttClient.on("message", async (topic, message) => {
    if (topic === commandTopic) {
      const command = message.toString();
      if (command === payloadOn) {
        await turn_on();
        currentState = payloadOn;
        await publishState();
      } else if (command === payloadOff) {
        await turn_off();
        currentState = payloadOff;
        await publishState();
      } else {
        console.warn(`Received invalid command: ${command}`);
      }
    }
  });

  // Periodically check the state and publish updates
  setInterval(async () => {
    if (is_on) {
      const isCurrentlyOn = await is_on();
      const newState = isCurrentlyOn ? payloadOn : payloadOff;
      if (newState !== currentState) {
        currentState = newState;
        await publishState();
      }
    }
  }, interval);

  // Initial state publish
  (async () => {
    if (is_on) {
      currentState = (await is_on()) ? payloadOn : payloadOff;
    }
    await publishState();
  })();

  // Publish auto-discovery information
  const publishAutoDiscovery = () => {
    const discoveryPayload = {
      name,
      command_topic: commandTopic,
      state_topic: state_topic,
      payload_on: payloadOn,
      payload_off: payloadOff,
      unique_id: unique_id,
      device_class: "switch",
    };

    const discoveryTopic = `homeassistant/switch/${namespace}/${unique_id}/config`;

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
    toggle: async () => {
      if (currentState === payloadOn) {
        await turn_off();
        currentState = payloadOff;
      } else {
        await turn_on();
        currentState = payloadOn;
      }
      await publishState();
    },
  };
}
