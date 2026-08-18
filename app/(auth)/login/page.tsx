"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/lib/services/auth/auth.service";
import { createClient } from "@/lib/supabase/client";
import { Dumbbell, CheckCircle, Mail } from "lucide-react";
import { configService } from "@/lib/services/config/config.service";
import { messages } from "@/lib/messages";

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
  const [resetSent, setResetSent] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [gymName, setGymName] = useState("GymApp");
  const [gymOwnerEmail, setGymOwnerEmail] = useState("");

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(decodeURIComponent(err));
    configService.getConfig().then((config) => {
      if (config?.nombre_gym) setGymName(config.nombre_gym);
      if (config?.dueno_email) setGymOwnerEmail(config.dueno_email);
    }).catch(() => {});
  }, [searchParams]);

  const isAuthorizedUser = async (userEmail: string, userId: string): Promise<boolean> => {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (adminEmail && userEmail === adminEmail) return true;
    if (gymOwnerEmail && userEmail === gymOwnerEmail && userEmail.endsWith("@gmail.com")) return true;

    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, activo")
      .eq("id", userId)
      .single();

    if (!profile) return false;
    if (profile.role === "super_admin" || profile.role === "admin") return true;
    if (profile.activo !== false) return true;

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
          (result.user?.email === gymOwnerEmail && result.user?.email?.endsWith("@gmail.com"));
        router.push(isAdmin ? "/dashboard" : "/dashboard/mis-pagos");
      }
    } catch (err: any) {
      setError(err.message || messages.auth.emailLoginError);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <Card className="w-full max-w-md relative z-10 border-gym-primary/20 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gym-primary/20 rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow">
            <Dumbbell className="w-8 h-8 text-gym-primary" />
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
            <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(email); }}
                className="text-xs text-gym-primary hover:text-gym-primary/80 transition-colors"
              >
                {messages.auth.forgotPassword}
              </button>
            </div>
            {error && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              {messages.auth.loginButton}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Forgot Password Modal - personalized with gym branding */}
      {showResetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md border-gym-primary/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gym-primary/20 rounded-xl flex items-center justify-center mb-3">
                <Dumbbell className="w-6 h-6 text-gym-primary" />
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
                      Si no recibes el correo, revisa tu carpeta de spam o contacta al administrador de <strong className="text-gym-text">{gymName}</strong>.
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
    </div>
  );
}
