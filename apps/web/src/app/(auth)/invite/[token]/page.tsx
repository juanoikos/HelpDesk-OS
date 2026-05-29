"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type InviteData = {
  name:       string;
  email:      string;
  tenantName: string;
  groupName?: string | null;
};

export default function InvitePage() {
  const params  = useParams();
  const token   = params.token as string;
  const router  = useRouter();

  const [invite,   setInvite]   = useState<InviteData | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [formErr,  setFormErr]  = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Enlace de invitación inválido o expirado.");
        } else {
          const data: InviteData = await res.json();
          setInvite(data);
          setName(data.name);
        }
      })
      .catch(() => setError("Error al validar el enlace. Intenta de nuevo."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);

    if (name.trim().length < 2) {
      setFormErr("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (password.length < 8) {
      setFormErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setFormErr("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${token}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password, name: name.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormErr(body.error ?? "Error al activar la cuenta. Intenta de nuevo.");
        setSubmitting(false);
        return;
      }

      router.push("/login?activated=1");
    } catch {
      setFormErr("Error de red. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-xl font-bold">H</span>
        </div>
        <p className="text-slate-400 text-sm">Validando enlace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-xl font-bold">H</span>
        </div>
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
          <p className="text-red-400 font-semibold mb-2">Enlace inválido</p>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link href="/login" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Ir al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl font-bold">H</span>
        </div>
        <h1 className="text-2xl font-bold text-white">HelpDesk OS</h1>
        <p className="text-slate-400 text-sm mt-1">
          Activa tu cuenta en <span className="text-slate-200 font-medium">{invite?.tenantName}</span>
        </p>
        {invite?.groupName && (
          <p className="text-slate-500 text-xs mt-1">
            Grupo: <span className="text-slate-300">{invite.groupName}</span>
          </p>
        )}
      </div>

      {/* Card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
              Tu nombre
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              disabled
              value={invite?.email ?? ""}
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-300 mb-1.5">
              Confirmar contraseña
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {formErr && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2.5">
              {formErr}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {submitting ? "Activando cuenta..." : "Activar cuenta"}
          </button>
        </form>
      </div>

      <p className="text-center text-slate-500 text-sm mt-6">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
