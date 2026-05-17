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

interface RobotConfig {
  name: string;
  escConfigs: Record<string, ESCConfig>;
}

// WebSocket server
const wss = new WebSocketServer({ port: 81 });
console.log("WebSocket server running on ws://localhost:81");
console.log(
  "Press X then a/b/c to send an error message for an ESC, or press W to toggle Weapon RPM between 0%, 50%, and 100%.",
);

const validErrorEscIds = ["a", "b", "c"];
let awaitingErrorEscId = false;
let weaponRpmToggleState = 0;
const weaponRpmToggleValues = [0, 50, 100];

function broadcastMessage(message: string) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendErrorMessage(id: string) {
  const { message, timestamp } = buildError(id);
  broadcastMessage(message);
  console.log("Sent error", message, timestamp);
}

function sendInvalidMessage() {
  broadcastMessage("<asdfghjkl>");
}

function buildWeaponRpmTelemetry(config: RobotConfig, percent: number) {
  const id = "c";
  const type = escIdMap[id];
  const esc = config.escConfigs[type];
  const cfg = esc.measurementConfigs;
  const timestamp = Date.now() - startTime;

  const temp = generateMockValue(cfg.Temp);
  const voltage = generateMockValue(cfg.Voltage) * 100;
  const current = generateMockValue(cfg.Current) * 100;
  const consumption = generateMockValue(cfg.Consumption);
  const rawRpm = Math.round((percent / 100) * cfg.RPM.max);
  cfg.RPM.lastValue = rawRpm;
  const maxRpmMessage = Math.floor((cfg.RPM.max / 100) * 7);
  const rpm = Math.floor((percent / 100) * maxRpmMessage);

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

function sendWeaponRpmToggle(config: RobotConfig) {
  weaponRpmToggleState =
    (weaponRpmToggleState + 1) % weaponRpmToggleValues.length;
  const percent = weaponRpmToggleValues[weaponRpmToggleState];
  const { message, timestamp } = buildWeaponRpmTelemetry(config, percent);
  broadcastMessage(message);
  console.log(`Sent Weapon RPM ${percent}%`, message, timestamp);
}

function handleConsoleKey(key: string) {
  const char = key.toLowerCase();

  if (awaitingErrorEscId) {
    awaitingErrorEscId = false;

    if (validErrorEscIds.includes(char)) {
      sendErrorMessage(char);
    } else {
      console.log(
        "Invalid ESC ID. Press X then a/b/c to send an error message.",
      );
    }

    return;
  }

  if (char === "x") {
    awaitingErrorEscId = true;
    console.log("Select ESC ID: a, b, c");
    return;
  }

  if (char === "w") {
    sendWeaponRpmToggle(config);
    return;
  }

  if (char === "i") {
    sendInvalidMessage();
    return;
  }

  if (char === "\u0003") {
    console.log("Exiting...");
    process.exit();
  }
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.setEncoding("utf8");
process.stdin.resume();
process.stdin.on("data", (chunk: string) => {
  for (const char of chunk) {
    handleConsoleKey(char);
  }
});

const colossalAvianConfig: RobotConfig = {
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

const stackOverflowConfig = {
  name: "Stack Overflow",
  escConfigs: {
    Weapon: {
      measurementConfigs: {
        RPM: { min: 0, max: 18000 },
        Voltage: { min: 0, max: 17.4 },
        Current: { min: 0, max: 80 },
        Consumption: { min: 0, max: 850 },
        Temp: { min: 25, max: 100 },
      },
    },
  },
};

// Map ESC IDs
const escIdMap: Record<string, keyof RobotConfig["escConfigs"]> = {
  a: "DriveLeft",
  b: "DriveRight",
  c: "Weapon",
  w: "DriveLeft",
  x: "DriveRight",
  y: "Weapon",
  z: "Arm",
};

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

function buildTelemetry(config: RobotConfig, id: string) {
  const type = escIdMap[id];
  const esc = colossalAvianConfig.escConfigs[type];
  const cfg = esc.measurementConfigs;
  const timestamp = Date.now() - startTime;

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

function buildError(id: string) {
  const timestamp = Date.now() - startTime;

  return {
    message: `<${id} ! ${timestamp.toString(16).toUpperCase()}>`,
    timestamp,
  };
}

function buildInput(config: RobotConfig, id: string) {
  const type = escIdMap[id];
  const esc = config.escConfigs[type];
  const inputVal = generateMockValue(esc.measurementConfigs.Current);
  const scaledInput = (inputVal + 300) * 5;
  const timestamp = Date.now();

  const components = [
    scaledInput.toString(16).toUpperCase(),
    timestamp.toString(16).toUpperCase(),
  ];

  return { message: `<${id} ${components.join(" ")}>`, timestamp };
}

let config = stackOverflowConfig;
const escs = Object.keys(config.escConfigs);

const sequence = Object.entries(escIdMap)
  .filter(([id, esc]) => escs.includes(esc))
  .map(([id]) => id);
let seqIndex = 0;

// WebSocket connection
wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");
  startTime = Date.now();

  const interval = setInterval(() => {
    const id = sequence[seqIndex];
    seqIndex = (seqIndex + 1) % sequence.length;

    const { message, timestamp } = ["a", "b", "c"].includes(id)
      ? buildTelemetry(config, id)
      : buildInput(config, id);
    ws.send(message);
    console.log("Sent", message, timestamp);
  }, 1);

  ws.on("close", () => {
    clearInterval(interval);
    console.log("Client disconnected");
  });
});
