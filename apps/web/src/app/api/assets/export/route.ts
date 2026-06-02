import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import * as XLSX from "xlsx";

const TYPE_LABEL: Record<string, string> = {
  LAPTOP:  "Laptop",
  DESKTOP: "Desktop",
  MONITOR: "Monitor",
  PHONE:   "Teléfono",
  PRINTER: "Impresora",
  SERVER:  "Servidor",
  NETWORK: "Red / Switch",
  OTHER:   "Otro",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE:      "Activo",
  INACTIVE:    "Inactivo",
  MAINTENANCE: "Mantenimiento",
  RETIRED:     "Retirado",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const params   = req.nextUrl.searchParams;

  // ── Filtros desde query params ───────────────────────────────────────────────
  const filterType     = params.get("type")     ?? "";
  const filterStatus   = params.get("status")   ?? "";
  const filterLocation = params.get("location") ?? "";
  const filterSearch   = params.get("search")   ?? "";

  // ── Consulta a la BD ─────────────────────────────────────────────────────────
  const assets = await prisma.asset.findMany({
    where: {
      tenantId,
      ...(filterType   ? { type:   filterType   as never } : {}),
      ...(filterStatus ? { status: filterStatus as never } : {}),
      ...(filterLocation ? {
        location: { contains: filterLocation, mode: "insensitive" },
      } : {}),
      ...(filterSearch ? {
        OR: [
          { name:        { contains: filterSearch, mode: "insensitive" } },
          { hostname:    { contains: filterSearch, mode: "insensitive" } },
          { username:    { contains: filterSearch, mode: "insensitive" } },
          { cpu:         { contains: filterSearch, mode: "insensitive" } },
          { assetNumber: { contains: filterSearch, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [
      { location:    { sort: "asc",  nulls: "last" } },
      { assetNumber: { sort: "asc",  nulls: "last" } },
      { hostname:    "asc" },
    ],
  });

  // ── Construir filas del Excel ────────────────────────────────────────────────
  const rows = assets.map((a) => ({
    "N° Activo":         a.assetNumber ?? "",
    "Equipo":            a.hostname ?? a.name,
    "Sede / Tienda":     a.location ?? "",
    "Tipo":              TYPE_LABEL[a.type] ?? a.type,
    "Usuario":           a.username ?? "",
    "Sistema Operativo": a.osName ?? "",
    "Procesador":        a.cpu ?? "",
    "RAM (GB)":          a.ramGB ?? "",
    "Disco":             a.diskInfo ?? "",
    "Placa Madre":       a.motherboard ?? "",
    "IP Local":          a.ipAddress ?? "",
    "MAC Address":       a.macAddress ?? "",
    "Número de serie":   a.serialNumber ?? "",
    "Estado":            STATUS_LABEL[a.status] ?? a.status,
    "Versión agente":    a.agentVersion ?? "",
    "Última conexión":   a.lastSeenAt
      ? new Date(a.lastSeenAt).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "",
    "Registrado el":     new Date(a.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }),
  }));

  // ── Crear workbook ────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Ancho de columnas
  ws["!cols"] = [
    { wch: 12 }, // N° Activo
    { wch: 20 }, // Equipo
    { wch: 22 }, // Sede
    { wch: 12 }, // Tipo
    { wch: 18 }, // Usuario
    { wch: 28 }, // OS
    { wch: 40 }, // CPU
    { wch: 8  }, // RAM
    { wch: 30 }, // Disco
    { wch: 30 }, // Placa Madre
    { wch: 14 }, // IP
    { wch: 18 }, // MAC
    { wch: 20 }, // Serie
    { wch: 14 }, // Estado
    { wch: 14 }, // Agente
    { wch: 18 }, // Última conexión
    { wch: 14 }, // Registrado
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Activos");

  // Hoja de resumen
  const today    = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const summary  = [
    ["Reporte de Activos — HelpDesk OS"],
    ["Empresa:", session.user.tenantName],
    ["Fecha:",   today],
    ["Total:",   assets.length.toString()],
    [],
    ["Filtros aplicados:"],
    ["Tipo:",          filterType     || "Todos"],
    ["Estado:",        filterStatus   || "Todos"],
    ["Sede:",          filterLocation || "Todas"],
    ["Búsqueda:",      filterSearch   || "—"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

  // ── Generar buffer y responder ────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const dateStr  = new Date().toISOString().slice(0, 10);
  const filename = `activos-${session.user.tenantName.replace(/[^a-z0-9]/gi, "_")}-${dateStr}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
