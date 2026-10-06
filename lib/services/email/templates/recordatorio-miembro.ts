const APP_URL = "https://jarigym.vercel.app/login";

export function recordatorioMiembroTemplate(
  memberName: string,
  gymName: string,
  diasRestantes: number,
  fechaVencimiento: string,
  gymLogo?: string | null
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:56px;height:56px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:56px;height:56px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;color:#ffffff;">${gymName.charAt(0).toUpperCase()}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de pago - ${gymName}</title>
  <style>
    @media only screen and (max-width:600px) {
      .recordatorio-columns { width:100% !important; display:block !important; }
      .recordatorio-col-left { width:100% !important; display:block !important; padding-right:0 !important; border-right:none !important; padding-bottom:24px !important; }
      .recordatorio-col-right { width:100% !important; display:block !important; padding-left:0 !important; border-left:none !important; border-top:2px solid #e2e8f0 !important; padding-top:20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Tu membresía de ${gymName} vence en ${diasRestantes} día${diasRestantes !== 1 ? "s" : ""} (${fechaVencimiento}).
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
                  <td style="padding-right:14px;vertical-align:middle;">
                    ${logoHtml}
                  </td>
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
              <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;font-weight:700;">¡Evita ser expuesto como moroso! Tu membresía está por vencer</h2>
              <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;">Hola <strong style="color:#1e293b;">${memberName}</strong>,</p>
            </td>
          </tr>
          <!-- Two columns -->
          <tr>
            <td style="padding:20px 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" class="recordatorio-columns">
                <tr>
                  <td width="58%" valign="top" class="recordatorio-col-left" style="padding-right:22px;border-right:2px solid #e2e8f0;">
                    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 14px;">
                      Tu membresía en <strong style="color:#1e293b;">${gymName}</strong> vence en <strong style="color:#b45309;">${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}</strong> (${fechaVencimiento}).
                    </p>
                    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 16px;">
                      Para mantener tu acceso activo, realiza tu pago antes de la fecha de vencimiento.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/mis-pagos" style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:15px;font-weight:bold;box-shadow:0 2px 8px rgba(56,189,248,0.25);">
                            Pagar ahora
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:16px 0 0;">
                      Si ya realizaste el pago, puedes ignorar este correo de forma segura.
                    </p>
                  </td>
                  <td width="42%" valign="top" class="recordatorio-col-right" style="padding-left:22px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin:0 0 14px;">
                      <tr>
                        <td style="padding:20px;text-align:center;">
                          <p style="color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;margin:0 0 12px;">Escanea para acceder</p>
                          <img src="cid:qr-login" alt="QR Acceso" width="120" height="120" style="display:block;margin:0 auto 12px;border-radius:8px;">
                          <a href="${APP_URL}" style="color:#38bdf8;font-size:12px;text-decoration:none;font-weight:600;display:block;text-align:center;">${APP_URL.replace("https://", "")}</a>
                        </td>
                      </tr>
                    </table>
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
