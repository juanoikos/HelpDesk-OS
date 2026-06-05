/**
 * GET /api/vms/events
 * Server-Sent Events — notifica alarmas en tiempo real al browser.
 * El browser abre esta conexión una vez y recibe eventos push.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { registerSseClient, unregisterSseClient } from "@/lib/alarm-handler";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  const stream = new ReadableStream<string>({
    start(controller) {
      // Mensaje inicial de conexión
      controller.enqueue(": connected\n\n");

      registerSseClient(tenantId, controller as ReadableStreamDefaultController<string>);

      // Ping cada 25 segundos para mantener la conexión viva
      const pingInterval = setInterval(() => {
        try { controller.enqueue(": ping\n\n"); }
        catch { clearInterval(pingInterval); }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unregisterSseClient(tenantId, controller as ReadableStreamDefaultController<string>);
        try { controller.close(); } catch { /* ya cerrado */ }
      }, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache, no-transform",
      "Connection":                  "keep-alive",
      "X-Accel-Buffering":           "no",  // necesario para Nginx/Railway
    },
  });
}
