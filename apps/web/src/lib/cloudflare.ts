import { prisma } from "@helpdesk-os/db";

// Variables de entorno requeridas en Railway:
//   CLOUDFLARE_API_TOKEN — Token con permisos "Account.Cloudflare Tunnel: Edit"
//                           + "Zone.DNS: Edit" (scope: solo zona helpdeskos.co).
//                           Crear en https://dash.cloudflare.com/profile/api-tokens
// Opcionales (tienen default hardcodeado si no se definen):
//   CLOUDFLARE_ACCOUNT_ID — default: cfaba925c4046955197eef7012fce9b1
//   CLOUDFLARE_ZONE_ID    — default: 05412f6625c8b347a9ac67c8b36c183b (zona helpdeskos.co)

const DEFAULT_ACCOUNT_ID = "cfaba925c4046955197eef7012fce9b1";
const DEFAULT_ZONE_ID = "05412f6625c8b347a9ac67c8b36c183b";
const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const LOCAL_SERVICE = "http://localhost:1984"; // go2rtc, mismo puerto que usa TunnelService.cs

type CfListResponse<T> = { success: boolean; result: T[]; errors: { message: string }[] };
type CfItemResponse<T> = { success: boolean; result: T; errors: { message: string }[] };

function getCfConfig() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID ?? DEFAULT_ZONE_ID;

if (!apiToken) {
  throw new Error(
    "Cloudflare no configurado — define CLOUDFLARE_API_TOKEN en Railway " +
    "(Account.Cloudflare Tunnel: Edit + Zone.DNS: Edit sobre helpdeskos.co)",
    );
}

return { apiToken, accountId, zoneId };
}

async function cfFetch<T>(
  path: string,
  apiToken: string,
  init: RequestInit = {},
  ): Promise<T> {
  const resp = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const data = await resp.json();
  if (!resp.ok || data.success === false) {
    const msg = data.errors?.map((e: { message: string }) => e.message).join("; ") ?? resp.statusText;
    throw new Error(`Cloudflare API error (${resp.status}): ${msg}`);
  }

return data as T;
}

/**
* Garantiza que un tenant tenga un Cloudflare Tunnel autenticado, con su
* hostname público ya enrutado (vms-<slug>.helpdeskos.co → localhost:1984).
*
* Si el tenant ya tiene un tunnel creado (cloudflareTunnelId en DB), solo
* refresca el token de instalación (ese endpoint no es de un solo uso, se
* puede pedir cuantas veces se quiera). Si no, crea todo desde cero:
* tunnel → configuración de ingress → registro DNS CNAME.
*
* Devuelve el token de instalación (para pegar en config.json del agente
* como TunnelToken) y el hostname asignado (TunnelHostname).
*/
export async function ensureTunnelForTenant(
  tenantId: string,
  slug: string,
  ): Promise<{ tunnelToken: string; hostname: string }> {
  const { apiToken, accountId, zoneId } = getCfConfig();

const existing = await prisma.agentTunnel.findUnique({ where: { tenantId } });

// Caso 1: ya existe el tunnel — solo renovar el token de instalación.
if (existing?.cloudflareTunnelId && existing.hostname) {
  const tokenResp = await cfFetch<CfItemResponse<string>>(
    `/accounts/${accountId}/cfd_tunnel/${existing.cloudflareTunnelId}/token`,
    apiToken,
    );
  return { tunnelToken: tokenResp.result, hostname: existing.hostname };
}

// Caso 2: crear todo desde cero.
const hostname = `vms-${slug}.helpdeskos.co`;
  const tunnelName = `dahua-agent-${slug}`;

// 2.1 — Crear el tunnel (remotely-managed, config_src: "cloudflare" porque
// la configuración de ingress se define vía API, no en un archivo local).
const createResp = await cfFetch<CfItemResponse<{ id: string }>>(
  `/accounts/${accountId}/cfd_tunnel`,
  apiToken,
  {
    method: "POST",
    body: JSON.stringify({ name: tunnelName, config_src: "cloudflare" }),
  },
  );
  const tunnelId = createResp.result.id;

// 2.2 — Configurar ingress: hostname público → servicio local del agente.
await cfFetch(
  `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
  apiToken,
  {
    method: "PUT",
    body: JSON.stringify({
      config: {
        ingress: [
          { hostname, service: LOCAL_SERVICE },
          { service: "http_status:404" }, // catch-all obligatorio al final
          ],
      },
    }),
  },
  );

// 2.3 — Crear (o actualizar si ya existe) el registro DNS CNAME hacia el
// tunnel. Se verifica primero por nombre para que un reintento tras un
// fallo de red a mitad de camino no rompa por "registro duplicado".
const dnsRecordBody = {
  type: "CNAME",
  name: hostname,
  content: `${tunnelId}.cfargotunnel.com`,
  proxied: true,
};
  const existingDns = await cfFetch<CfListResponse<{ id: string }>>(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
    apiToken,
    );
  if (existingDns.result.length > 0) {
    await cfFetch(
      `/zones/${zoneId}/dns_records/${existingDns.result[0].id}`,
      apiToken,
      { method: "PUT", body: JSON.stringify(dnsRecordBody) },
      );
  } else {
    await cfFetch(
      `/zones/${zoneId}/dns_records`,
      apiToken,
      { method: "POST", body: JSON.stringify(dnsRecordBody) },
      );
  }

// 2.4 — Obtener el token de instalación para el agente.
const tokenResp = await cfFetch<CfItemResponse<string>>(
  `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
  apiToken,
  );

// 2.5 — Persistir en DB. tunnelUrl arranca igual al hostname; el heartbeat
// del agente (tunnel-register) lo mantiene actualizado después.
await prisma.agentTunnel.upsert({
  where: { tenantId },
  create: {
    tenantId,
    tunnelUrl: `https://${hostname}`,
    cloudflareTunnelId: tunnelId,
    hostname,
    isActive: false, // recién creado, aún no hay heartbeat real
  },
  update: {
    cloudflareTunnelId: tunnelId,
    hostname,
  },
});

return { tunnelToken: tokenResp.result, hostname };
}
