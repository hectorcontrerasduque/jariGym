export type AdminLevel = "propietario" | "tecnico" | "normal";

export function getAdminLevel(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
  adminEmail: string | null | undefined
): AdminLevel | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (ownerEmail && lower === ownerEmail.toLowerCase()) return "propietario";
  if (adminEmail && lower === adminEmail.toLowerCase()) return "tecnico";
  return "normal";
}

export function isFullAdmin(level: AdminLevel | null): boolean {
  return level === "propietario" || level === "tecnico";
}
