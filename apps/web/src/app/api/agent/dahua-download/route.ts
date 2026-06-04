import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import JSZip from "jszip";

const R2_ZIP_URL = "https://pub-e6d29f7bdc1442c9801e662bce630b61.r2.dev/agents/DahuaAgent-win-x64.zip";
const SERVER_URL = process.env.AUTH_URL ?? "https://helpdesk-os-production.up.railway.app";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = session.user.tenantId;
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  const agentToken = settings?.agentToken ?? "";

  if (!agentToken) {
    return NextResponse.json(
      { error: "Primero genera el token del agente en la página de Activos" },
      { status: 400 }
    );
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
    ServerUrl:           SERVER_URL,
    AgentToken:          agentToken,
    PollIntervalSeconds: 10,
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
    "Requisito: .NET 8 Runtime instalado en esta PC.",
    "Descarga: https://dotnet.microsoft.com/download/dotnet/8.0",
  ].join("\n"));

  // Generar el ZIP modificado
  const output = await zip.generateAsync({
    type:               "nodebuffer",
    compression:        "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(output as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/zip",
      "Content-Disposition": 'attachment; filename="DahuaAgent.zip"',
      "Content-Length":      output.length.toString(),
    },
  });
}
