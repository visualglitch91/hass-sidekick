import { MqttClient } from "mqtt";
import { Device, handleAutoDiscovery } from "./utils";

export interface SensorConfig<T extends string|number> {
  mqttClient: MqttClient;
  namespace: string;
  get_value: () => T | Promise<T>;
  interval?: number;
  device_class?: string;
  unit_of_measurement?: string;
  state_class?: string;
  device?: Device;
  unique_id: string;
  name: string;
}

export function createSensor<T extends string|number>({
  mqttClient,
  namespace,
  unique_id,
  name,
  get_value,
  unit_of_measurement,
  device_class,
  state_class,
  device = undefined,
  interval = 5000,
}:SensorConfig<T>) {
  const state_topic = `${namespace}/sensor/${unique_id}/state`;

  let currentValue: T | null = null;

  const publishState = async () => {
    if (currentValue !== null) {
      mqttClient.publish(
        state_topic,
        String(currentValue),
        { retain: true },
        (err) => {
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
      console.error("Failed to get sensor value:", err);
    }
  }, interval);

  (async () => {
    try {
      currentValue = await get_value();
      await publishState();
    } catch (err) {
      console.error("Failed to initialize sensor value:", err);
    }
  })();

  handleAutoDiscovery({
    mqttClient,
    namespace,
    domain: "sensor",
    config: {
      name,
      unique_id,
      state_topic,
      unit_of_measurement,
      device_class,
      state_class,
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
