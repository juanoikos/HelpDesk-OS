import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user;

  return (
    <div>
      {/* Bienvenida */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Bienvenido, {user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-400 mt-1">
          {user.tenantName} · {user.role === "ADMIN" ? "Administrador" : user.role === "AGENT" ? "Agente" : "Usuario"}
        </p>
      </div>

      {/* Stats placeholder */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Tickets abiertos", value: "—", color: "blue" },
          { label: "En progreso", value: "—", color: "yellow" },
          { label: "Resueltos hoy", value: "—", color: "green" },
          { label: "Urgentes", value: "—", color: "red" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900 rounded-xl border border-slate-800 p-5"
          >
            <p className="text-slate-400 text-sm mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Próximos bloques */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-white font-semibold mb-4">En construcción</h2>
        <div className="space-y-3">
          {[
            { bloque: "3", nombre: "Wizard de configuración con IA", estado: "próximo" },
            { bloque: "4", nombre: "Gestión de tickets", estado: "pendiente" },
            { bloque: "5", nombre: "Recepción de tickets por email", estado: "pendiente" },
          ].map((item) => (
            <div
              key={item.bloque}
              className="flex items-center gap-3 text-sm"
            >
              <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-medium flex-shrink-0">
                {item.bloque}
              </span>
              <span className="text-slate-300">{item.nombre}</span>
              <span className="ml-auto text-slate-600 text-xs capitalize">
                {item.estado}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
