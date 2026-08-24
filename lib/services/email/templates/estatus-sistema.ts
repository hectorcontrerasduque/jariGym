export function estatusSistemaTemplate(
  gymName: string,
  metricas: {
    totalMiembrosActivos: number;
    totalMiembrosInactivos: number;
    pagosAprobadosMes: number;
    pagosPendientesMes: number;
    montoRecaudadoMes: number;
    montoPendienteMes: number;
    capacidad: number;
    maxMiembros: number;
    ultimoMiembroRegistrado: string;
    ultimoPagoRegistrado: string;
    migraciones: number;
  },
  gymLogo?: string | null,
  erroresRecientes?: Array<{ tipo: string; fecha: string; detalle: string }>
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:60px;height:60px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:60px;height:60px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#ffffff;">${gymName.charAt(0).toUpperCase()}</div>`;

  const porcentajeCapacidad =
    metricas.maxMiembros > 0
      ? Math.round((metricas.capacidad / metricas.maxMiembros) * 100)
      : 0;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:30px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    ${logoHtml}
                  </td>
                  <td style="vertical-align:middle;">
                    <h1 style="color:#38bdf8;margin:0;font-size:22px;">${gymName}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#1e293b;margin:0 0 15px;font-size:20px;">Estado del Sistema</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Reporte técnico del estado actual del sistema.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Miembros</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Activos</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:bold;text-align:right;">${metricas.totalMiembrosActivos}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Inactivos</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:bold;text-align:right;">${metricas.totalMiembrosInactivos}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Capacidad</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${metricas.capacidad}/${metricas.maxMiembros} (${porcentajeCapacidad}%)</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Migraciones</td>
                        <td style="padding:6px 0;color:#38bdf8;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${metricas.migraciones}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Pagos del Mes</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Aprobados</td>
                        <td style="padding:6px 0;color:#16a34a;font-size:14px;font-weight:bold;text-align:right;">${metricas.pagosAprobadosMes} ($${metricas.montoRecaudadoMes.toFixed(2)})</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Pendientes</td>
                        <td style="padding:6px 0;color:#dc2626;font-size:14px;font-weight:bold;text-align:right;">${metricas.pagosPendientesMes} ($${metricas.montoPendienteMes.toFixed(2)})</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Actividad Reciente</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Último miembro registrado</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:14px;text-align:right;">${metricas.ultimoMiembroRegistrado}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:14px;">Último pago registrado</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:14px;text-align:right;">${metricas.ultimoPagoRegistrado}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${erroresRecientes && erroresRecientes.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="color:#dc2626;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Errores Recientes</p>
                    ${erroresRecientes.map(e => `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                      <tr>
                        <td style="padding:4px 0;color:#dc2626;font-size:13px;font-weight:bold;">${e.tipo}</td>
                        <td style="padding:4px 0;color:#94a3b8;font-size:12px;text-align:right;">${e.fecha}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:2px 0 8px;color:#64748b;font-size:12px;border-bottom:1px solid #fecaca;">${e.detalle}</td>
                      </tr>
                    </table>
                    `).join("")}
                  </td>
                </tr>
              </table>
              ` : `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;text-align:center;">
                    <p style="color:#16a34a;font-size:14px;font-weight:bold;margin:0;">Sin errores recientes</p>
                  </td>
                </tr>
              </table>
              `}

              <p style="color:#cbd5e1;font-size:11px;line-height:1.5;margin:15px 0 0;">
                Este es un reporte automático del sistema. No requiere acción.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
                ${gymName} &mdash; Gestión de gimnasio inteligente
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
