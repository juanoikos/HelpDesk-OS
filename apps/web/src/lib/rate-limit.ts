// Rate limiter en memoria — funciona para instancia única en Railway
// Uso: const ok = rateLimit(ip, "register", 5, 15 * 60 * 1000)

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  ip: string,
  action: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Limpiar entradas expiradas cada 10 minutos para no acumular memoria
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 10 * 60 * 1000);
