import WebSocket, { WebSocketServer } from "ws";

// Types
interface MeasurementConfig {
  min: number;
  max: number;
  lastValue?: number; // only keep the last value
}

interface ESCConfig {
  measurementConfigs: Record<string, MeasurementConfig>;
}

interface ColossalAvianConfig {
  name: string;
  escConfigs: Record<string, ESCConfig>;
}

// WebSocket server
const wss = new WebSocketServer({ port: 81 });
console.log("WebSocket server running on ws://localhost:81");

const colossalAvianConfig: ColossalAvianConfig = {
  name: "Colossal Avian",
  escConfigs: {
    DriveLeft: {
      measurementConfigs: {
        RPM: { min: 0, max: 20000 },
        Voltage: { min: 16, max: 26 },
        Current: { min: 0, max: 100 },
        Consumption: { min: 0, max: 3000 },
        Temp: { min: 25, max: 100 },
      },
    },
    DriveRight: {
      measurementConfigs: {
        RPM: { min: 0, max: 20000 },
        Voltage: { min: 16, max: 26 },
        Current: { min: 0, max: 100 },
        Consumption: { min: 0, max: 3000 },
        Temp: { min: 25, max: 100 },
      },
    },
    Weapon: {
      measurementConfigs: {
        RPM: { min: 0, max: 35000 },
        Voltage: { min: 16, max: 26 },
        Current: { min: 0, max: 100 },
        Consumption: { min: 0, max: 3000 },
        Temp: { min: 25, max: 100 },
      },
    },
    Arm: {
      measurementConfigs: {
        RPM: { min: 0, max: 20000 },
        Voltage: { min: 16, max: 26 },
        Current: { min: 0, max: 100 },
        Consumption: { min: 0, max: 3000 },
        Temp: { min: 25, max: 100 },
      },
    },
  },
};

// Map ESC IDs
const escTypeMap: Record<string, keyof ColossalAvianConfig["escConfigs"]> = {
  a: "DriveLeft",
  b: "DriveRight",
  c: "Weapon",
  w: "DriveLeft",
  x: "DriveRight",
  y: "Weapon",
  z: "Arm",
};

const sequence = ["a", "b", "c", "w", "x", "y", "z"];
let seqIndex = 0;

let startTime = 0;

// Helper: generate next mock value using only lastValue
function generateMockValue(measurement: MeasurementConfig): number {
  const previousValue =
    measurement.lastValue ??
    Math.round(
      Math.random() * (measurement.max - measurement.min) + measurement.min,
    );
  const sign = Math.random() > 0.5 ? 1 : -1;
  const newValue = Math.min(
    measurement.max,
    Math.max(measurement.min, previousValue + sign),
  );
  measurement.lastValue = newValue;
  return newValue;
}

function generateMockValueTwoByteHex(num: number): string {
  const highByte = ((num & 0xff00) >> 8)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
  const lowByte = (num & 0x00ff).toString(16).toUpperCase().padStart(2, "0");
  return `${highByte} ${lowByte}`;
}

// Build telemetry message
function buildTelemetry(id: string) {
  const type = escTypeMap[id];
  const esc = colossalAvianConfig.escConfigs[type];
  const cfg = esc.measurementConfigs;
  const timestamp = Date.now();

  const temp = generateMockValue(cfg.Temp);
  const voltage = generateMockValue(cfg.Voltage) * 100;
  const current = generateMockValue(cfg.Current) * 100;
  const consumption = generateMockValue(cfg.Consumption);
  let rpm = generateMockValue(cfg.RPM);
  rpm =
    type === "Weapon" || type === "Arm"
      ? Math.floor((rpm / 100) * 7)
      : Math.floor((rpm / 100) * 6);

  const components = [
    temp.toString(16).padStart(2, "0").toUpperCase(),
    generateMockValueTwoByteHex(voltage),
    generateMockValueTwoByteHex(current),
    generateMockValueTwoByteHex(consumption),
    generateMockValueTwoByteHex(rpm),
    "00", // checksum
    timestamp.toString(16).toUpperCase(),
  ];

  return { message: `<${id} ${components.join(" ")}>`, timestamp };
}

// Build input message
function buildInput(id: string) {
  const type = escTypeMap[id];
  const esc = colossalAvianConfig.escConfigs[type];
  const inputVal = generateMockValue(esc.measurementConfigs.Current);
  const scaledInput = (inputVal + 300) * 5;
  const timestamp = Date.now();

  const components = [
    scaledInput.toString(16).toUpperCase(),
    timestamp.toString(16).toUpperCase(),
  ];

  return { message: `<${id} ${components.join(" ")}>`, timestamp };
}

// WebSocket connection
wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");
  startTime = Date.now();

  const interval = setInterval(() => {
    const id = sequence[seqIndex];
    seqIndex = (seqIndex + 1) % sequence.length;

    const { message, timestamp } = ["a", "b", "c", "d"].includes(id)
      ? buildTelemetry(id)
      : buildInput(id);
    ws.send(message);
    console.log("Sent", message, timestamp);
  }, 0.2);

  ws.on("close", () => {
    clearInterval(interval);
    console.log("Client disconnected");
  });
});
