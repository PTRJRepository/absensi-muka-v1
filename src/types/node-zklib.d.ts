declare module 'node-zklib' {
  export default class ZKLib {
    constructor(
      ip: string,
      port: number,
      inport?: number,
      outport?: number,
      password?: string | number
    );
    createSocket(): Promise<void>;
    disconnect(): Promise<void>;
    enableDevice(): Promise<void>;
    disableDevice(): Promise<void>;
    getUsers(): Promise<{ data: any[]; err: any }>;
    getAttendances(): Promise<{ data: any[]; err: any }>;
    getTime(): Promise<number>;
    getDeviceInfo(): Promise<any>;
    getSerialNumber(): Promise<string>;
    setTime(date: Date): Promise<void>;
    version: string;
  }
}
