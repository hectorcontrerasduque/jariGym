export function welcomeTemplate(
  email: string,
  password: string,
  gymName: string,
  gymLogo?: string | null,
  confirmLink?: string
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:60px;height:60px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:60px;height:60px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#ffffff;">${gymName.charAt(0).toUpperCase()}</div>`;

  const confirmButtonHtml = confirmLink
    ? `<table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <a href="${confirmLink}" style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">
              Confirmar mi correo
            </a>
          </td>
        </tr>
      </table>
      <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:20px 0 0;">
        Haz clic en el botón para confirmar tu correo y activar tu cuenta.
      </p>`
    : '';

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
              ${password ? `
              <h2 style="color:#1e293b;margin:0 0 15px;font-size:20px;">¡Bienvenido!</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 10px;">Hola,</p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Tu cuenta en <strong style="color:#1e293b;">${gymName}</strong> ha sido creada exitosamente.
              </p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Estas son tus credenciales de acceso:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="color:#64748b;font-size:13px;margin:0 0 4px;">Usuario:</p>
                    <p style="color:#1e293b;font-size:15px;font-weight:bold;margin:0 0 12px;">${email}</p>
                    <p style="color:#64748b;font-size:13px;margin:0 0 4px;">Contraseña:</p>
                    <p style="color:#1e293b;font-size:15px;font-weight:bold;margin:0;">${password}</p>
                  </td>
                </tr>
              </table>
              ` : `
              <h2 style="color:#1e293b;margin:0 0 15px;font-size:20px;">Datos Migrados</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 10px;">Hola,</p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Tus pagos han sido migrados exitosamente en <strong style="color:#1e293b;">${gymName}</strong>.
              </p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Ya puedes iniciar sesión con tu correo y contraseña existentes para ver tus pagos.
              </p>
              `}
              ${confirmButtonHtml}
              <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:25px 0 0;">
                Si no solicitaste esta cuenta, puedes ignorar este correo de forma segura.
              </p>
              <p style="color:#f59e0b;font-size:12px;line-height:1.5;margin:20px 0 0;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;">
                Si no recibes el correo, revisa tu carpeta de <strong>SPAM</strong> o <strong>No deseado</strong>.
              </p>
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
