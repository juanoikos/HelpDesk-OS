"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);

    try {
      const data = new FormData(e.currentTarget);
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });

      let json: { error?: string } = {};
      try { json = await res.json(); } catch { /* no-json */ }

      if (!res.ok) {
        setErrorMsg(json.error ?? "Ocurrió un error. Intenta de nuevo.");
        setStatus("error");
      } else {
        setStatus("sent");
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
        <p className="text-slate-400 text-sm mt-1">Recupera tu contraseña</p>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        {status === "sent" ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium">Revisa tu correo</p>
            <p className="text-slate-400 text-sm">
              Si ese correo está registrado, recibirás un enlace para restablecer tu contraseña. El enlace vence en 1 hora.
            </p>
            <Link href="/login" className="block text-blue-400 hover:text-blue-300 text-sm mt-2">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-slate-400 text-sm">
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@empresa.com"
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
              {status === "loading" ? "Enviando..." : "Enviar enlace"}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-slate-500 text-sm mt-6">
        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}
