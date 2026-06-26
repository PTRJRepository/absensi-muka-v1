#!/usr/bin/env node
"use strict";

const ZKLib = require("node-zklib");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[name] = true;
    } else {
      args[name] = next;
      i += 1;
    }
  }
  return args;
}

function classifyError(error) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("refused") || message.includes("econnrefused")) return "CONNECTION_REFUSED";
  if (message.includes("udp connect") || message.includes("tcp connect")) return "CONNECTION_REFUSED";
  if (message.includes("timeout") || message.includes("timed out")) return "TIMEOUT";
  if (message.includes("unreachable") || message.includes("ehostunreach") || message.includes("enetunreach")) {
    return "NETWORK_UNREACHABLE";
  }
  if (message.includes("auth") || message.includes("password")) return "AUTH_FAILED";
  if (message.includes("zk") || message.includes("protocol")) return "NOT_ZKTECO_DEVICE";
  return "UNKNOWN_ERROR";
}

function errorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  if (error.error) return errorMessage(error.error);
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function writeResult(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function safeCall(fn) {
  if (typeof fn !== "function") return null;
  try {
    return await fn();
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = String(args.action || "test").toLowerCase();
  const ip = args.ip;
  const port = Number(args.port || 4370);
  const password = String(args.password || "12345");
  const timeoutMs = Number(args.timeout || 30000);
  const inport = Number(args.inport || 4000);
  const maxRecords = Number(args["max-records"] || 0);

  const allowedActions = new Set(["test", "info", "users", "attendance"]);
  if (!allowedActions.has(action)) {
    writeResult({
      success: false,
      action,
      error: { code: "UNSUPPORTED_ACTION", message: `Unsupported read-only action: ${action}` },
    });
    return;
  }

  if (!ip || !Number.isFinite(port)) {
    writeResult({
      success: false,
      action,
      error: { code: "INVALID_ARGUMENT", message: "Both --ip and --port are required." },
    });
    return;
  }

  const hardTimeoutMs = Math.max(timeoutMs * 3, timeoutMs + 5000);
  const hardTimeout = setTimeout(() => {
    writeResult({
      success: false,
      action,
      ip,
      port,
      error: { code: "TIMEOUT", message: `Command exceeded ${hardTimeoutMs}ms.` },
    });
    process.exit(2);
  }, hardTimeoutMs);

  let zk = null;
  let disabled = false;

  try {
    zk = new ZKLib(ip, port, timeoutMs, inport, password);
    await zk.createSocket();

    if (action === "test") {
      let info = null;
      try {
        info = await safeCall(zk.getInfo ? zk.getInfo.bind(zk) : null);
      } catch (_) {
        info = null;
      }
      writeResult({
        success: true,
        action,
        ip,
        port,
        message: `Connected to ${ip}:${port}`,
        data: { info },
      });
      return;
    }

    if (action === "info") {
      const info = await safeCall(zk.getInfo ? zk.getInfo.bind(zk) : null);
      writeResult({
        success: true,
        action,
        ip,
        port,
        message: `Device info fetched from ${ip}:${port}`,
        data: { info: info || {} },
      });
      return;
    }

    if (action === "users") {
      await safeCall(zk.disableDevice ? zk.disableDevice.bind(zk) : null);
      disabled = true;
      const result = await zk.getUsers();
      const users = Array.isArray(result && result.data) ? result.data : (Array.isArray(result) ? result : []);
      const limited = maxRecords > 0 ? users.slice(0, maxRecords) : users;
      writeResult({
        success: true,
        action,
        ip,
        port,
        message: `Fetched ${users.length} users from ${ip}:${port}`,
        data: { count: users.length, returned: limited.length, users: limited },
      });
      return;
    }

    if (action === "attendance") {
      await safeCall(zk.disableDevice ? zk.disableDevice.bind(zk) : null);
      disabled = true;
      const result = await zk.getAttendances();
      const records = Array.isArray(result && result.data) ? result.data : (Array.isArray(result) ? result : []);
      const limited = maxRecords > 0 ? records.slice(-maxRecords) : records;
      writeResult({
        success: true,
        action,
        ip,
        port,
        message: `Fetched ${records.length} attendance records from ${ip}:${port}`,
        data: { count: records.length, returned: limited.length, records: limited },
      });
    }
  } catch (error) {
    writeResult({
      success: false,
      action,
      ip,
      port,
      error: {
        code: classifyError(error),
        message: errorMessage(error),
      },
    });
  } finally {
    clearTimeout(hardTimeout);
    if (zk) {
      if (disabled) {
        try {
          await safeCall(zk.enableDevice ? zk.enableDevice.bind(zk) : null);
        } catch (_) {}
      }
      try {
        await safeCall(zk.disconnect ? zk.disconnect.bind(zk) : null);
      } catch (_) {}
    }
  }
}

main().catch((error) => {
  writeResult({
    success: false,
    action: "unknown",
    error: {
      code: classifyError(error),
      message: errorMessage(error),
    },
  });
  process.exit(1);
});
