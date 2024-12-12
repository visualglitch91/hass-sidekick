import { MqttClient } from "mqtt";

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

  // Publish auto-discovery information
  const publishAutoDiscovery = () => {
    const discoveryPayload = {
      name,
      unique_id: unique_id,
      platform: "button",
      command_topic: commandTopic,
    };

    const discoveryTopic = `homeassistant/button/${namespace}/${unique_id}/config`;

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
        } else {
          console.log(`Published auto-discovery payload to ${discoveryTopic}`);
        }
      }
    );
  };

  // Call the auto-discovery function
  publishAutoDiscovery();

  return {
    press: handlePress,
  };
}
