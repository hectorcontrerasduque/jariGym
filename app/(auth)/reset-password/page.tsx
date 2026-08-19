"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { messages } from "@/lib/messages";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    setValidating(false);
    setTokenValid(true);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(messages.auth.resetPasswordWeakPassword);
      return;
    }

    if (password !== confirmPassword) {
      setError(messages.auth.resetPasswordPasswordMismatch);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setSuccess(true);
    } catch {
      setError(messages.auth.resetPasswordError);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gym-dark">
        <p className="text-white">{messages.common.cargar}</p>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gym-dark">
        <div className="w-full max-w-md bg-gym-card rounded-2xl p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            {messages.auth.resetPasswordTitle}
          </h1>
          <p className="text-gray-400 mb-6">{messages.auth.resetPasswordInvalidToken}</p>
          <Link
            href="/login"
            className="inline-block bg-gym-cyan text-gym-dark font-semibold px-6 py-3 rounded-lg hover:bg-gym-cyan/90 transition-colors"
          >
            {messages.auth.resetPasswordCloseButton}
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gym-dark">
        <div className="w-full max-w-md bg-gym-card rounded-2xl p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            {messages.auth.resetPasswordSuccess}
          </h1>
          <p className="text-gray-400 mb-6">{messages.auth.resetPasswordSentInstructions}</p>
          <Link
            href="/login"
            className="inline-block bg-gym-cyan text-gym-dark font-semibold px-6 py-3 rounded-lg hover:bg-gym-cyan/90 transition-colors"
          >
            {messages.auth.resetPasswordCloseButton}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gym-dark">
      <div className="w-full max-w-md bg-gym-card rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">
          {messages.auth.resetPasswordTitle}
        </h1>
        <p className="text-gray-400 text-center mb-6">
          Ingresa tu nueva contraseña
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {messages.auth.resetPasswordNewPassword}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gym-dark border border-gym-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gym-cyan"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {messages.auth.resetPasswordConfirmPassword}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gym-dark border border-gym-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gym-cyan"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gym-cyan text-gym-dark font-semibold py-3 rounded-lg hover:bg-gym-cyan/90 transition-colors disabled:opacity-50"
          >
            {loading ? messages.common.procesando : messages.auth.resetPasswordSubmit}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-gym-cyan hover:underline text-sm">
            {messages.auth.resetPasswordCancelButton}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gym-dark">
        <p className="text-white">{messages.common.cargar}</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
