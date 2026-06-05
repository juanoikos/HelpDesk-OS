/**
 * Dahua PTZ — Control de cámara via HTTP/CGI
 * Endpoint: GET http://{ip}:{port}/cgi-bin/ptz.cgi?action=start&channel={ch}&code={code}&arg1=0&arg2={speed}&arg3=0
 *
 * Nota: para baja latencia, los comandos PTZ se ejecutan desde el servidor
 * usando las credenciales del DVR. Para DVRs en LAN, se puede llamar via tunnel.
 */

export type PtzCode =
  | "Up" | "Down" | "Left" | "Right"
  | "LeftUp" | "LeftDown" | "RightUp" | "RightDown"
  | "ZoomTele" | "ZoomWide"
  | "FocusNear" | "FocusFar"
  | "IrisSmall" | "IrisLarge"
  | "GotoPreset" | "SetPreset" | "ClearPreset";

export interface PtzPreset {
  presetId: number;
  name:     string;
}

export interface PtzConnection {
  ip:       string;
  httpPort: number;   // 80 por defecto
  username: string;
  password: string;
  channel:  number;
  timeoutMs?: number;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function ptzFetch(
  conn:   PtzConnection,
  params: Record<string, string | number>,
): Promise<string> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const url  = `http://${conn.ip}:${conn.httpPort}/cgi-bin/ptz.cgi?${qs}`;
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), conn.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: basicAuth(conn.username, conn.password) },
      signal:  ctrl.signal,
    });
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

// ─── Comandos PTZ ────────────────────────────────────────────────────────────

/** Iniciar movimiento PTZ continuo */
export async function ptzStart(
  conn:  PtzConnection,
  code:  PtzCode,
  speed: number = 5,
): Promise<void> {
  // arg1 siempre 0, arg2 = velocidad pan/tilt, arg3 = velocidad zoom
  const isZoom = code === "ZoomTele" || code === "ZoomWide";
  const isFocus = code === "FocusNear" || code === "FocusFar";
  await ptzFetch(conn, {
    action:  "start",
    channel: conn.channel,
    code,
    arg1: 0,
    arg2: isZoom || isFocus ? 0 : speed,
    arg3: isZoom ? speed : 0,
  });
}

/** Detener movimiento PTZ */
export async function ptzStop(conn: PtzConnection): Promise<void> {
  await ptzFetch(conn, {
    action:  "stop",
    channel: conn.channel,
    code:    "Up",
    arg1: 0, arg2: 0, arg3: 0,
  });
}

/** Ir a preset guardado */
export async function gotoPreset(conn: PtzConnection, presetId: number): Promise<void> {
  await ptzFetch(conn, {
    action:  "start",
    channel: conn.channel,
    code:    "GotoPreset",
    arg1: 0, arg2: presetId, arg3: 0,
  });
}

/** Guardar posición actual como preset */
export async function setPreset(conn: PtzConnection, presetId: number): Promise<void> {
  await ptzFetch(conn, {
    action:  "start",
    channel: conn.channel,
    code:    "SetPreset",
    arg1: 0, arg2: presetId, arg3: 0,
  });
}

/** Listar presets del canal */
export async function getPresets(conn: PtzConnection): Promise<PtzPreset[]> {
  const text = await ptzFetch(conn, {
    action:  "getPresets",
    channel: conn.channel,
  });

  const presets: PtzPreset[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Formato: presets[0].Name=Entrada   presets[0].PresetID=1
  const idxSet = new Set<number>();
  for (const line of lines) {
    const mIdx = line.match(/^presets\[(\d+)\]/);
    if (mIdx) idxSet.add(parseInt(mIdx[1]!));
  }

  for (const i of Array.from(idxSet).sort((a, b) => a - b)) {
    const getName = (key: string) =>
      lines.find(l => l.startsWith(`presets[${i}].${key}=`))
           ?.split("=").slice(1).join("=")?.trim() ?? "";

    const name     = getName("Name");
    const presetId = parseInt(getName("PresetID") || String(i + 1));
    if (name) presets.push({ presetId, name });
  }

  return presets;
}
