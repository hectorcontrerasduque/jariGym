export function errorReportTemplate(
  errorInfo: {
    paso: string;
    mensaje: string;
    timestamp: string;
    contexto: Record<string, unknown>;
  },
  gymName: string,
  gymLogo?: string | null
): string {
  const logoHtml = gymLogo
    ? '<img src="' + gymLogo + '" alt="' + gymName + '" style="width:60px;height:60px;object-fit:cover;border-radius:12px;">'
    : '<div style="width:60px;height:60px;background:linear-gradient(135deg,#38bdf8,#0ea5e9);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#ffffff;">' + gymName.charAt(0).toUpperCase() + '</div>';

  const contextoRows = Object.entries(errorInfo.contexto)
    .map(function (entry) {
      return '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">' + entry[0] + '</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:bold;text-align:right;">' + String(entry[1]) + '</td></tr>';
    })
    .join("");

  return '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">' +
    '<tr><td align="center">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
    '<tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:30px;text-align:center;">' +
    '<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>' +
    '<td style="padding-right:12px;vertical-align:middle;">' + logoHtml + '</td>' +
    '<td style="vertical-align:middle;"><h1 style="color:#38bdf8;margin:0;font-size:22px;">' + gymName + '</h1></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:30px;">' +
    '<h2 style="color:#dc2626;margin:0 0 15px;font-size:20px;">Error en Notificaciones</h2>' +
    '<p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 20px;">Se produjo un error al procesar las notificaciones automaticas.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;"><tr><td style="padding:16px;">' +
    '<p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Detalles del Error</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Fecha</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:bold;text-align:right;">' + errorInfo.timestamp + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Paso</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:bold;text-align:right;">' + errorInfo.paso + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Error</td><td style="padding:6px 0;color:#dc2626;font-size:13px;font-weight:bold;text-align:right;">' + errorInfo.mensaje + '</td></tr>' +
    '</table></td></tr></table>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 20px;"><tr><td style="padding:16px;">' +
    '<p style="color:#64748b;font-size:12px;margin:0 0 8px;font-weight:bold;text-transform:uppercase;">Contexto</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    contextoRows +
    '</table></td></tr></table>' +
    '<p style="color:#cbd5e1;font-size:11px;line-height:1.5;margin:15px 0 0;">Este es un reporte automatico del sistema. No requiere accion.</p>' +
    '</td></tr>' +
    '<tr><td style="background-color:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;">' +
    '<p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">' + gymName + ' &mdash; Gestion de gimnasio inteligente</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}
