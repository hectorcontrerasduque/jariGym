export interface CambioDueno {
  campo: string;
  anterior: string;
  nuevo: string;
}

const ETIQUETAS: Record<string, string> = {
  owner_name: "Nombre",
  owner_email: "Correo",
  owner_phone: "Teléfono",
};

function cambiosHtml(cambios: CambioDueno[]): string {
  if (cambios.length === 0) return "";
  const filas = cambios
    .map((c) => {
      const etiqueta = ETIQUETAS[c.campo] ?? c.campo;
      const anterior = c.anterior || "—";
      const nuevo = c.nuevo || "—";
      return `<tr>
        <td style="padding:6px 0;color:#64748b;font-size:13px;">${etiqueta}:</td>
        <td style="padding:6px 0;color:#1e293b;font-size:14px;text-align:right;">${anterior} → <strong>${nuevo}</strong></td>
      </tr>`;
    })
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;margin:0 0 20px;">
    <tr><td style="padding:16px;">${filas}</td></tr>
  </table>`;
}

export function configuracionDuenoTemplate(
  ownerName: string,
  gymName: string,
  tipo: "bienvenida" | "actualizacion",
  cambios: CambioDueno[],
  gymLogo?: string | null
): string {
  const logoHtml = gymLogo
    ? `<img src="${gymLogo}" alt="${gymName}" style="width:60px;height:60px;object-fit:cover;border-radius:12px;">`
    : `<div style="width:60px;height:60px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#ffffff;">G</div>`;

  const bienvenida = tipo === "bienvenida";
  const titulo = bienvenida ? "¡Bienvenido!" : "Datos actualizados";
  const intro = bienvenida
    ? `Ahora eres el <strong style="color:#1e293b;">propietario</strong> de ${gymName}.`
    : `Tus datos de propietario en <strong style="color:#1e293b;">${gymName}</strong> fueron actualizados.`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo} - ${gymName}</title>
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
                  <td style="padding-right:12px;vertical-align:middle;">${logoHtml}</td>
                  <td style="vertical-align:middle;"><h1 style="color:#38bdf8;margin:0;font-size:22px;">${gymName}</h1></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#0ea5e9;margin:0 0 15px;font-size:20px;">${bienvenida ? "👋" : "✏️"} ${titulo}</h2>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 10px;">Hola <strong style="color:#1e293b;">${ownerName || "propietario"}</strong>,</p>
              <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">${intro}</p>
              ${cambiosHtml(cambios)}
              <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">Este aviso se envía automáticamente al guardar los datos del propietario en la configuración.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
