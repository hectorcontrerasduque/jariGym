"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Dumbbell, CheckCircle } from "lucide-react";
import { configService } from "@/lib/services/config/config.service";
import { messages } from "@/lib/messages";
import { AuthFooter } from "@/components/auth-footer";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const resetEmail = searchParams.get("email") || "";

const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validating] = useState(!token);
  const [tokenValid] = useState(!!token);
  const [gymName, setGymName] = useState("GymApp");
  const [gymLogo, setGymLogo] = useState("");

  useEffect(() => {
    configService.getConfig().then((config) => {
      if (config?.nombre_gym) setGymName(config.nombre_gym);
      if (config?.logo_url) setGymLogo(config.logo_url);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError(messages.auth.resetPasswordWeakPassword);
      return;
    }

    // eslint-disable-next-line security/detect-possible-timing-attacks
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
      <>
        <LoadingOverlay show={true} message={messages.common.cargar} />
        <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
        </div>
        <AuthFooter />
      </>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

        <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gym-primary/20 rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow overflow-hidden">
              {gymLogo ? (
              <Image
                src={gymLogo}
                alt={gymName}
                width={16}
                height={16}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
                <Dumbbell className="w-8 h-8 text-gym-primary" />
              )}
            </div>
            <CardTitle className="text-2xl font-display neon-text">{messages.auth.resetPasswordTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gym-muted">{messages.auth.resetPasswordInvalidToken}</p>
            <Link href="/login">
              <Button variant="secondary" className="w-full border-gym-border hover:border-gym-primary/50">
                {messages.auth.resetPasswordCloseButton}
              </Button>
            </Link>
          </CardContent>
        </Card>
        <AuthFooter />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

        <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gym-success/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-gym-success" />
            </div>
            <CardTitle className="text-2xl font-display neon-text">{messages.auth.resetPasswordSuccess}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gym-muted">{messages.auth.resetPasswordSentInstructions}</p>
            <div className="p-3 bg-gym-bg rounded-xl">
              <p className="text-xs text-gym-muted">
                {messages.auth.resetPasswordSpamWarning} <strong className="text-gym-text">{gymName}</strong>.
              </p>
            </div>
            <Link href="/login">
              <Button variant="secondary" className="w-full border-gym-border hover:border-gym-primary/50">
                {messages.auth.resetPasswordCloseButton}
              </Button>
            </Link>
          </CardContent>
        </Card>
        <AuthFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gym-primary/20 rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow overflow-hidden">
{gymLogo ? (
              <Image
                src={gymLogo}
                alt={gymName}
                width={16}
                height={16}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Dumbbell className="w-8 h-8 text-gym-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-display neon-text">{messages.auth.resetPasswordPageTitle}</CardTitle>
          <p className="text-gym-muted text-sm">{gymName}</p>
          {resetEmail && (
            <p className="text-gym-primary text-sm font-semibold bg-gym-primary/10 p-2 rounded-lg mt-2">{resetEmail}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gym-text mb-1">
                {messages.auth.resetPasswordNewPassword}
              </label>
              <PasswordInput
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gym-text mb-1">
                {messages.auth.resetPasswordConfirmPassword}
              </label>
              <PasswordInput
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {messages.auth.resetPasswordSubmit}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors">
              {messages.auth.resetPasswordCancelButton}
            </Link>
          </div>
        </CardContent>
      </Card>
      <AuthFooter />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gym-dark">
        <p className="text-gym-muted">{messages.common.cargar}</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
