/**
 * Dahua RPC2 Client
 * Protocolo JSON-RPC sobre HTTP que usan los DVR/NVR/IPC Dahua.
 * Endpoint: POST /RPC2  (sesión activa)
 *           POST /RPC2_Login (autenticación)
 */

import crypto from "crypto";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DvrConnection {
  ip:       string;
  port:     number;   // puerto HTTP (80 por defecto)
  username: string;
  password: string;
  timeoutMs?: number; // default 8000
}

export interface SystemInfo {
  serialNumber:    string;
  deviceType:      string;   // "XVR", "NVR", "IPC", etc.
  hardwareVersion: string;
  softwareVersion: string;   // firmware
  machineName:     string;
}

export interface ProductDefinition {
  deviceType:  string;
  maxCamera:   number;        // canales totales
  marketArea:  string;
}

export interface ChannelTitle {
  channel: number;
  name:    string;
}

// ─── Cliente ─────────────────────────────────────────────────────────────────

export class DahuaRPC2Client {
  private session: number | string = 0;
  private reqId = 1;

  constructor(private conn: DvrConnection) {}

  private get baseUrl() {
    return `http://${this.conn.ip}:${this.conn.port}`;
  }

  private get timeout() {
    return this.conn.timeoutMs ?? 8000;
  }

  private md5(text: string): string {
    return crypto.createHash("md5").update(text).digest("hex").toUpperCase();
  }

  // ── Login con challenge-response Dahua ──────────────────────────────────────
  async login(): Promise<void> {
    // Paso 1: obtener challenge (realm + random)
    const challenge = await this.rpcRaw("/RPC2_Login", {
      method:  "global.login",
      params:  {
        userName:      this.conn.username,
        password:      "",
        clientType:    "Web3.0",
        authorityType: "Default",
        passwordType:  "Default",
      },
      id:      this.reqId++,
      session: 0,
    });

    // Algunos firmwares devuelven result:true en el primer intento (sin challenge)
    if (challenge.result) {
      this.session = challenge.session ?? 0;
      return;
    }

    const { random, realm } = challenge.params ?? {};

    if (!random || !realm) {
      // Fallback: Basic auth sin session (firmwares antiguos)
      this.session = 0;
      return;
    }

    // Paso 2: calcular hash de contraseña
    const ha1       = this.md5(`${this.conn.username}:${realm}:${this.conn.password}`);
    const loginPass = this.md5(`${ha1}:${random}:`);

    // Paso 3: enviar credenciales
    const result = await this.rpcRaw("/RPC2_Login", {
      method:  "global.login",
      params:  {
        userName:      this.conn.username,
        password:      loginPass,
        clientType:    "Web3.0",
        authorityType: "Default",
        passwordType:  "Default",
      },
      id:      this.reqId++,
      session: 0,
    });

    if (!result.result) {
      throw new Error(`Login fallido: ${result.error?.message ?? "credenciales inválidas"}`);
    }

    this.session = result.session ?? 0;
  }

  async logout(): Promise<void> {
    try { await this.rpc("global.logout"); } catch { /* ignorar */ }
    this.session = 0;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────
  async keepAlive(): Promise<boolean> {
    try {
      const res = await this.rpc("global.keepAlive", { timeout: 20 });
      return res.result === true;
    } catch {
      return false;
    }
  }

  // ── Información del sistema ──────────────────────────────────────────────────
  async getSystemInfo(): Promise<SystemInfo> {
    const res = await this.rpc("magicBox.getSystemInfo");
    if (!res.result) throw new Error("getSystemInfo falló");
    return {
      serialNumber:    res.params?.serialNumber    ?? "",
      deviceType:      res.params?.deviceType      ?? "",
      hardwareVersion: res.params?.hardwareVersion ?? "",
      softwareVersion: res.params?.softwareVersion ?? "",
      machineName:     res.params?.machineName     ?? "",
    };
  }

  async getProductDefinition(): Promise<ProductDefinition> {
    const res = await this.rpc("magicBox.getProductDefinition");
    return {
      deviceType: res.params?.deviceType ?? "",
      maxCamera:  res.params?.maxCamera  ?? 0,
      marketArea: res.params?.marketArea ?? "",
    };
  }

  // ── Nombres de canales ───────────────────────────────────────────────────────
  async getChannelTitles(maxChannels = 32): Promise<ChannelTitle[]> {
    try {
      const res = await this.rpc("configManager.getConfig", { name: "ChannelTitle" });
      if (!res.result || !Array.isArray(res.params?.table)) return [];
      return (res.params.table as { Name: string }[])
        .slice(0, maxChannels)
        .map((t, i) => ({ channel: i + 1, name: t.Name ?? `Canal ${i + 1}` }));
    } catch {
      return [];
    }
  }

  // ── Snapshot por canal ───────────────────────────────────────────────────────
  async getSnapshot(channel: number = 1): Promise<Buffer> {
    const auth = Buffer.from(`${this.conn.username}:${this.conn.password}`).toString("base64");
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(
        `${this.baseUrl}/cgi-bin/snapshot.cgi?channel=${channel}`,
        { headers: { Authorization: `Basic ${auth}` }, signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(t);
    }
  }

  // ── RPC interno ─────────────────────────────────────────────────────────────
  async rpc(method: string, params?: Record<string, unknown>) {
    return this.rpcRaw("/RPC2", {
      method,
      params:  params ?? null,
      id:      this.reqId++,
      session: this.session,
    });
  }

  private async rpcRaw(path: string, body: unknown) {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
      return res.json();
    } finally {
      clearTimeout(t);
    }
  }
}

// ─── Helper: conectar → ejecutar → desconectar ───────────────────────────────

export async function withDahua<T>(
  conn: DvrConnection,
  fn:   (client: DahuaRPC2Client) => Promise<T>,
): Promise<T> {
  const client = new DahuaRPC2Client(conn);
  await client.login();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
}

// ─── Helper: obtener toda la info del dispositivo en una sola llamada ─────────

export async function fetchDeviceInfo(conn: DvrConnection) {
  return withDahua(conn, async (c) => {
    const [sysInfo, prodDef, channelTitles] = await Promise.allSettled([
      c.getSystemInfo(),
      c.getProductDefinition(),
      c.getChannelTitles(),
    ]);

    return {
      systemInfo:    sysInfo.status    === "fulfilled" ? sysInfo.value    : null,
      productDef:    prodDef.status    === "fulfilled" ? prodDef.value    : null,
      channelTitles: channelTitles.status === "fulfilled" ? channelTitles.value : [],
    };
  });
}
