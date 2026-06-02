import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";

export async function GET(req: NextRequest) {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  // ── Obtener token del agente ───────────────────────────────────────────────
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  const token  = settings?.agentToken ?? "SIN_TOKEN_CONFIGURADO";
  const server = req.nextUrl.origin;

  // ── Generar .bat launcher ──────────────────────────────────────────────────
  const batContent = [
    "@echo off",
    "chcp 65001 >nul",
    "echo.",
    "echo  HelpDesk OS - Scanner de Red",
    "echo  ================================",
    "echo.",
    'if not exist "%~dp0helpdesk-scanner.exe" (',
    "  echo  ERROR: No se encuentra helpdesk-scanner.exe",
    "  echo  Descargalo desde HelpDesk OS ^> Red ^> Descargar scanner",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    `"%~dp0helpdesk-scanner.exe" --token "${token}" --server "${server}"`,
  ].join("\r\n");

  return new NextResponse(batContent, {
    status: 200,
    headers: {
      "Content-Type":        "application/octet-stream",
      "Content-Disposition": 'attachment; filename="helpdesk-scanner.bat"',
    },
  });
}
