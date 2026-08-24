export function resumenDuenoTemplate(
  gymName: string,
  resumen: {
    pagosAprobados: number;
    pagosPendientes: number;
    montoCobrado: number;
    montoPendiente: number;
    miembrosAlDia: number;
    miembrosDeudores: number;
    migraciones: number;
  },
  appUrl: string,
  gymLogo?: string | null
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:60px;height:60px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:60px;height:60px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#ffffff;">${gymName.charAt(0).toUpperCase()}</div>`;

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
              <h2 style="color:#1e293b;margin:0 0 15px;font-size:20px;">Resumen de Pagos</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Aquí tienes el resumen financiero de tu gimnasio:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td width="50%" style="padding:12px;background:#f0fdf4;border-radius:8px 0 0 8px;border:1px solid #bbf7d0;">
                    <p style="color:#16a34a;font-size:12px;margin:0 0 4px;">Pagos Aprobados</p>
                    <p style="color:#15803d;font-size:22px;font-weight:bold;margin:0;">${resumen.pagosAprobados}</p>
                  </td>
                  <td width="50%" style="padding:12px;background:#fef2f2;border-radius:0 8px 8px 0;border:1px solid #fecaca;">
                    <p style="color:#dc2626;font-size:12px;margin:0 0 4px;">Pagos Pendientes</p>
                    <p style="color:#b91c1c;font-size:22px;font-weight:bold;margin:0;">${resumen.pagosPendientes}</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;">Monto Cobrado</td>
                        <td style="padding:8px 0;color:#16a34a;font-size:14px;font-weight:bold;text-align:right;">$${resumen.montoCobrado.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Monto Pendiente</td>
                        <td style="padding:8px 0;color:#dc2626;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">$${resumen.montoPendiente.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Miembros al Día</td>
                        <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${resumen.miembrosAlDia}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Miembros Deudores</td>
                        <td style="padding:8px 0;color:#dc2626;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${resumen.miembrosDeudores}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">Migraciones</td>
                        <td style="padding:8px 0;color:#38bdf8;font-size:14px;font-weight:bold;text-align:right;border-top:1px solid #e2e8f0;">${resumen.migraciones}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">
                      Ver Pagos
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#cbd5e1;font-size:11px;line-height:1.5;margin:15px 0 0;">
                Este es un correo automático, por favor no respondas a este mensaje.
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
