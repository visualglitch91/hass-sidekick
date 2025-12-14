import { MqttClient } from "mqtt";
import { Device, handleAutoDiscovery } from "./utils";

export interface BinarySensorConfig {
  mqttClient: MqttClient;
  namespace: string;
  get_value: () => boolean | Promise<boolean>;
  interval?: number;
  device_class?: string;
  device?: Device;
  unique_id: string;
  name: string;
}

export function createBinarySensor({
  mqttClient,
  namespace,
  unique_id,
  name,
  get_value,
  device_class,
  device = undefined,
  interval = 5000,
}: BinarySensorConfig) {
  const state_topic = `${namespace}/binary_sensor/${unique_id}/state`;

  let currentValue: boolean | null = null;

  const publishState = async () => {
    if (currentValue !== null) {
      mqttClient.publish(
        state_topic,
        currentValue ? "ON" : "OFF",
        { retain: true },
        (err: any) => {
          if (err) {
            console.error(`Failed to publish state to ${state_topic}:`, err);
          }
        }
      );
    }
  };

  setInterval(async () => {
    try {
      const newValue = await get_value();
      if (newValue !== currentValue) {
        currentValue = newValue;
        await publishState();
      }
    } catch (err) {
      console.error("Failed to get value:", err);
    }
  }, interval);

  (async () => {
    try {
      currentValue = await get_value();
      await publishState();
    } catch (err) {
      console.error("Failed to initialize value:", err);
    }
  })();

  handleAutoDiscovery({
    mqttClient,
    namespace,
    domain: "binary_sensor",
    config: {
      name,
      unique_id,
      state_topic,
      payload_on: "ON",
      payload_off: "OFF",
      device_class: device_class ?? null,
      device: device
        ? { name: device.name, identifiers: [device.id] }
        : undefined,
    },
  });

  return {
    get: async () => {
      const val = await get_value();
      currentValue = val;
      return val;
    },
  };
}
