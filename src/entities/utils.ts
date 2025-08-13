import { MqttClient } from "mqtt";

export interface BaseConfig {
  mqttClient: MqttClient;
  namespace: string;
  domain: string;
  config: Record<string, any> & { unique_id: string };
}

export interface Device {
  name: string;
  id: string;
}

export function handleAutoDiscovery({
  mqttClient,
  namespace,
  domain,
  config,
}: BaseConfig) {
  const publish = () => {
    const discoveryTopic = `homeassistant/${domain}/${namespace}/${config.unique_id}/config`;

    mqttClient.publish(
      discoveryTopic,
      JSON.stringify(config),
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

  publish();
  mqttClient.on("connect", publish);
  mqttClient.on("message", async (topic) => {
    if (topic === `homeassistant/started`) {
      publish();
    }
  });
}
