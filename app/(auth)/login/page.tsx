"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { authService } from "@/lib/services/auth/auth.service";
import { migracionService } from "@/lib/services/migracion/migracion.service";
import { createClient } from "@/lib/supabase/client";
import { Dumbbell, CheckCircle, Mail, ArrowLeft, UserCheck } from "lucide-react";
import { configService } from "@/lib/services/config/config.service";
import { messages } from "@/lib/messages";
import { AuthFooter } from "@/components/auth-footer";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [gymName, setGymName] = useState("GymApp");
  const [gymOwnerEmail, setGymOwnerEmail] = useState("");
  const [gymLogo, setGymLogo] = useState("");

  const [showMigrateForm, setShowMigrateForm] = useState(false);
  const [migrateStep, setMigrateStep] = useState<"form" | "select" | "success" | "error" | "loading">("form");
  const [migrateMatches, setMigrateMatches] = useState<string[]>([]);
  const [migrateSelected, setMigrateSelected] = useState("");
  const [migrateError, setMigrateError] = useState("");
  const [migNombre, setMigNombre] = useState("");
  const [migWhatsapp, setMigWhatsapp] = useState("");
  const [migCorreo, setMigCorreo] = useState("");
  const [migPassword, setMigPassword] = useState("");
  const [migPasswordConfirm, setMigPasswordConfirm] = useState("");
  const [migEmailExists, setMigEmailExists] = useState(false);
  const [migIsExistingUser, setMigIsExistingUser] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(decodeURIComponent(err));
    const msg = searchParams.get("message");
    if (msg) setSuccess(decodeURIComponent(msg));

    // Handle hash fragment errors from Supabase auth (e.g. expired magic links)
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.substring(1));
      const hashError = hash.get("error_description") || hash.get("error");
      if (hashError) {
        setError(decodeURIComponent(hashError));
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    // Handle confirmation token as query param — redirect to confirm-email route
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      window.location.href = `/api/auth/confirm-email?token=${tokenParam}`;
      return;
    }

    configService.getConfig().then((config) => {
      if (config?.nombre_gym) setGymName(config.nombre_gym);
      if (config?.dueno_email) setGymOwnerEmail(config.dueno_email);
      if (config?.logo_url) setGymLogo(config.logo_url);
    }).catch(() => {});
  }, [searchParams]);

  const isAuthorizedUser = async (userEmail: string, userId: string): Promise<boolean> => {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    const isAdminEmail = adminEmail && userEmail === adminEmail;

    const supabase = createClient();
    let { data: profile } = await supabase
      .from("profiles")
      .select("role, activo, registered")
      .eq("id", userId)
      .single();

    if (!profile && (isAdminEmail || (gymOwnerEmail && userEmail === gymOwnerEmail))) {
      try {
        await fetch("/api/auth/ensure-super-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, inscripcion_pagada: true }),
        });
        const { data: retry } = await supabase
          .from("profiles")
          .select("role, activo, registered")
          .eq("id", userId)
          .single();
        if (retry) profile = retry;
      } catch {}
    }

    if (!profile) return false;
    if (profile.role === "super_admin" || profile.role === "admin") {
      if (gymOwnerEmail && userEmail === gymOwnerEmail && profile.role !== "super_admin") {
        await supabase
          .from("profiles")
          .update({ role: "super_admin", registered: true })
          .eq("id", userId);
      }
      return true;
    }
    if (profile.activo !== false && profile.registered === true) return true;

    return false;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await authService.signInWithGoogle();
    } catch (err: any) {
      setError(err.message || messages.auth.googleLoginError);
      setLoading(false);
    }
  };

  const mapAuthError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login credentials") || m.includes("invalid") && m.includes("credentials")) return messages.auth.invalidCredentials;
    if (m.includes("email not confirmed")) return messages.auth.emailNotConfirmed;
    if (m.includes("user not found")) return messages.auth.userNotFound;
    if (m.includes("too many requests")) return messages.auth.tooManyRequests;
    if (m.includes("password")) return messages.auth.emailLoginError;
    return messages.auth.emailLoginError;
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await authService.signInWithEmail(email, password);
      const userId = result.user?.id;
      if (userId) {
        const authorized = await isAuthorizedUser(result.user?.email || "", userId);
        if (!authorized) {
          const supabase = createClient();
          await supabase.auth.signOut();
          setError(messages.auth.userNotRegistered);
          setLoading(false);
          return;
        }
        const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
        const isAdmin = (adminEmail && result.user?.email === adminEmail) ||
          (result.user?.email === gymOwnerEmail);
        router.push(isAdmin ? "/dashboard" : "/dashboard/mis-pagos");
      }
    } catch (err: any) {
      setError(mapAuthError(err.message || ""));
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError("");
    try {
      await authService.resetPassword(resetEmail);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || messages.auth.resetPasswordError);
    } finally {
      setResetLoading(false);
    }
  };

  const handleEmailBlur = async () => {
    if (!migCorreo || migCorreo.length < 5) return;
    try {
      const result = await migracionService.pingEmail(migCorreo);
      setMigEmailExists(result.exists);
    } catch {
      setMigEmailExists(false);
    }
  };

  const handleMigrateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMigrateError("");

    if (migPassword.length < 6) {
      setMigrateError(messages.migracion.passwordMinError);
      return;
    }
    if (migPassword !== migPasswordConfirm) {
      setMigrateError(messages.migracion.passwordMismatchError);
      return;
    }

    setMigrateStep("loading");
    try {
      const matches = await migracionService.searchByName(migNombre);
      if (matches.length === 0) {
        setMigrateError(messages.migracion.noResults);
        setMigrateStep("form");
        return;
      }
      if (matches.length === 1) {
        await executeMigracion(matches[0]);
        return;
      }
      setMigrateMatches(matches);
      setMigrateStep("select");
    } catch (err: any) {
      setMigrateError(err.message || messages.migracion.error);
      setMigrateStep("form");
    }
  };

  const handleSelectMatch = async () => {
    if (!migrateSelected) return;
    setMigrateStep("loading");
    try {
      await executeMigracion(migrateSelected);
    } catch (err: any) {
      setMigrateError(err.message || messages.migracion.error);
      setMigrateStep("select");
    }
  };

  const executeMigracion = async (selectedNombre: string) => {
    setMigrateStep("loading");
    try {
      const result = await migracionService.migrate({
        nombreCompleto: migNombre,
        whatsapp: migWhatsapp,
        correo: migCorreo,
        password: migPassword,
        selectedNombre,
      });
      setMigIsExistingUser(!!result.existingUser);
      setMigrateStep("success");
    } catch (err: any) {
      setMigrateError(err.message || messages.migracion.error);
      setMigrateStep("form");
    }
  };

  const resetMigrateForm = () => {
    setShowMigrateForm(false);
    setMigrateStep("form");
    setMigrateMatches([]);
    setMigrateSelected("");
    setMigrateError("");
    setMigNombre("");
    setMigWhatsapp("");
    setMigCorreo("");
    setMigPassword("");
    setMigPasswordConfirm("");
    setMigEmailExists(false);
    setMigIsExistingUser(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
      <LoadingOverlay show={loading} message={messages.common.procesando} />
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gym-primary/20 rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow overflow-hidden">
            {gymLogo ? (
              <img src={gymLogo} alt={gymName} className="w-full h-full object-cover" />
            ) : (
              <Dumbbell className="w-8 h-8 text-gym-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-display neon-text">{gymName}</CardTitle>
          <p className="text-gym-muted text-sm">{messages.auth.loginSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="secondary" className="w-full border-gym-border hover:border-gym-primary/50 hover:shadow-[0_0_15px_rgba(56,189,248,0.2)]" onClick={handleGoogleLogin} disabled={loading}>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {messages.auth.loginWithGoogle}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gym-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-2 bg-gym-surface text-gym-muted">{messages.auth.or}</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-3">
            <Input type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordInput placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => { resetMigrateForm(); setShowMigrateForm(true); }}
                className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors"
              >
                {messages.migracion.linkText}
              </button>
              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(email); }}
                className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors"
              >
                {messages.auth.forgotPassword}
              </button>
            </div>
            {error && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>}
            {success && <p className="text-sm text-gym-success text-center bg-gym-success/10 p-2 rounded-xl">{success}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              {messages.auth.loginButton}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Forgot Password Modal */}
      {showResetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <LoadingOverlay show={resetLoading} message={messages.common.procesando} />
          <Card className="w-full max-w-md border-gym-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gym-primary/20 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
                {gymLogo ? (
                  <img src={gymLogo} alt={gymName} className="w-full h-full object-cover" />
                ) : (
                  <Dumbbell className="w-6 h-6 text-gym-primary" />
                )}
              </div>
              <CardTitle className="text-lg font-display text-gym-text">
                {resetSent ? messages.auth.resetPasswordSent : messages.auth.resetPasswordTitle}
              </CardTitle>
              {!resetSent && (
                <p className="text-xs text-gym-muted mt-1">{gymName}</p>
              )}
            </CardHeader>
            <CardContent>
              {resetSent ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-gym-success/20 rounded-full flex items-center justify-center mx-auto">
                    <Mail className="w-8 h-8 text-gym-success" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gym-text font-medium">
                      {messages.auth.resetPasswordSentTo}
                    </p>
                    <p className="text-sm text-gym-primary font-semibold bg-gym-primary/10 p-2 rounded-lg">
                      {resetEmail}
                    </p>
                    <p className="text-sm text-gym-muted">
                      {messages.auth.resetPasswordSentInstructions}
                    </p>
                  </div>
                  <div className="p-3 bg-gym-bg rounded-xl">
                    <p className="text-xs text-gym-muted">
                      {messages.auth.resetPasswordSpamWarning} <strong className="text-gym-text">{gymName}</strong>.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => { setShowResetForm(false); setResetSent(false); }}
                  >
                    {messages.auth.resetPasswordCloseButton}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <p className="text-sm text-gym-muted text-center">
                    {messages.auth.resetPasswordSubtitle}
                  </p>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                  {error && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => { setShowResetForm(false); setError(""); }}
                    >
                      {messages.auth.resetPasswordCancelButton}
                    </Button>
                    <Button type="submit" className="flex-1" loading={resetLoading}>
                      {messages.auth.resetPasswordButton}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Migrate Modal */}
      {showMigrateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <LoadingOverlay show={migrateStep === "loading"} message={messages.migracion.loading} />
          <Card className="w-full max-w-md border-gym-secondary/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gym-secondary/20 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
                {gymLogo ? (
                  <img src={gymLogo} alt={gymName} className="w-full h-full object-cover" />
                ) : (
                  <Dumbbell className="w-6 h-6 text-gym-secondary" />
                )}
              </div>
              <CardTitle className="text-lg font-display text-gym-text">
                {migrateStep === "form" && messages.migracion.title}
                {migrateStep === "select" && messages.migracion.selectTitle}
                {migrateStep === "success" && messages.migracion.successTitle}
                {migrateStep === "error" && messages.migracion.error}
              </CardTitle>
              <p className="text-xs text-gym-muted mt-1">{gymName}</p>
            </CardHeader>
            <CardContent>
              {/* Step: Form */}
              {migrateStep === "form" && (
                <form onSubmit={handleMigrateSubmit} className="space-y-3">
                  <p className="text-sm text-gym-muted text-center mb-2">
                    {messages.migracion.subtitle}
                  </p>
                  <Input
                    label={messages.migracion.nombreCompleto}
                    placeholder="NOMBRE Y APELLIDO"
                    value={migNombre}
                    onChange={(e) => setMigNombre(e.target.value.toUpperCase())}
                    onBlur={(e) => setMigNombre(e.target.value.toUpperCase().trim())}
                    required
                  />
                  <Input
                    label={messages.migracion.whatsapp}
                    placeholder="+52 55 1234 5678"
                    value={migWhatsapp}
                    onChange={(e) => setMigWhatsapp(e.target.value)}
                    required
                  />
                  <div>
                    <Input
                      label={messages.migracion.correo}
                      type="email"
                      placeholder="tu@email.com"
                      value={migCorreo}
                      onChange={(e) => { setMigCorreo(e.target.value); setMigEmailExists(false); }}
                      onBlur={handleEmailBlur}
                      required
                    />
                    {migEmailExists && (
                      <p className="text-xs text-gym-warning mt-1">{messages.migracion.emailExistsInfo}</p>
                    )}
                  </div>
                  <PasswordInput
                    label={messages.migracion.password}
                    placeholder="••••••••"
                    value={migPassword}
                    onChange={(e) => setMigPassword(e.target.value)}
                    required
                  />
                  <PasswordInput
                    label={messages.migracion.passwordConfirm}
                    placeholder="••••••••"
                    value={migPasswordConfirm}
                    onChange={(e) => setMigPasswordConfirm(e.target.value)}
                    error={migPasswordConfirm && migPassword !== migPasswordConfirm ? messages.migracion.passwordMismatchError : undefined}
                    required
                  />
                  {migrateError && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{migrateError}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={resetMigrateForm}
                    >
                      {messages.migracion.cancelButton}
                    </Button>
                    <Button type="submit" className="flex-1">
                      {messages.migracion.button}
                    </Button>
                  </div>
                </form>
              )}

              {/* Step: Select match */}
              {migrateStep === "select" && (
                <div className="space-y-4">
                  <p className="text-sm text-gym-muted text-center">
                    {messages.migracion.selectSubtitle}
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {migrateMatches.map((name) => (
                      <label
                        key={name}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          migrateSelected === name
                            ? "border-gym-secondary bg-gym-secondary/10"
                            : "border-gym-border hover:border-gym-secondary/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="migrateMatch"
                          value={name}
                          checked={migrateSelected === name}
                          onChange={() => setMigrateSelected(name)}
                          className="w-4 h-4 text-gym-secondary"
                        />
                        <span className="text-sm font-medium text-gym-text">{name}</span>
                      </label>
                    ))}
                  </div>
                  {migrateError && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{migrateError}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => { setMigrateStep("form"); setMigrateError(""); }}
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" /> {messages.migracion.cancelButton}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleSelectMatch}
                      disabled={!migrateSelected}
                    >
                      {messages.migracion.selectButton}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: Success */}
              {migrateStep === "success" && (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-gym-success/20 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-gym-success" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gym-text font-medium">
                      {migIsExistingUser ? messages.migracion.existingUserMessage : messages.migracion.successMessage}
                    </p>
                    <p className="text-sm text-gym-primary font-semibold bg-gym-primary/10 p-2 rounded-lg">
                      {migCorreo}
                    </p>
                    <p className="text-xs text-gym-muted">
                      {migIsExistingUser ? messages.migracion.existingUserNote : messages.migracion.successCredentials}
                    </p>
                    {!migIsExistingUser && (
                      <p className="text-xs text-gym-muted">
                        {messages.migracion.successNote}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={resetMigrateForm}
                  >
                    {messages.migracion.goToLogin}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <AuthFooter />
    </div>
  );
}
