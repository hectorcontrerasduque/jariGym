#!/usr/bin/env node
/**
 * Local Supabase for development and testing (Docker required). Never touches the cloud.
 *
 *   npm run db:local:start   start the local stack (first run downloads images)
 *   npm run db:local:reset   wipe + schema + seed data, and write .env.development.local
 *   npm run db:local:stop    stop the local stack (data is kept until next reset)
 *
 * Reset order:
 *   supabase/local/000_*.sql   tables that exist in the real DB but have no committed migration
 *   supabase/migrations/*.sql  committed migrations, in filename order
 *   supabase/local/001_*.sql   functions that exist in the real DB but have no committed migration
 *   seed (below)               deterministic demo data: 80 members, payments for last and current year
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_CONTAINER = "supabase_db_jariGym";
const EXCLUDED_SERVICES = "vector,logflare,imgproxy,realtime,supavisor,edge-runtime";
const SEED_PASSWORD = "Local1234!";
const ADMIN_EMAIL = "admin@gym.local";
const MIEMBRO_EMAIL = "miembro@gym.local";

// Docker Desktop on macOS does not always put its CLI on PATH.
const MAC_DOCKER_BIN = "/Applications/Docker.app/Contents/Resources/bin";
const env = { ...process.env };
if (existsSync(MAC_DOCKER_BIN)) env.PATH = `${MAC_DOCKER_BIN}:${env.PATH}`;

const isWindows = process.platform === "win32";
const run = (cmd, args, opts = {}) =>
  execFileSync(isWindows && cmd === "npx" ? "npx.cmd" : cmd, args, { cwd: ROOT, env, stdio: "inherit", shell: isWindows, ...opts });

function supabase(args, opts) {
  return run("npx", ["supabase", ...args], opts);
}

function status() {
  const out = supabase(["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  return JSON.parse(out.slice(out.indexOf("{")));
}

function psqlFile(file) {
  const res = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the repo SQL folders
    input: readFileSync(file),
    env,
    shell: isWindows,
  });
  if (res.status !== 0) {
    throw new Error(`SQL failed in ${file}:\n${res.stderr.toString()}`);
  }
}

function sqlFiles(dir, filter = () => true) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is a repo-relative constant
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".sql") && filter(f))
    .sort()
    .map((f) => join(ROOT, dir, f));
}

// ─── Seed ──────────────────────────────────────────────────────────────────────

/** Small deterministic PRNG so every reset produces the same data. */
function prng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = ["Ana", "Luis", "María", "José", "Carla", "Pedro", "Lucía", "Andrés", "Sofía", "Diego", "Valentina", "Jorge", "Camila", "Miguel", "Daniela", "Carlos", "Paola", "Ricardo", "Elena", "Fernando"];
const APELLIDOS = ["García", "Pérez", "Rodríguez", "González", "Hernández", "López", "Martínez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivas", "Castillo", "Mendoza", "Rojas"];

async function seed({ apiUrl, serviceRoleKey }) {
  const db = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });
  const rand = prng(20260924);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  const fecha = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = ({ error }, what) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  async function crearUsuario(email, fullName) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    return data.user.id;
  }

  // Owner / super_admin
  const adminId = await crearUsuario(ADMIN_EMAIL, "Dueño Local");
  check(await db.from("profiles").update({ role: "super_admin", registered: true, inscription_paid: true, start_date: fecha(anio - 1, 1, 1) }).eq("id", adminId), "admin profile");

  check(await db.from("gym_config").insert({
    gym_name: "Gym Local",
    owner_name: "Dueño Local",
    owner_email: ADMIN_EMAIL,
    contact_email: ADMIN_EMAIL,
    max_members: 80,
    billing_mode: "dia_uno",
    notifications_enabled: false,
    address: "Calle Falsa 123",
    schedule: "Lun-Vie 6:00-22:00",
  }), "gym_config");

  check(await db.from("gym_config_payment_methods").insert([
    { payment_method: "efectivo", amount_monthly: 25, amount_inscription: 40, is_active: true },
    { payment_method: "bs", amount_monthly: 25, amount_inscription: 40, is_active: false },
    { payment_method: "binance", amount_monthly: 25, amount_inscription: 40, is_active: false },
  ]), "payment methods");

  // 79 members: miembro@gym.local + socio01..socio78
  const perfiles = [];
  for (let i = 0; i < 79; i++) {
    const email = i === 0 ? MIEMBRO_EMAIL : `socio${String(i).padStart(2, "0")}@gym.local`;
    const fullName = i === 0 ? "Miembro Demo" : `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
    const id = await crearUsuario(email, fullName);

    // Start between January last year and this month
    const offset = Math.floor(rand() * (12 + mesActual));
    const startY = offset < 12 ? anio - 1 : anio;
    const startM = offset < 12 ? offset + 1 : offset - 11;
    const r = rand();
    const perfilTipo =
      i === 0 ? "al_dia" : r < 0.55 ? "al_dia" : r < 0.8 ? "atrasado" : r < 0.9 ? "pendiente" : r < 0.95 ? "libre" : "inactivo";
    const inscriptionPaid = rand() < 0.9;
    const hora = 6 + Math.floor(rand() * 13);

    perfiles.push({ id, email, startY, startM, perfilTipo, inscriptionPaid });
    check(await db.from("profiles").update({
      registered: true,
      activo: perfilTipo !== "inactivo",
      start_date: fecha(startY, startM, 1 + Math.floor(rand() * 28)),
      inscription_paid: inscriptionPaid,
      inscription_date: inscriptionPaid ? fecha(startY, startM, 1) : null,
      arrival_time: `${String(hora).padStart(2, "0")}:00`,
      departure_time: `${String(hora + 1 + Math.floor(rand() * 2)).padStart(2, "0")}:00`,
      phone_number: `0414${String(1000000 + Math.floor(rand() * 8999999))}`,
    }).eq("id", id), `profile ${email}`);
  }

  // Memberships: "libre" members get an open active membership
  const libres = perfiles.filter((p) => p.perfilTipo === "libre");
  if (libres.length) {
    check(await db.from("memberships").insert(libres.map((p) => ({
      user_id: p.id, status: "activa", start_date: fecha(p.startY, p.startM, 1), end_date: null, assigned_by: adminId, membership_note: "Membresía libre (seed)",
    }))), "memberships");
  }

  // Payments: one header per payment, one detail line per month / inscription
  const headers = [];
  const details = [];
  const addPago = (userId, status, lineas, createdAt) => {
    const id = crypto.randomUUID();
    headers.push({
      id, user_id: userId, status, payment_method: pick(["efectivo", "efectivo", "bs", "binance"]),
      created_by: status === "pendiente" ? userId : adminId,
      approved_by: status === "aprobado" ? adminId : null,
      approved_at: status === "aprobado" ? createdAt : null,
      created_at: createdAt,
      payment_note: lineas.some((l) => l.payment_type === "suspension") ? "Viaje (seed)" : null,
    });
    for (const l of lineas) details.push({ payment_id: id, ...l });
  };

  for (const p of perfiles) {
    if (p.perfilTipo === "libre" || p.perfilTipo === "inactivo") continue;
    if (p.inscriptionPaid) {
      addPago(p.id, "aprobado", [{ month_number: null, year_number: p.startY, payment_type: "inscripcion", payment_amount: 40 }], `${fecha(p.startY, p.startM, 2)}T15:00:00Z`);
    }
    // Months from start to current month; "atrasado" skips the last 1-3, "pendiente" leaves the last one pending
    const meses = [];
    for (let y = p.startY; y <= anio; y++) {
      for (let m = y === p.startY ? p.startM : 1; m <= (y === anio ? mesActual : 12); m++) meses.push([y, m]);
    }
    const atraso = p.perfilTipo === "atrasado" ? 1 + Math.floor(rand() * 3) : 0;
    meses.slice(0, meses.length - atraso).forEach(([y, m], idx, arr) => {
      const esUltimo = idx === arr.length - 1;
      const tipo = rand() < 0.04 ? "suspension" : "mensualidad";
      const status = p.perfilTipo === "pendiente" && esUltimo ? "pendiente" : rand() < 0.03 ? "rechazado" : "aprobado";
      addPago(p.id, status, [{ month_number: m, year_number: y, payment_type: tipo, payment_amount: tipo === "suspension" ? 0 : 25 }], `${fecha(y, m, 1 + Math.floor(rand() * 5))}T14:00:00Z`);
    });
  }
  // A rejected payment is not a payment: re-add an approved one for the same month so history looks real
  for (const h of headers.filter((x) => x.status === "rechazado")) {
    const d = details.find((x) => x.payment_id === h.id);
    const linea = { month_number: d.month_number, year_number: d.year_number, payment_type: d.payment_type, payment_amount: d.payment_amount };
    addPago(h.user_id, "aprobado", [linea], h.created_at);
  }

  for (let i = 0; i < headers.length; i += 500) check(await db.from("payments").insert(headers.slice(i, i + 500)), "payments");
  for (let i = 0; i < details.length; i += 500) check(await db.from("payment_detail").insert(details.slice(i, i + 500)), "payment_detail");

  // Legacy Excel members (migracion) for the "Ya soy miembro" flow and the morosos report
  const migracion = [];
  for (let i = 0; i < 6; i++) {
    const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)}`.toUpperCase();
    for (let m = 1; m <= mesActual; m++) {
      migracion.push({ nombre, correo: i < 3 ? `legado${i}@gym.local` : null, mes_pagar: m, anio_pagar: anio, estado: i % 2 === 0 && m > mesActual - 4 ? "debe" : "pagado", migrado: "no" });
    }
  }
  check(await db.from("migracion").insert(migracion), "migracion");

  return { miembros: perfiles.length + 1, pagos: headers.length, lineas: details.length, migracion: migracion.length };
}

function writeEnv({ apiUrl, anonKey, serviceRoleKey }) {
  const file = join(ROOT, ".env.development.local");
  writeFileSync(file, [
    "# Generated by `npm run db:local:reset` — points `npm run dev` at the LOCAL Supabase.",
    "# Delete this file to go back to .env.development (cloud dev project).",
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
    `NEXT_PUBLIC_ADMIN_EMAIL=${ADMIN_EMAIL}`,
    "",
  ].join("\n"));
  return file;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const cmd = process.argv[2] || "reset";

if (cmd === "start") {
  supabase(["start", "-x", EXCLUDED_SERVICES]);
} else if (cmd === "stop") {
  supabase(["stop"]);
} else if (cmd === "reset") {
  console.log("› Resetting local database…");
  supabase(["db", "reset", "--local"]);

  const files = [
    ...sqlFiles("supabase/local", (f) => f.startsWith("000_")),
    ...sqlFiles("supabase/migrations"),
    ...sqlFiles("supabase/local", (f) => !f.startsWith("000_")),
  ];
  for (const f of files) psqlFile(f);
  console.log(`› Applied ${files.length} SQL files`);

  // PostgREST caches the schema; reload it so the new tables/functions are visible.
  spawnSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-c", "NOTIFY pgrst, 'reload schema'"], { env, shell: isWindows });

  const s = status();
  const cfg = { apiUrl: s.API_URL, anonKey: s.ANON_KEY, serviceRoleKey: s.SERVICE_ROLE_KEY };
  const resumen = await seed(cfg);
  const envFile = writeEnv(cfg);

  console.log(`› Seed: ${resumen.miembros} usuarios, ${resumen.pagos} pagos (${resumen.lineas} líneas), ${resumen.migracion} filas de migración`);
  console.log(`› Wrote ${envFile}`);
  console.log(`\n  Admin:   ${ADMIN_EMAIL} / ${SEED_PASSWORD}\n  Miembro: ${MIEMBRO_EMAIL} / ${SEED_PASSWORD}\n  Studio:  ${s.STUDIO_URL}\n`);
} else {
  console.error(`Unknown command "${cmd}". Use start | reset | stop.`);
  process.exit(1);
}
