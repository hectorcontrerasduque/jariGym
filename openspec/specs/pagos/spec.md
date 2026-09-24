# pagos Specification

## Purpose
Define cómo el sistema calcula quién debe, quién está al día y las estadísticas de cobro del gimnasio, y cómo se crea, aprueba, rechaza y suspende un pago. Documenta el comportamiento vigente para que los refactors puedan verificarse contra él.

## Requirements

### Requirement: Miembros elegibles para cobro
El sistema SHALL considerar elegibles para cobro los perfiles con rol `miembro` o `super_admin` que tengan email y cuyo campo `activo` no sea falso (`false`, `0` o el texto `"false"`); `activo` nulo MUST tratarse como activo. Un miembro SHALL considerarse de membresía libre cuando tiene una membresía con estado `activa`, sin fecha de fin, y cuya fecha de inicio es nula o no es posterior al momento actual. Los montos mensual y de inscripción SHALL tomarse del método de pago activo y valer 0 si no existe; el modo de cobro SHALL ser `dia_uno` si no está configurado; el email del dueño SHALL compararse sin distinguir mayúsculas.

#### Scenario: Perfil con activo nulo es elegible
- **WHEN** un perfil `miembro` con email tiene `activo = null`
- **THEN** aparece en la lista de miembros elegibles

#### Scenario: Perfil desactivado no es elegible
- **WHEN** un perfil tiene `activo = false`
- **THEN** no aparece en la lista de miembros elegibles

#### Scenario: Membresía libre con inicio futuro no cuenta como libre
- **WHEN** un miembro tiene membresía `activa`, sin fin, con fecha de inicio posterior a hoy
- **THEN** no se incluye entre los miembros de membresía libre

#### Scenario: Sin método de pago activo
- **WHEN** no existe método de pago activo
- **THEN** el monto mensual y el de inscripción valen 0

### Requirement: Cálculo de miembros morosos
Para un año consultado, el sistema SHALL listar como morosos a los miembros elegibles, excluyendo al dueño y a los de membresía libre, que deban inscripción, tengan meses de mensualidad adeudados o tengan pagos de mensualidad pendientes de aprobación en ese año.

- El mes tope SHALL ser el mes actual si el año consultado es el año en curso, y diciembre en otro caso.
- La inscripción SHALL considerarse pagada si existe un pago aprobado de tipo `inscripcion` en el año consultado o si el perfil tiene `inscription_paid = true`.
- La fecha de inicio de deuda SHALL ser la fecha de inicio de la membresía; si no existe, la fecha de inicio del perfil. Si la membresía inicia en el futuro SHALL usarse la fecha del perfil, y si esta no existe el miembro SHALL omitirse.
- Si el año de inicio es posterior al consultado el miembro SHALL omitirse; si es el mismo año, la deuda SHALL empezar en el mes de inicio; en otro caso, en enero. Sin fecha de inicio, la deuda SHALL empezar en enero.
- Un mes SHALL considerarse cubierto si el miembro tiene cualquier pago aprobado (de cualquier tipo) para ese mes del año consultado.
- El mes tope SHALL excluirse de la deuda si el día de hoy es anterior al día de cobro del miembro según el modo de cobro.
- La deuda total SHALL ser `meses adeudados × monto mensual` más el monto de inscripción si la debe. El monto pendiente SHALL ser la suma de los montos de sus pagos de mensualidad pendientes del año, usando el monto mensual cuando un pago tiene monto 0 o nulo.

#### Scenario: Miembro sin pagos desde enero
- **WHEN** hoy es 12 de septiembre de 2026, el modo es `dia_uno`, el miembro inició el 2026-01-01, tiene la inscripción pagada y no tiene pagos
- **THEN** es moroso con meses `[1..9]` y deuda total `9 × monto mensual`

#### Scenario: Mes actual antes del día de cobro
- **WHEN** el modo es `fecha_inscripcion`, el día de cobro del miembro es 20 y hoy es día 12 del mes tope
- **THEN** el mes tope no aparece entre los meses adeudados

#### Scenario: Pago aprobado de cualquier tipo cubre el mes
- **WHEN** el miembro tiene un pago aprobado de tipo `suspension` para marzo
- **THEN** marzo no aparece entre sus meses adeudados

#### Scenario: Solo pagos pendientes
- **WHEN** el miembro tiene todos los meses cubiertos, la inscripción pagada y un pago de mensualidad pendiente
- **THEN** aparece como moroso con `mesesDeuda` vacío y `pagosPendientes = 1`

#### Scenario: Dueño y libres excluidos
- **WHEN** un miembro es el dueño (email igual al `owner_email`, sin importar mayúsculas) o tiene membresía libre
- **THEN** no aparece en la lista de morosos

#### Scenario: Sin miembros elegibles
- **WHEN** no hay miembros elegibles
- **THEN** la lista de morosos es vacía y no se consultan los pagos del año

### Requirement: Miembros al día
El sistema SHALL listar como al día a los miembros elegibles, excluyendo al dueño y a los de membresía libre, que tengan un pago aprobado de tipo `mensualidad` o `suspension` para el mes calendario actual del año consultado. Este cálculo NO SHALL exigir la inscripción pagada.

#### Scenario: Pago de suspensión cuenta como al día
- **WHEN** el miembro tiene un pago aprobado de tipo `suspension` para el mes actual del año consultado
- **THEN** aparece en la lista de miembros al día

#### Scenario: Pago pendiente no cuenta
- **WHEN** el único pago del miembro para el mes actual está `pendiente`
- **THEN** no aparece en la lista de miembros al día

### Requirement: Estadísticas anuales del dashboard
Para un año consultado, el sistema SHALL calcular sobre los miembros elegibles excluyendo al dueño (los de membresía libre sí se incluyen):

- `totalMiembros` y `miembrosActivos`: cantidad de esos miembros.
- `inscritosPagados` / `inscritosPendientes`: cuántos tienen o no la inscripción pagada, con la misma regla que el cálculo de morosos.
- `deudoresTotal`, `deudoresInscripcion`, `deudoresMensualidad`: a partir de la lista de morosos del año.
- `montoDeuda = deudoresInscripcion × monto inscripción + (suma de meses adeudados) × monto mensual`, desglosado en `montoDeudaInscripcion` y `montoDeudaMensualidad`.
- `alDiaMensualidad`: usuarios distintos con pago aprobado de tipo `mensualidad` o `suspension` para el mes calendario actual del año consultado y con inscripción pagada.
- `montoPagado` e `ingresosMes`: suma de los montos de esos pagos.
- `pagosConfirmados` / `pagosPendientes`: cantidad de líneas de detalle aprobadas o pendientes del año.
- `membresiaLibre`: cantidad de miembros con membresía libre.

#### Scenario: Al día requiere inscripción pagada
- **WHEN** un miembro sin inscripción pagada tiene una mensualidad aprobada del mes actual
- **THEN** no se cuenta en `alDiaMensualidad` ni su monto en `montoPagado`

#### Scenario: Monto de deuda
- **WHEN** hay dos morosos: uno debe la inscripción y 2 meses, otro debe 1 mes; mensual = 10 e inscripción = 5
- **THEN** `montoDeudaInscripcion = 5`, `montoDeudaMensualidad = 30` y `montoDeuda = 35`

### Requirement: Estadísticas mensuales del dashboard
Para cada mes desde enero hasta el mes tope (mes actual en el año en curso, diciembre en otro caso), el sistema SHALL calcular sobre los miembros elegibles, excluyendo al dueño, que hayan iniciado a más tardar el último día del mes (o no tengan fecha de inicio):

- `pagados`: usuarios distintos de ese grupo con algún pago aprobado para el mes.
- `pendientes`: usuarios distintos de ese grupo con algún pago pendiente para el mes.
- `sinPago = max(0, miembros del mes − pagados − pendientes)` y `montoAdeudado = sinPago × monto mensual`.
- `montoAcumulado` / `montoPendiente`: suma de montos aprobados / pendientes del mes de todos los usuarios, pertenezcan o no al grupo.
- `libres`: 0 en cada mes; el total de membresías libres SHALL reportarse aparte, junto con `totalMiembros`.

#### Scenario: Miembro inscrito después del mes
- **WHEN** un miembro tiene fecha de inicio 2026-05-10
- **THEN** no cuenta en los meses enero a abril de 2026 y sí desde mayo

#### Scenario: Usuario con pago aprobado y pendiente el mismo mes
- **WHEN** un usuario tiene un pago aprobado y otro pendiente para el mismo mes
- **THEN** cuenta tanto en `pagados` como en `pendientes` de ese mes

### Requirement: Meses pendientes de un miembro
Para un miembro y un año (por defecto el actual), el sistema SHALL devolver en orden ascendente los meses desde el mes de inicio (si el miembro inició ese año) o enero, hasta diciembre, que no tengan una línea de detalle aprobada o pendiente. Si el miembro inició en un año posterior, o si la consulta falla, SHALL devolver una lista vacía.

#### Scenario: Incluye meses futuros del año
- **WHEN** el miembro inició el 2026-10-01 y no tiene pagos
- **THEN** los meses pendientes de 2026 son octubre, noviembre y diciembre

#### Scenario: Un pago pendiente bloquea el mes
- **WHEN** el miembro tiene una línea de detalle pendiente para noviembre
- **THEN** noviembre no aparece entre sus meses pendientes

### Requirement: Registrar un pago
Un usuario autenticado SHALL poder registrar un pago con cabecera y una o más líneas de detalle. La cabecera SHALL crearse con estado `pendiente` y `created_by` igual al usuario actual; el comprobante SHALL guardarse vacío cuando el método es `efectivo`. Si falla la inserción de las líneas de detalle, la cabecera SHALL eliminarse y la operación SHALL fallar.

#### Scenario: Usuario no autenticado
- **WHEN** no hay sesión
- **THEN** la operación falla con el mensaje de "no autenticado" y no se escribe nada

#### Scenario: Rechazo por RLS
- **WHEN** la inserción de la cabecera es rechazada por row-level security
- **THEN** la operación falla con "No tienes permiso para registrar este pago"

#### Scenario: Falla el detalle
- **WHEN** la cabecera se inserta pero las líneas de detalle fallan
- **THEN** la cabecera se elimina y la operación falla con el mensaje genérico de error de pago

#### Scenario: Pago en efectivo ignora comprobante
- **WHEN** se registra un pago en `efectivo` con URL de comprobante
- **THEN** la cabecera se guarda sin comprobante

### Requirement: Registrar un pago ya aprobado
Solo un `super_admin` SHALL poder registrar un pago directamente como `aprobado`, quedando como aprobador y con fecha de aprobación. Si el pago incluye una línea de tipo `inscripcion`, el perfil del miembro SHALL marcarse con la inscripción pagada y la fecha de hoy.

#### Scenario: Usuario sin rol super_admin
- **WHEN** un usuario con rol `miembro` intenta registrar un pago aprobado
- **THEN** la operación falla con el mensaje de "no autorizado" y no se escribe nada

#### Scenario: Pago aprobado con inscripción
- **WHEN** un `super_admin` registra un pago aprobado con una línea de `inscripcion`
- **THEN** el perfil del miembro queda con `inscription_paid = true` y la fecha de inscripción de hoy

### Requirement: Aprobar y rechazar pagos
Solo un `super_admin` SHALL poder aprobar o rechazar un pago; el aprobador y la fecha SHALL registrarse en ambos casos. Aprobar NO SHALL depender del estado previo del pago. Al aprobar, si el pago tiene una línea de tipo `inscripcion`, el perfil del miembro SHALL marcarse con la inscripción pagada y la fecha de hoy. Rechazar SHALL aplicarse solo a pagos `pendiente` y guardar la nota indicada o "Pago rechazado" por defecto. Los errores de base de datos SHALL propagarse sin traducir.

#### Scenario: Aprobar pago de inscripción
- **WHEN** un `super_admin` aprueba un pago que contiene una línea de `inscripcion`
- **THEN** el pago queda `aprobado` y el perfil del miembro con `inscription_paid = true`

#### Scenario: Rechazar sin nota
- **WHEN** un `super_admin` rechaza un pago pendiente sin indicar nota
- **THEN** el pago queda `rechazado` con la nota "Pago rechazado"

#### Scenario: Miembro intenta aprobar
- **WHEN** un usuario con rol `miembro` intenta aprobar un pago
- **THEN** la operación falla con el mensaje de "no autorizado"

### Requirement: Solicitar suspensión de meses
Un usuario autenticado SHALL poder registrar una suspensión para uno o más meses de un miembro con el estado indicado (`pendiente` por defecto). Los pagos `pendiente` existentes del miembro para esos meses SHALL pasar al nuevo estado, con método `efectivo`, la nota indicada (o "Solicitud de suspensión") y sin aprobador. Además SHALL crearse un pago nuevo en `efectivo` con una línea de tipo `suspension` y monto 0 por cada mes. La operación SHALL devolver la cantidad de meses registrados, o 0 si falla la creación del pago o de sus líneas, sin lanzar error.

#### Scenario: Suspensión de dos meses
- **WHEN** se solicita la suspensión de febrero y marzo sin pagos previos
- **THEN** se crea un pago `pendiente` con dos líneas `suspension` de monto 0 y la operación devuelve 2

#### Scenario: Falla la inserción
- **WHEN** falla la inserción del pago de suspensión
- **THEN** la operación devuelve 0 sin lanzar error
