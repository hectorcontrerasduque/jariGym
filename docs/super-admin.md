# Super Admin (Dueño) — Gold Identity (referencia)

Detalle visual completo. El resumen vive en `AGENTS.md`.

The gym owner (`super_admin` role) has distinct gold neon visual effects:
- **CSS**: `neon-gold` (gold text-shadow), `neon-admin-ring` (animated gold gradient ring around avatar), `admin-welcome-banner` (animated gold gradient background)
- **Sidebar**: Avatar with gold glow ring, gym logo with gold background `bg-gradient-to-br from-yellow-500/30 to-amber-600/30`, name in gold text
- **Dashboard**: Welcome banner "Bienvenido, Administrador" with crown emoji, floating gold particles (auto-fades at 5s)
- **Access**: Can report payments, approve them, manage all members and config

Detection in code:
```tsx
const isSuperAdmin = profile?.role === "super_admin";
// Sidebar, dashboard, etc. use this to apply gold effects
```
