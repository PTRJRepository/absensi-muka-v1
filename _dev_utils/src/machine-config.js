"use strict";
// Konfigurasi Mesin Absensi - Updated 2026-06-15
// Tested via ZKTeco protocol - results included
Object.defineProperty(exports, "__esModule", { value: true });
exports.locCodeMap = exports.scannerCodeMap = exports.machineServers = void 0;
exports.getAllMachines = getAllMachines;
exports.getAccessibleMachines = getAccessibleMachines;
exports.getMachineByDivision = getMachineByDivision;
exports.getDivisionFromMachineId = getDivisionFromMachineId;
exports.convertMachineIdToEmpCode = convertMachineIdToEmpCode;
exports.machineServers = {
    // ========================================
    // ACCESSIBLE MACHINES (7 machines)
    // ========================================
    "OFFICE_PGE": {
        ip: "223.25.98.220",
        port: 4370,
        ipLocal: "10.0.0.232",
        scannerCode: null,
        locCode: null,
        suffix: "PGE",
        type: "office",
        accessible: true,
        users: 1653,
        attendances: 6547,
    },
    "OFFICE_APE": {
        ip: "103.144.208.154",
        port: 4370,
        ipLocal: "192.168.1.233",
        scannerCode: null,
        locCode: null,
        suffix: "APE",
        type: "office",
        accessible: true,
        users: 1083,
        attendances: 11423,
    },
    "MILL": {
        ip: "103.127.66.32",
        port: 4370,
        ipLocal: null,
        scannerCode: null,
        locCode: null,
        suffix: "MILL",
        type: "office",
        accessible: true,
        users: 569,
        attendances: 3273,
    },
    "IJL": {
        ip: "103.144.211.226",
        port: 4370,
        ipLocal: null,
        scannerCode: null,
        locCode: "L",
        suffix: "IJL",
        type: "absensi",
        accessible: true,
        users: 166,
        attendances: 4910,
    },
    "AB2": {
        ip: "103.144.208.154",
        port: 4400,
        ipLocal: "192.168.1.232",
        scannerCode: 400,
        locCode: "H",
        suffix: "AB2",
        type: "absensi",
        accessible: true,
        users: 233,
        attendances: 3944,
    },
    "P1A": {
        ip: "10.0.0.90",
        port: 4100,
        ipLocal: "10.0.0.90",
        scannerCode: 100,
        locCode: "A",
        suffix: "P1A",
        type: "absensi",
        accessible: true,
        users: 792,
        attendances: 2681,
    },
    "P1B": {
        ip: "10.0.0.91",
        port: 4300,
        ipLocal: "10.0.0.91",
        scannerCode: 300,
        locCode: "B",
        suffix: "P1B",
        type: "absensi",
        accessible: true,
        users: 792,
        attendances: 2675,
    },
    // ========================================
    // INACCESSIBLE MACHINES (9 machines)
    // ========================================
    // Note: Some may be blocked by firewall/port forwarding
    "DME_01": {
        ip: "103.144.228.42",
        port: 4700,
        ipLocal: "192.168.1.10",
        scannerCode: 700,
        locCode: "E",
        suffix: "DME",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "DME_02": {
        ip: "103.144.228.42",
        port: 4701,
        ipLocal: "192.168.1.11",
        scannerCode: 700,
        locCode: "E",
        suffix: "DME",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "ARC_01": {
        ip: "103.144.208.154",
        port: 4200,
        ipLocal: "192.168.1.235",
        scannerCode: 200,
        locCode: "J",
        suffix: "ARC",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "ARC_02": {
        ip: "103.144.208.154",
        port: 4201,
        ipLocal: "192.168.1.236",
        scannerCode: 200,
        locCode: "J",
        suffix: "ARC",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "ARA": {
        ip: "103.144.208.154",
        port: 4800,
        ipLocal: "192.168.1.230",
        scannerCode: 800,
        locCode: "F",
        suffix: "ARA",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "AB1": {
        ip: "103.144.208.154",
        port: 4900,
        ipLocal: "192.168.1.231",
        scannerCode: 900,
        locCode: "G",
        suffix: "AB1",
        type: "absensi",
        accessible: false,
        error: "Connection failed - port not reachable",
    },
    "P2A_01": {
        ip: "10.0.0.92",
        port: 4500,
        ipLocal: "10.0.0.92",
        scannerCode: 500,
        locCode: "C",
        suffix: "P2A",
        type: "absensi",
        accessible: false,
        error: "Connection failed - network unreachable",
    },
    "P2B": {
        ip: "10.0.0.93",
        port: 4600,
        ipLocal: "10.0.0.93",
        scannerCode: 600,
        locCode: "D",
        suffix: "P2B",
        type: "absensi",
        accessible: false,
        error: "Connection failed - network unreachable",
    },
    "P2A_02": {
        ip: "10.0.0.94",
        port: 4501,
        ipLocal: "10.0.0.94",
        scannerCode: 500,
        locCode: "C",
        suffix: "P2A",
        type: "absensi",
        accessible: false,
        error: "Connection failed - network unreachable",
    },
};
// Scanner Code Suffix → Number Prefix
exports.scannerCodeMap = {
    "P1A": 100, "ARC": 200, "P1B": 300, "AB2": 400,
    "P2A": 500, "P2B": 600, "DME": 700, "ARA": 800, "AB1": 900,
};
// locCode → Employee Code Prefix
exports.locCodeMap = {
    "P1A": "A", "P1B": "B", "P2A": "C", "P2B": "D",
    "DME": "E", "ARA": "F", "AB1": "G", "AB2": "H",
    "ARC": "J", "IJL": "L", "PGE": "A", "APE": "A",
};
/** Get all machine configs */
function getAllMachines() {
    return Object.entries(exports.machineServers).map(([code, cfg]) => ({ code, ...cfg }));
}
/** Get only accessible machines */
function getAccessibleMachines() {
    return getAllMachines().filter(m => m.accessible === true);
}
/** Get machine config by division/location code */
function getMachineByDivision(division) {
    return exports.machineServers[division] || null;
}
/** Get division dari machine ID (berdasarkan scanner suffix) */
function getDivisionFromMachineId(machineId) {
    const id = String(machineId);
    const suffix = parseInt(id.slice(-3));
    for (const [div, code] of Object.entries(exports.scannerCodeMap)) {
        if (code === suffix)
            return div;
    }
    return null;
}
/** Konversi Machine ID ke Employee Code */
function convertMachineIdToEmpCode(machineId, division) {
    const id = String(machineId);
    if (/^[A-Z]\d+$/.test(id))
        return id;
    const div = division || getDivisionFromMachineId(id) || "P1A";
    const empPrefix = exports.locCodeMap[div] || "X";
    const numPart = id.slice(-4).replace(/^0+/, "") || "0";
    return `${empPrefix}${numPart.padStart(4, "0")}`;
}
//# sourceMappingURL=machine-config.js.map