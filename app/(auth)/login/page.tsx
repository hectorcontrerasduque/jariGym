"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Modal } from "@/components/ui/modal";
import { Loader } from "@/components/ui/loader";
import { authService } from "@/lib/services/auth/auth.service";
import { migracionService, type MigracionRecord } from "@/lib/services/migracion/migracion.service";
import { createClient } from "@/lib/supabase/client";
import { Dumbbell, CheckCircle, Mail, Zap } from "lucide-react";

import { messages } from "@/lib/messages";
import { showToast } from "@/components/ui/toast";
import Link from "next/link";

const particleCount = 10;

function generateParticles() {
  return Array.from({ length: particleCount }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 6,
    duration: 4 + Math.random() * 4,
    size: 2 + Math.random() * 3,
    colorIndex: Math.floor(Math.random() * 3),
  }));
}

const particles = generateParticles();

function FloatingParticles() {
  return (
    <div className="particles-container">
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.colorIndex === 0 ? "rgba(56, 189, 248, 0.25)" : p.colorIndex === 1 ? "rgba(129, 140, 248, 0.15)" : "rgba(52, 211, 153, 0.15)",
          }}
        />
      ))}
    </div>
  );
}

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
  const [resetSent, setResetSent] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [gymName, setGymName] = useState("GymApp");
  const [gymOwnerEmail, setGymOwnerEmail] = useState("");
  const [gymLogo, setGymLogo] = useState("");

  const [showMigrateForm, setShowMigrateForm] = useState(false);
  const [migrateStep, setMigrateStep] = useState<"form" | "success" | "loading">("form");
  const [selectedNombre, setSelectedNombre] = useState<string | null>(null);
  const [migNombre, setMigNombre] = useState("");
  const [migWhatsapp, setMigWhatsapp] = useState("");
  const [migCorreo, setMigCorreo] = useState("");
  const [migPassword, setMigPassword] = useState("");
  const [migPasswordConfirm, setMigPasswordConfirm] = useState("");
  const [migEmailExists, setMigEmailExists] = useState(false);
  const [migEmailStatus, setMigEmailStatus] = useState<"idle" | "checking" | "valid" | "exists" | "invalid">("idle");
  const [hasPendingMigration, setHasPendingMigration] = useState(true);
  const [migIsExistingUser, setMigIsExistingUser] = useState(false);
  const [migWelcomeEmailSent, setMigWelcomeEmailSent] = useState(true);
  const [allRecords, setAllRecords] = useState<MigracionRecord[]>([]);

  // Computed: filter records client-side (no DB query, just filters allRecords)
  const searchResults = useMemo(() => {
    if (selectedNombre || migNombre.length < 2) return [];
    const query = migNombre.trim().toUpperCase();
    const words = query.split(/\s+/).filter((w) => w.length >= 1);
    return allRecords
      .filter((r) => r.migrado !== "si" && words.some((w) => r.nombre.toUpperCase().includes(w)))
      .map((r) => r.nombre);
  }, [migNombre, selectedNombre, allRecords]);

  const showDropdown = !selectedNombre && migNombre.length >= 2;

  // Initialize state from searchParams using useMemo to avoid useEffect
  const initialError = useMemo(() => {
    let err = searchParams.get("error");
    if (!err && typeof window !== "undefined" && window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.substring(1));
      err = hash.get("error_description") || hash.get("error");
      if (err) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    return err ? decodeURIComponent(err) : "";
  }, [searchParams]);

  // Handle URL params and hash errors - run once on mount
  useEffect(() => {
    // Handle confirmation token as query param — redirect to confirm-email route
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      router.push(`/api/auth/confirm-email?token=${tokenParam}`);
      return;
    }

    if (initialError) {
      showToast(initialError, "error");
    }

    fetch("/api/config/public")
      .then((res) => res.json())
      .then(({ config }) => {
        if (config?.gym_name) setGymName(config.gym_name);
        if (config?.owner_email) setGymOwnerEmail(config.owner_email);
        if (config?.logo_url) setGymLogo(config.logo_url);
      })
      .catch(() => {});

    // Check if there are pending migration records
    fetch("/api/migracion/pending")
      .then((res) => res.json())
      .then(({ pending }) => setHasPendingMigration(pending))
      .catch(() => setHasPendingMigration(false));
  }, [router, searchParams, initialError]); // Run once on mount

  // Handle browser back button to close migration modal
  useEffect(() => {
    if (!showMigrateForm) return;
    const handlePopState = () => {
      setShowMigrateForm(false);
      setMigrateStep("form");
    };
    window.history.pushState({ modal: "migrate" }, "");
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [showMigrateForm]);

  // Load all migration records when modal opens
  useEffect(() => {
    if (!showMigrateForm) return;
    migracionService.listAll()
      .then((records) => setAllRecords(records))
      .catch(() => showToast(messages.migracion.error, "error"));
  }, [showMigrateForm]);

  // Debounced email validation + auto-fill from migracion
  useEffect(() => {
    if (!migCorreo || migCorreo.length < 5) {
      setMigEmailStatus("idle"); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(migCorreo)) {
      setMigEmailStatus("invalid");
      return;
    }
    setMigEmailStatus("checking");
    const timeout = setTimeout(async () => {
      try {
        const result = await migracionService.pingEmail(migCorreo);
        if (result.alreadyMigrated) {
          setMigEmailStatus("exists");
          setMigEmailExists(true);
        } else if (result.exists) {
          setMigEmailStatus("exists");
          setMigEmailExists(true);
        } else {
          const query = migCorreo.toLowerCase().trim();
          const match = allRecords.find((r) =>
            r.correos.some((c) => c.toLowerCase() === query) && r.migrado === "no"
          );
          if (match) {
            setMigNombre(match.nombre);
            setSelectedNombre(match.nombre);
          }
          setMigEmailStatus("valid");
          setMigEmailExists(false);
        }
      } catch {
        setMigEmailStatus("valid");
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [migCorreo, allRecords]);

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
          body: JSON.stringify({ email: userEmail, inscription_paid: true }),
        });
        const { data: retry } = await supabase
          .from("profiles")
          .select("role, activo, registered")
          .eq("id", userId)
          .single();
        if (retry) profile = retry;
      } catch {
        // Non-critical: retry failed, continue with existing profile
      }
    }

    if (!profile) return false;
    if (profile.role === "super_admin") {
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
    try {
      await authService.signInWithGoogle();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : messages.auth.googleLoginError, "error");
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

  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authService.signInWithEmail(email, password);
      const userId = result.user?.id;
      if (userId) {
        const authorized = await isAuthorizedUser(result.user?.email || "", userId);
        if (!authorized) {
          const supabase = createClient();
          await supabase.auth.signOut();
          showToast(messages.auth.userNotRegistered, "error");
          setLoading(false);
          return;
        }
        const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
        const isAdmin = (adminEmail && result.user?.email === adminEmail) ||
          (result.user?.email === gymOwnerEmail);
        router.push(isAdmin ? "/dashboard" : "/dashboard/mis-pagos");
      }
    } catch (err) {
      showToast(mapAuthError(err instanceof Error ? err.message : String(err)), "error");
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResetLoading(true);
    try {
      await authService.resetPassword(resetEmail);
      setResetSent(true);
    } catch {
      showToast(messages.auth.resetPasswordError, "error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleMigrateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!migNombre.trim() || migNombre.trim().split(" ").length < 2) {
      showToast(messages.migracion.nombreRequerido, "error");
      return;
    }
    if (!selectedNombre) {
      showToast(messages.migracion.seleccioneNombre, "error");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(migCorreo)) {
      showToast(messages.migracion.correoFormatoInvalido, "error");
      return;
    }
    const isGmail = migCorreo.toLowerCase().endsWith("@gmail.com");
    if (!isGmail) {
      if (!migPassword || migPassword.length < 6) {
        showToast(messages.migracion.passwordMinError, "error");
        return;
      }
      if (migPassword !== migPasswordConfirm) {
        showToast(messages.migracion.passwordMismatchError, "error");
        return;
      }
    } else if (migPassword || migPasswordConfirm) {
      if (!migPassword || migPassword.length < 6) {
        showToast(messages.migracion.passwordMinError, "error");
        return;
      }
      if (migPassword !== migPasswordConfirm) {
        showToast(messages.migracion.passwordMismatchError, "error");
        return;
      }
    }

    // Check if email already migrated before proceeding
    try {
      const pingResult = await migracionService.pingEmail(migCorreo);
      if (pingResult.alreadyMigrated) {
        const nombre = pingResult.nombre || migCorreo;
        showToast(messages.migracion.correoYaMigrado(nombre), "error");
        return;
      }
    } catch {
      // Non-critical: ping errors ignored, proceed with migration
    }

    await executeMigracion(selectedNombre);
  };

  const executeMigracion = async (selectedNombre: string) => {
    setMigrateStep("loading");
    try {
      const isGmail = migCorreo.toLowerCase().endsWith("@gmail.com");
      const finalPassword = (!migPassword && isGmail)
        ? Math.random().toString(36).slice(-8) + "A1"
        : migPassword;
      const result = await migracionService.migrate({
        nombreCompleto: migNombre,
        phone_number: migWhatsapp,
        correo: migCorreo,
        password: finalPassword,
        selectedNombre,
      });
      setMigIsExistingUser(!!result.existingUser);
      setMigWelcomeEmailSent(result.welcomeEmailSent !== false);
      setMigrateStep("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : messages.migracion.error;
      showToast(msg, "error");
      setMigrateStep("form");
    }
  };

  const resetMigrateForm = () => {
    setShowMigrateForm(false);
    setMigrateStep("form");
    setSelectedNombre(null);
    setMigNombre("");
    setMigWhatsapp("");
    setMigCorreo("");
    setMigPassword("");
    setMigPasswordConfirm("");
    setMigEmailExists(false);
    setMigEmailStatus("idle");
    setMigIsExistingUser(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pb-16 relative overflow-hidden">
      <Loader show={loading} message={messages.common.procesando} variant="overlay" />
      <FloatingParticles />
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-[15%] right-[10%] w-64 h-64 bg-gym-success/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)] animate-slideUp">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gym-primary/20 rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow overflow-hidden">
            {gymLogo ? (
              <Image
                src={gymLogo}
                alt={gymName}
                width={64}
                height={64}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Dumbbell className="w-8 h-8 text-gym-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-display neon-text">{gymName}</CardTitle>
          <p className="text-gym-muted text-sm">{messages.auth.loginSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="secondary" className="w-full border-gym-border hover:border-gym-primary/50 hover:shadow-[0_0_15px_rgba(56,189,248,0.2)] transition-all duration-300" onClick={handleGoogleLogin} disabled={loading} loading={loading}>
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
            <Input id="email" name="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordInput id="password" name="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div className="flex justify-between items-center">
              {hasPendingMigration && (
                <button
                  type="button"
                  onClick={() => { resetMigrateForm(); setShowMigrateForm(true); }}
                  className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors"
                >
                  {messages.migracion.linkText}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(email); }}
                className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors"
              >
                {messages.auth.forgotPassword}
              </button>
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              <Zap className="w-4 h-4 mr-2" />
              {messages.auth.loginButton}
            </Button>
          </form>
        </CardContent>
        <div className="px-6 pb-5 text-center">
          <Link href="/" className="text-sm text-gym-primary/70 hover:text-gym-primary transition-colors">
            hcontrer.org
          </Link>
        </div>
      </Card>

      {/* Forgot Password Modal */}
      <Modal isOpen={showResetForm} onClose={() => { setShowResetForm(false); setResetSent(false); }} className="max-w-md border-gym-primary/20">
        <Loader show={resetLoading} message={messages.common.procesando} variant="overlay" />
        <div className="text-center mb-4">
          <div className="mx-auto w-12 h-12 bg-gym-primary/20 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
            {gymLogo ? (
              <Image
                src={gymLogo}
                alt={gymName}
                width={48}
                height={48}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Dumbbell className="w-6 h-6 text-gym-primary" />
            )}
          </div>
          <h2 className="text-lg font-display font-semibold text-gym-text">
            {resetSent ? messages.auth.resetPasswordSent : messages.auth.resetPasswordTitle}
          </h2>
          {!resetSent && (
            <p className="text-xs text-gym-muted mt-1">{gymName}</p>
          )}
        </div>
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
              id="reset-email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => { setShowResetForm(false); }}
              >
                {messages.auth.resetPasswordCancelButton}
              </Button>
              <Button type="submit" className="flex-1" loading={resetLoading}>
                {messages.auth.resetPasswordButton}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Migrate Modal */}
      <Modal isOpen={showMigrateForm} onClose={resetMigrateForm} className="max-w-md border-gym-secondary/20">
        <Loader show={migrateStep === "loading"} message={messages.migracion.loading} variant="overlay" />
        <div className="max-h-[80vh] overflow-y-auto">
          <div className="text-center mb-4">
            <div className="mx-auto w-12 h-12 bg-gym-secondary/20 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
              {gymLogo ? (
                <Image
                  src={gymLogo}
                  alt={gymName}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Dumbbell className="w-6 h-6 text-gym-secondary" />
              )}
            </div>
            <h2 className="text-lg font-display font-semibold text-gym-text">
              {migrateStep === "form" && messages.migracion.title}
              {migrateStep === "success" && messages.migracion.successTitle}
            </h2>
            <p className="text-xs text-gym-muted mt-1">{gymName}</p>
          </div>
              {/* Step: Form */}
              {migrateStep === "form" && (
                <form onSubmit={handleMigrateSubmit} className="space-y-3">
                  <p className="text-sm text-gym-muted text-center mb-2">
                    {messages.migracion.subtitle}
                  </p>
                  <div className="relative">
                    <Input
                      label={messages.migracion.fullName}
                      placeholder={messages.migracion.nombrePlaceholder}
                      value={migNombre}
                      onChange={(e) => {
                        setMigNombre(e.target.value.toUpperCase());
                        setSelectedNombre(null);
                      }}
                      suffix={selectedNombre ? <span className="text-gym-success">✓</span> : undefined}
                      required
                    />
                    {showDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-gym-border border border-gym-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {searchResults.length === 0 && (
                          <p className="p-2 text-center text-gym-muted text-xs">{messages.migracion.nombreNoEncontrado}</p>
                        )}
                        {searchResults.map((name) => {
                          const record = allRecords.find((r) => r.nombre === name);
                          return (
                            <button
                              key={name}
                              type="button"
                              className="w-full text-left px-4 py-2.5 text-sm text-gym-text hover:bg-gym-primary/10 transition-colors first:rounded-t-xl last:rounded-b-xl"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setMigNombre(name);
                                setSelectedNombre(name);
                                if (record && record.correos.length > 0) {
                                  setMigCorreo(record.correos[0]);
                                }
                              }}
                            >
                              <span className="block truncate">{name}</span>
                              {record && record.correos.length > 0 && (
                                <span className="block text-[10px] text-gym-muted">{record.correos[0]}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {selectedNombre && (
                    <p className="text-xs text-gym-success flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {messages.migracion.registroSeleccionado} {selectedNombre}
                    </p>
                  )}
                  <div>
                    <Input
                      label={messages.migracion.correo}
                      type="email"
                      placeholder="tu@gmail.com"
                      value={migCorreo}
                      onChange={(e) => { setMigCorreo(e.target.value); }}
                      suffix={
                        migEmailStatus === "checking" ? <span className="text-gym-muted animate-pulse">⏳</span> :
                        migEmailStatus === "valid" ? <span className="text-gym-success">✓</span> :
                        migEmailStatus === "exists" ? <span className="text-gym-warning">⚠</span> :
                        migEmailStatus === "invalid" ? <span className="text-gym-danger">✗</span> :
                        undefined
                      }
                      required
                    />
                    {migEmailStatus === "exists" && migEmailExists && (
                      <p className="text-xs text-gym-muted mt-1">{messages.migracion.emailExistsInfo}</p>
                    )}
                    {migEmailStatus === "invalid" && migCorreo.length >= 5 && (
                      <p className="text-xs text-gym-danger mt-1">{messages.migracion.emailInvalidError}</p>
                    )}
                  </div>
                    <Input
                      label={messages.migracion.phoneNumber}
                      placeholder="+584261234567"
                      value={migWhatsapp}
                      onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ""); setMigWhatsapp(val); }}
                    />
                  <PasswordInput
                    label={messages.migracion.password + (migCorreo && migCorreo.toLowerCase().endsWith("@gmail.com") ? " (opcional)" : " *")}
                    placeholder="••••••••"
                    value={migPassword}
                    onChange={(e) => setMigPassword(e.target.value)}
                    required={!!migCorreo && !migCorreo.toLowerCase().endsWith("@gmail.com")}
                  />
                  <PasswordInput
                    label={messages.migracion.passwordConfirm + (migCorreo && migCorreo.toLowerCase().endsWith("@gmail.com") ? " (opcional)" : " *")}
                    placeholder="••••••••"
                    value={migPasswordConfirm}
                    onChange={(e) => setMigPasswordConfirm(e.target.value)}
                    error={migPasswordConfirm && migPassword !== migPasswordConfirm ? messages.migracion.passwordMismatchError : undefined}
                    required={!!migCorreo && !migCorreo.toLowerCase().endsWith("@gmail.com")}
                  />
                  <div className="sticky bottom-0 bg-gym-surface pt-3 border-t border-gym-border flex gap-2">
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
                    {!migIsExistingUser && !migWelcomeEmailSent && (
                      <p className="text-xs text-gym-danger bg-gym-danger/10 p-2 rounded-lg">
                        {messages.migracion.emailNoEnviado}
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
          </div>
      </Modal>
    </div>
  );
}
