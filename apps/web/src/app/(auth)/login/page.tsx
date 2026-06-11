"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = new FormData(e.currentTarget);
      const result = await signIn("credentials", {
        email: data.get("email"),
        password: data.get("password"),
        redirect: false,
      });

      if (result?.error) {
        setError("Correo o contraseña incorrectos");
        setLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("No se pudo conectar al servidor. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl font-bold">H</span>
        </div>
        <h1 className="text-2xl font-bold text-white">HelpDesk OS</h1>
        <p className="text-slate-400 text-sm mt-1">Inicia sesión en tu cuenta</p>
      </div>

      {/* Card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
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

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-slate-400 hover:text-slate-300 text-xs transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>
      </div>

      <p className="text-center text-slate-500 text-sm mt-6">
        ¿No tienes cuenta?{" "}
        <Link
          href="/register"
          className="text-blue-400 hover:text-blue-300 font-medium"
        >
          Regístrate aquí
        </Link>
      </p>
    </div>
  );
}
