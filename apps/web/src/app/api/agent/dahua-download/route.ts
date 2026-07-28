import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import JSZip from "jszip";
import { ensureTunnelForTenant } from "@/lib/cloudflare";

const R2_ZIP_URL = "https://pub-e6d29f7bdc1442c9801e662bce630b61.r2.dev/agents/DahuaAgent-win-x64.zip";
const SERVER_URL = process.env.AUTH_URL ?? "https://helpdesk-os-production.up.railway.app";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

const tenantId = session.user.tenantId;
  const [settings, tenant] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    ]);
  const agentToken = settings?.agentToken ?? "";

if (!agentToken) {
  return NextResponse.json(
    { error: "Primero genera el token del agente en la página de Activos" },
    { status: 400 }
    );
}
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

// Crear (o reutilizar) el Cloudflare Tunnel de este tenant y obtener un
// token de instalación fresco + el hostname público asignado.
let tunnelToken = "";
  let tunnelHostname = "";
  try {
    const tunnel = await ensureTunnelForTenant(tenantId, tenant.slug);
    tunnelToken = tunnel.tunnelToken;
    tunnelHostname = tunnel.hostname;
  } catch (err) {
    // No bloquear la descarga del agente si Cloudflare falla — el agente
  // sigue funcionando para tickets/inventario, solo sin Live View.
  console.error(`[dahua-download] No se pudo aprovisionar el tunnel para tenant ${tenantId}:`, err);
  }

// Descargar el ZIP base desde R2
const r2Resp = await fetch(R2_ZIP_URL);
  if (!r2Resp.ok) {
    return NextResponse.json(
      { error: "No se pudo obtener el agente compilado. Intenta en unos minutos." },
      { status: 502 }
      );
  }

const zipBuffer = await r2Resp.arrayBuffer();
  const zip = await JSZip.loadAsync(zipBuffer);

// Reemplazar config.json con el del usuario actual
const config = {
  ServerUrl: SERVER_URL,
  AgentToken: agentToken,
  PollIntervalSeconds: 10,
  EnableLiveView: true,
  LiveViewPort: 1984,
  TunnelToken: tunnelToken,
  TunnelHostname: tunnelHostname,
};
  zip.file("config.json", JSON.stringify(config, null, 2));

// Actualizar LEEME.txt
zip.file("LEEME.txt", [
  "HelpDesk OS — Agente Dahua",
  "===========================",
  "",
  "El config.json ya viene configurado con tu servidor y token.",
  "Solo ejecuta DahuaAgent.exe y listo.",
  "",
  "Live View activado: al iniciar, el agente descarga go2rtc.exe y cloudflared.exe",
  "(~40 MB la primera vez) y crea un tunnel HTTPS para acceder a los DVRs locales.",
  "",
  "Requisito: .NET 8 Runtime instalado en esta PC.",
  "Descarga: https://dotnet.microsoft.com/download/dotnet/8.0",
  ].join("\n"));

// Generar el ZIP modificado
const output = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
});

return new NextResponse(output as unknown as BodyInit, {
  status: 200,
  headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="DahuaAgent.zip"',
    "Content-Length": output.length.toString(),
  },
});
}
