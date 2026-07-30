import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { TRPCProvider } from "@/trpc/provider";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">H</span>
              </div>
              <div>
                <span className="text-white font-semibold text-sm">HelpDesk OS</span>
                <span className="text-slate-500 text-xs ml-2">
                  {session.user.tenantName}
                </span>
              </div>
            </div>
            <nav className="flex items-center gap-1">
              <Link href="/tickets" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                🎫 Tickets
              </Link>
              <Link href="/assets" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                🖥️ Activos
              </Link>
              <Link href="/network" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                🔍 Red
              </Link>
              <Link href="/dvrs" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                📹 DVRs
              </Link>
              <Link href="/locations" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                🏢 Sedes
              </Link>
              <Link href="/vms" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                🎥 VMS
              </Link>
              <Link href="/monitoring" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                📡 Monitor
              </Link>
              <Link href="/dashboard" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                📊 Dashboard
              </Link>
              <Link href="/reports" className="text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg text-sm transition-colors">
                📈 Reportes
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-slate-400 hover:text-white text-sm transition-colors">
              ⚙ Configuración
            </Link>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 text-sm">{session.user.name}</span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* tRPC + React Query disponibles en todas las páginas del dashboard */}
      <TRPCProvider>
        <main className="max-w-[1600px] mx-auto px-6 py-8">{children}</main>
      </TRPCProvider>
    </div>
  );
}
