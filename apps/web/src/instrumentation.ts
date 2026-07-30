/**
 * Next.js Instrumentation Hook
 * Se ejecuta una sola vez al arrancar el servidor Node.js.
 * Aquí iniciamos el poller IMAP de email entrante.
 */
export async function register() {
  // Solo en el runtime de Node.js (no en Edge ni en el cliente)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startImapPolling } = await import("./lib/imap-poller");
    startImapPolling();

    const { startWanMonitor } = await import("./lib/wan-monitor");
    startWanMonitor();

    const { startDvrHeartbeat } = await import("./lib/dvr-heartbeat");
    startDvrHeartbeat();

    const { startDvrEventSubscriber } = await import("./lib/dvr-events");
    startDvrEventSubscriber();

    const { startChannelHeartbeat } = await import("./lib/channel-heartbeat");
    startChannelHeartbeat();
  }
}
