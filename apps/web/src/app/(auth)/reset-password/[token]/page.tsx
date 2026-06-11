"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    const data = new FormData(e.currentTarget);
    const password = data.get("password") as string;
    const confirm = data.get("confirm") as string;

    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      setStatus("error");
      return;
    }

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      let json: { error?: string } = {};
      try { json = await res.json(); } catch { /* no-json */ }

      if (!res.ok) {
        setErrorMsg(json.error ?? "Ocurrió un error. Intenta de nuevo.");
        setStatus("error");
      } else {
        setStatus("done");
      }
    } catch {
      setErrorMsg("No se pudo conectar al servidor. Intenta de nuevo.");
      setStatus("error");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl font-bold">H</span>
        </div>
        <h1 className="text-2xl font-bold text-white">HelpDesk OS</h1>
        <p className="text-slate-400 text-sm mt-1">Establece tu nueva contraseña</p>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        {status === "done" ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium">Contraseña actualizada</p>
            <p className="text-slate-400 text-sm">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <Link
              href="/login"
              className="block w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors text-sm text-center mt-4"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Nueva contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-slate-300 mb-1.5">
                Confirmar contraseña
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="Repite la contraseña"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {status === "error" && errorMsg && (
              <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2.5">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {status === "loading" ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
