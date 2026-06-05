/**
 * Dahua Remote Config — configManager + magicBox via RPC2
 */

import { DahuaRPC2Client, type DvrConnection } from "./rpc2";

export interface ChannelEncodeConfig {
  channel:      number;
  resolution:   string;   // "1920x1080", "1280x720", etc.
  fps:          number;
  bitrate:      number;   // kbps
  bitrateType:  string;   // "VBR" | "CBR"
  videoCodec:   string;   // "H.265" | "H.264"
}

export interface StorageInfo {
  diskCount:   number;
  totalGB:     number;
  usedGB:      number;
  healthStatus: string;
}

// ─── Obtener configuración de codificación de un canal ───────────────────────

export async function getEncodeConfig(conn: DvrConnection, channel: number): Promise<ChannelEncodeConfig | null> {
  const client = new DahuaRPC2Client(conn);
  try {
    await client.login();
    const res = await client.rpc("configManager.getConfig", { name: "Encode" });
    await client.logout();

    if (!res.result || !Array.isArray(res.params?.table)) return null;

    // El array tiene una entrada por canal (0-based)
    const entry = res.params.table[channel - 1] as Record<string, unknown> | undefined;
    if (!entry) return null;

    const main = (entry["MainFormat"] as Record<string, unknown>[])?.[0] ?? {};
    const video = (main["Video"] as Record<string, unknown>) ?? {};

    return {
      channel,
      resolution:  String(video["Width"] ?? "") + "x" + String(video["Height"] ?? ""),
      fps:         Number(video["FPS"] ?? 0),
      bitrate:     Number(video["BitRate"] ?? 0),
      bitrateType: String(video["BitRateControl"] ?? "VBR"),
      videoCodec:  String(video["Compression"] ?? "H.264"),
    };
  } catch {
    return null;
  }
}

// ─── Reboot remoto ────────────────────────────────────────────────────────────

export async function rebootDevice(conn: DvrConnection): Promise<void> {
  const client = new DahuaRPC2Client(conn);
  await client.login();
  try { await client.rpc("magicBox.reboot"); }
  finally { /* no logout — el equipo se reinicia */ }
}

// ─── Info de storage (HDD) ───────────────────────────────────────────────────

export async function getStorageInfo(conn: DvrConnection): Promise<StorageInfo | null> {
  const client = new DahuaRPC2Client(conn);
  try {
    await client.login();
    const res = await client.rpc("storage.getDeviceAllInfo");
    await client.logout();

    if (!res.result) return null;
    const disks = Array.isArray(res.params?.info) ? res.params.info as Record<string, unknown>[] : [];

    let totalGB = 0, usedGB = 0;
    for (const d of disks) {
      totalGB += Number(d["TotalSpace"] ?? 0) / 1024;
      usedGB  += Number(d["UsedSpace"]  ?? 0) / 1024;
    }

    return {
      diskCount:    disks.length,
      totalGB:      Math.round(totalGB),
      usedGB:       Math.round(usedGB),
      healthStatus: disks[0] ? String((disks[0] as Record<string, unknown>)["Status"] ?? "Unknown") : "Unknown",
    };
  } catch {
    return null;
  }
}
