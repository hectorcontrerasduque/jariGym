# Design

## Context

Ver proposal.md (Why). Hoy `PagosService` resuelve el cliente así:

- Campo de instancia `private supabase = createClient()` → `createBrowserClient(url, anonKey)`. Se evalúa al construir la instancia, y la instancia `pagosService` se construye al importar el módulo, también en rutas API del servidor.
- Métodos de lectura: `const supabase = supabaseClient || this.supabase`.
- Métodos de escritura y `aprobarPago`/`rechazarPago`: siempre `this.supabase`.

En el navegador, `createBrowserClient` de `@supabase/ssr` devuelve un singleton, así que da igual cuándo se crea. En el servidor, las rutas (`api/notificaciones/*`) siempre pasan su cliente `service_role` a los métodos que usan, por lo que el cliente de navegador creado al importar nunca se usa ahí.

La única prueba real existente (`morosos.test.ts`) funciona con `vi.mock("@/lib/supabase/client")` y solo necesita `rpc`, porque le pasa `elegibles` ya calculados.

## Goals / Non-Goals

**Goals:**
- Poder construir `PagosService` con cualquier cliente (real, `service_role` o falso) sin mockear módulos.
- Un doble de prueba reutilizable del cliente Supabase que también sirva para las fases siguientes (transacciones, RPC de estadísticas, notificaciones).
- Demostrar la equivalencia de comportamiento: los tests de caracterización se escriben y pasan **antes** de tocar el servicio, y siguen pasando **después** sin modificarse.

**Non-Goals:**
- Cambiar las consultas, su orden o su cantidad.
- Migrar los llamadores a instancias inyectadas; siguen usando `pagosService` y el parámetro `supabaseClient`.
- Tests contra un Postgres real (RLS): son la fase `rls-tests`.

## Decisions

### D1. Inyección por constructor con cliente por defecto perezoso

```ts
type SupabaseLike = ReturnType<typeof createClient>;

export class PagosService {
  private client?: SupabaseLike;
  constructor(client?: SupabaseLike) { this.client = client; }
  private get supabase(): SupabaseLike {
    return (this.client ??= createClient());
  }
}
```

- Todos los usos de `this.supabase` siguen igual; solo cambia la forma de resolverlo.
- **Perezoso vs. inmediato**: al ser perezoso, importar el módulo en el servidor ya no crea un cliente de navegador que no se usa. En el navegador el resultado es el mismo singleton. Ningún camino de código observable cambia.
- **Alternativa descartada: factory `createPagosService(client)` sin clase.** Obligaría a cambiar todos los llamadores y los tipos exportados, fuera del alcance de un refactor sin cambios de comportamiento.
- **Alternativa descartada: seguir con `vi.mock` del módulo.** Funciona, pero acopla cada test a la ruta interna de importación y no permite dos instancias con clientes distintos en el mismo test.

### D2. Doble de prueba escrito a mano, no una librería

`__tests__/helpers/supabase-fake.ts` expone `createSupabaseFake()`, que devuelve `{ client, calls, on }`:

- `client.from(table)` devuelve un query builder encadenable que registra cada método (`select`, `insert`, `update`, `delete`, `eq`, `in`, `is`, `not`, `order`, `limit`, `single`, `maybeSingle`) y es *thenable*: al hacer `await` resuelve la respuesta programada.
- Las respuestas se programan por `(tabla, operación)` con `on("payments", "insert").reply({ data, error })`, en cola FIFO, para soportar varias llamadas iguales en un mismo método (por ejemplo, el bucle de `crearPagoSuspendido`).
- `client.rpc(name, args)` y `client.auth.getUser()` se programan igual.
- `calls` permite verificar la secuencia de operaciones y los filtros aplicados, que es parte del comportamiento (por ejemplo, que `rechazarPago` filtre por `status = pendiente`).
- **Alternativa descartada: `supabase-js` real contra `supabase start` local.** Es más fiel, pero lento y requiere Docker; se reserva para la fase `rls-tests`.
- **Alternativa descartada: librerías de mock de Supabase de terceros.** Añaden una dependencia para un problema pequeño y no cubren bien los filtros sobre relaciones (`payments.user_id`) que usa este servicio.

### D3. Orden: caracterizar primero, refactorizar después

1. Crear el doble y los tests nuevos usando el patrón actual (`vi.mock("@/lib/supabase/client")` hace que `createClient()` devuelva el cliente falso). Deben pasar contra el código **sin modificar**.
2. Aplicar D1.
3. Cambiar los tests para inyectar por constructor. Las aserciones no cambian; si alguna falla, el refactor alteró el comportamiento y se corrige el servicio, no el test.

### D4. Tiempo y zonas horarias

Varias reglas dependen de "hoy" (mes tope, día de cobro, fecha de inscripción con `toISOString()` en UTC). Los tests usan `vi.useFakeTimers()` + `vi.setSystemTime()` con horas del mediodía local (por ejemplo `new Date(2026, 8, 12, 12)`) para que la fecha local y la UTC coincidan en cualquier zona razonable.

## Risks / Trade-offs

- [El doble no reproduce la semántica real de PostgREST: filtros sobre relaciones con `!inner`, `.single()` con 0 filas] → Los tests verifican qué consultas se construyen y cómo el servicio interpreta respuestas dadas, no la semántica de la base. La semántica real se valida en `rls-tests`.
- [Los tests de caracterización fijan también las particularidades listadas en proposal.md (Non-goals)] → Es intencional. Cada test de ese tipo lleva un comentario `// Comportamiento actual preservado:` para que, si luego se decide corregirlo, sea un cambio explícito con su propio change de OpenSpec.
- [El getter perezoso cambia el momento en que se crea el cliente] → En el navegador es un singleton; en el servidor el cliente de navegador nunca se usa (ver Context). Se cubre con un test que construye el servicio sin cliente y verifica que `createClient` no se llama hasta el primer uso.

## Migration Plan

No hay migración de datos ni despliegue especial. El rollback es revertir los commits del change.
