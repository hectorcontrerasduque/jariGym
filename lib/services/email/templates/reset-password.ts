export function resetPasswordTemplate(resetLink: string, gymName: string): string {
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
              <h1 style="color:#38bdf8;margin:0;font-size:22px;">${gymName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#1e293b;margin:0 0 15px;font-size:20px;">Restablecer Contraseña</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 10px;">Hola,</p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>${gymName}</strong>.
              </p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 25px;">
                Haz clic en el botón de abajo para crear una nueva contraseña:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display:inline-block;background-color:#38bdf8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">
                      Restablecer Contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:25px 0 0;">
                Este enlace expira en 24 horas. Si no solicitaste este cambio, puedes ignorar este correo de forma segura.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
                ${gymName}
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
