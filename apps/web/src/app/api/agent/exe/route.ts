import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    // El exe compilado se sirve desde /public/helpdesk-agent.exe
    const exePath = join(process.cwd(), "public", "helpdesk-agent.exe");
    const fileBuffer = await readFile(exePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="helpdesk-agent.exe"`,
        "Content-Length":      fileBuffer.byteLength.toString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "El ejecutable no está disponible. Compila el agente primero con apps/agent/build.bat" },
      { status: 404 }
    );
  }
}
