import mqtt from "mqtt";
import { createSwitch, SwitchConfig } from "./switch";
import { createButton, ButtonConfig } from "./button";
import { createSelect, SelectConfig } from "./select";
import { createNumber, NumberConfig } from "./number";
import { createBinarySensor, BinarySensorConfig } from "@visualglitch91/hass-sidekick/src/entities/binarySensor";

export function createEntitiesHelpers({
  mqttUrl,
  namespace,
  authentication,
}: {
  mqttUrl: string;
  namespace: string;
  authentication?: {
    username: string;
    password: string;
  };
}) {
  const mqttClient = mqtt.connect(mqttUrl, authentication);

  return {
    mqtt: mqttClient,
    create: {
      switch: (config: Omit<SwitchConfig, "mqttClient" | "namespace">) => {
        return createSwitch({ ...config, mqttClient, namespace });
      },
      button: (config: Omit<ButtonConfig, "mqttClient" | "namespace">) => {
        return createButton({ ...config, mqttClient, namespace });
      },
      select: (config: Omit<SelectConfig, "mqttClient" | "namespace">) => {
        return createSelect({ ...config, mqttClient, namespace });
      },
      number: (config: Omit<NumberConfig, "mqttClient" | "namespace">) => {
        return createNumber({ ...config, mqttClient, namespace });
      },
      binarySensor: (config: Omit<BinarySensorConfig, "mqttClient" | "namespace">) => {
        return createBinarySensor({ ...config, mqttClient, namespace });
      },
    },
  };
}
