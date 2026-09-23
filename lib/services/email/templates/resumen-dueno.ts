const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function resumenDuenoTemplate(
  gymName: string,
  resumen: {
    pagosAprobados: number;
    pagosPendientes: number;
    montoCobrado: number;
    montoDeuda: number;
    miembrosAlDia: number;
    miembrosDeudores: number;
    migraciones: number;
  },
  appUrl: string,
  gymLogo?: string | null,
  frecuencia?: string
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:56px;height:56px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;color:#ffffff;">${gymName.charAt(0).toUpperCase()}</div>`;

  const hoy = new Date();
  const mesActual = MONTH_NAMES[hoy.getMonth()];
  const anioActual = hoy.getFullYear();
  const tituloFrecuencia = frecuencia || "Mensual";

  const totalMiembros = resumen.miembrosAlDia + resumen.miembrosDeudores;
  const tasaCobro = totalMiembros > 0
    ? Math.round((resumen.miembrosAlDia / totalMiembros) * 100)
    : 0;

  let insightHtml: string;
  if (resumen.miembrosDeudores === 0 && resumen.pagosPendientes === 0) {
    insightHtml = `
      <p style="color:#15803d;font-size:14px;line-height:1.6;margin:0;">
        Todos tus miembros están al día. Excelente gestión de cobros.
      </p>`;
  } else if (resumen.miembrosDeudores > 0) {
    insightHtml = `
      <p style="color:#1e293b;font-size:14px;line-height:1.6;margin:0;">
        <strong>${resumen.miembrosDeudores}</strong> ${resumen.miembrosDeudores === 1 ? "miembro tiene" : "miembros tienen"} deuda pendiente por <strong>$${resumen.montoDeuda.toFixed(2)}</strong>.
        ${resumen.miembrosDeudores <= 3 ? "Envía un recordatorio personalizado para mejorar tu flujo de caja." : "Considera enviar un recordatorio general para reducir la morosidad."}
      </p>`;
  } else {
    insightHtml = `
      <p style="color:#1e293b;font-size:14px;line-height:1.6;margin:0;">
        El <strong>${tasaCobro}%</strong> de tus miembros están al día. No hay deuda pendiente este mes.
      </p>`;
  }



  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen de Pagos - ${gymName}</title>
  <style>
    @media only screen and (max-width:600px) {
      .resumen-columns { width:100% !important; display:block !important; }
      .resumen-col { width:100% !important; display:block !important; margin-bottom:12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Resumen ${tituloFrecuencia.toLowerCase()} de pagos de ${gymName} — ${mesActual} ${anioActual}
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:35px 30px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:14px;vertical-align:middle;">${logoHtml}</td>
                  <td style="vertical-align:middle;">
                    <h1 style="color:#38bdf8;margin:0;font-size:22px;letter-spacing:-0.3px;">${gymName}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding:28px 28px 0;">
              <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;font-weight:700;">Resumen ${tituloFrecuencia} de Pagos</h2>
              <p style="color:#94a3b8;font-size:13px;margin:0 0 4px;">${mesActual} ${anioActual}</p>
              <p style="color:#64748b;font-size:14px;line-height:1.6;margin:12px 0 0;">Aquí tienes el resumen financiero de tu gimnasio:</p>
            </td>
          </tr>
          <!-- Stats grid -->
          <tr>
            <td style="padding:0 28px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" class="resumen-columns" style="margin:0 0 12px;">
                <tr>
                  <!-- Pagos Aprobados -->
                  <td width="50%" valign="top" class="resumen-col" style="padding-right:6px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;border-left:3px solid #16a34a;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="color:#16a34a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Pagos Aprobados</p>
                          <p style="color:#15803d;font-size:28px;font-weight:bold;margin:0 0 4px;">${resumen.pagosAprobados}</p>
                          <p style="color:#16a34a;font-size:13px;margin:0;">$${resumen.montoCobrado.toFixed(2)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Pagos Pendientes -->
                  <td width="50%" valign="top" class="resumen-col" style="padding-left:6px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:10px;border:1px solid #fecaca;border-left:3px solid #dc2626;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="color:#dc2626;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Pagos Pendientes</p>
                          <p style="color:#b91c1c;font-size:28px;font-weight:bold;margin:0 0 4px;">${resumen.pagosPendientes}</p>
                          <p style="color:#dc2626;font-size:13px;margin:0;">$${resumen.montoDeuda.toFixed(2)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" class="resumen-columns" style="margin:0 0 12px;">
                <tr>
                  <!-- Miembros al Día -->
                  <td width="50%" valign="top" class="resumen-col" style="padding-right:6px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;border-left:3px solid #38bdf8;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Miembros al Día</p>
                          <p style="color:#1e293b;font-size:28px;font-weight:bold;margin:0 0 4px;">${resumen.miembrosAlDia}</p>
                          <p style="color:#38bdf8;font-size:13px;margin:0;">Tasa de cobro: ${tasaCobro}%</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Miembros Deudores -->
                  <td width="50%" valign="top" class="resumen-col" style="padding-left:6px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:10px;border:1px solid #fecaca;border-left:3px solid #dc2626;">
                      <tr>
                        <td style="padding:16px;">
                          <p style="color:#dc2626;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Miembros Deudores</p>
                          <p style="color:#b91c1c;font-size:28px;font-weight:bold;margin:0 0 4px;">${resumen.miembrosDeudores}</p>
                          <p style="color:#dc2626;font-size:13px;margin:0;">Deuda: $${resumen.montoDeuda.toFixed(2)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Migraciones -->
              ${resumen.migraciones > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
                <tr>
                  <td style="padding:12px 16px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;border-left:3px solid #38bdf8;">
                    <p style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Migraciones</p>
                    <p style="color:#1e293b;font-size:18px;font-weight:bold;margin:0;">${resumen.migraciones}</p>
                  </td>
                </tr>
              </table>` : ""}
              <!-- Insight -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;">
                    <p style="color:#0369a1;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Análisis</p>
                    ${insightHtml}
                  </td>
                </tr>
              </table>
              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:bold;box-shadow:0 2px 8px rgba(56,189,248,0.25);">
                      Ir al Sistema
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding-top:16px;">
                    <p style="color:#cbd5e1;font-size:11px;line-height:1.5;margin:0;">
                      Este es un correo automático, por favor no respondas a este mensaje.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
