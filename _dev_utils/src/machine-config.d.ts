export interface MachineConfig {
    ip: string;
    port: number;
    ipLocal?: string;
    scannerCode?: number | null;
    locCode?: string | null;
    suffix: string;
    type: string;
    accessible?: boolean;
    users?: number;
    attendances?: number;
    error?: string | null;
}
export declare const machineServers: Record<string, MachineConfig>;
export declare const scannerCodeMap: Record<string, number>;
export declare const locCodeMap: Record<string, string>;
/** Get all machine configs */
export declare function getAllMachines(): Array<{
    code: string;
} & MachineConfig>;
/** Get only accessible machines */
export declare function getAccessibleMachines(): Array<{
    code: string;
} & MachineConfig>;
/** Get machine config by division/location code */
export declare function getMachineByDivision(division: string): MachineConfig;
/** Get division dari machine ID (berdasarkan scanner suffix) */
export declare function getDivisionFromMachineId(machineId: number | string): string | null;
/** Konversi Machine ID ke Employee Code */
export declare function convertMachineIdToEmpCode(machineId: number | string, division?: string): string;
//# sourceMappingURL=machine-config.d.ts.map