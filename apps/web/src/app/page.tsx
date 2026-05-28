export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">H</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">HelpDesk OS</h1>
          <p className="text-slate-400">Sistema de soporte TI multi-empresa</p>
        </div>

        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-4">
          <p className="text-green-400 font-medium mb-1">✓ Bloque 1 completado</p>
          <p className="text-slate-400 text-sm">Esqueleto del monorepo listo</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <p className="text-slate-300 text-xs font-medium mb-1">Framework</p>
            <p className="text-white text-sm">Next.js 15</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <p className="text-slate-300 text-xs font-medium mb-1">Base de datos</p>
            <p className="text-white text-sm">PostgreSQL + Prisma</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <p className="text-slate-300 text-xs font-medium mb-1">Monorepo</p>
            <p className="text-white text-sm">Turborepo</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
            <p className="text-slate-300 text-xs font-medium mb-1">Estilos</p>
            <p className="text-white text-sm">Tailwind v4</p>
          </div>
        </div>

        <p className="text-slate-600 text-sm">Próximo: Bloque 2 — Login y registro de empresa</p>
      </div>
    </main>
  );
}
