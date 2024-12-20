import { MqttClient } from "mqtt";
import { handleAutoDiscovery } from "./utils";

export interface ButtonConfig {
  mqttClient: MqttClient;
  namespace: string;
  press: () => Promise<void> | void;
  unique_id: string;
  name: string;
}

export function createButton({
  mqttClient,
  press,
  unique_id,
  namespace,
  name,
}: ButtonConfig) {
  const commandTopic = `${namespace}/button/${unique_id}/trigger`;

  mqttClient.subscribe(commandTopic, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${commandTopic}:`, err);
    }
  });

  mqttClient.on("message", async (topic, message) => {
    if (topic === commandTopic) {
      const command = message.toString();

      if (command === "PRESS") {
        press();
      } else {
        console.warn(`Received invalid command: ${command}`);
      }
    }
  });

  const handlePress = async () => {
    mqttClient.publish(commandTopic, "PRESS", { retain: false }, (err) => {
      if (err) {
        console.error(`Failed to publish trigger to ${commandTopic}:`, err);
      } else {
        console.log(`Published trigger to ${commandTopic}`);
      }
    });
  };

  handleAutoDiscovery({
    mqttClient,
    namespace,
    domain: "button",
    config: {
      name,
      unique_id: unique_id,
      platform: "button",
      command_topic: commandTopic,
    },
  });

  return {
    press: handlePress,
  };
}
