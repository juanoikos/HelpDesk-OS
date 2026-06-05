export { DahuaRPC2Client, withDahua, fetchDeviceInfo } from "./rpc2";
export type { DvrConnection, SystemInfo, ProductDefinition, ChannelTitle } from "./rpc2";

export { ptzStart, ptzStop, gotoPreset, setPreset, getPresets } from "./ptz";
export type { PtzCode, PtzPreset, PtzConnection } from "./ptz";

export { getEncodeConfig, rebootDevice, getStorageInfo } from "./config";
export type { ChannelEncodeConfig, StorageInfo } from "./config";
