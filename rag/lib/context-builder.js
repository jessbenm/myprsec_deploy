import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';

async function fetchBackend(path, cookie) {
  try {
    const r = await fetch(`${BACKEND_URL}${path}`, {
      headers: { Cookie: cookie || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function buildVpsContext(vpsId, cookie) {
  if (!vpsId) return '';

  const [toolsData, projectsData, metricsData, alertsData] = await Promise.all([
    fetchBackend(`/api/vps/${vpsId}/detected-tools`, cookie),
    fetchBackend(`/api/vps/${vpsId}/detected-projects`, cookie),
    fetchBackend(`/api/metrics/${vpsId}`, cookie),
    fetchBackend(`/api/alerts/${vpsId}`, cookie),
  ]);

  const tools = toolsData?.tools || [];
  const projects = projectsData?.projects || [];
  const containers = metricsData?.containers || [];
  const alerts = alertsData?.alerts || [];
  const vps = metricsData?.vps || {};

  const activeTools = tools.filter(t => t.is_active);

  const lines = [
    '=== CONTEXTE DU VPS SÉLECTIONNÉ ===',
    `VPS ID : ${vpsId}`,
    vps.name ? `Nom : ${vps.name}` : '',
    vps.host ? `IP : ${vps.host}` : '',
  ];

  if (activeTools.length > 0) {
    lines.push('', '--- Outils détectés sur ce VPS ---');
    activeTools.forEach(t => lines.push(`✓ ${t.tool_name} ${t.tool_version || ''}`));
  }

  if (projects.length > 0) {
    lines.push('', '--- Projets détectés sur ce VPS ---');
    projects.forEach(p =>
      lines.push(`• ${p.project_name} (${p.tech_stack || p.project_type || '?'}) — ${p.is_running ? 'En cours' : 'Arrêté'} — ${p.project_path}`)
    );
  }

  if (containers.length > 0) {
    lines.push('', '--- Containers Docker actifs ---');
    containers.forEach(c => lines.push(`• ${c.name} (${c.cpu}) — ${c.mem}`));
  }

  if (alerts.length > 0) {
    lines.push('', '--- Alertes actives ---');
    alerts.forEach(a => lines.push(`⚠️ ${a.type} : ${a.title} — ${a.message}`));
  } else {
    lines.push('', '--- Alertes actives ---', 'Aucune alerte active');
  }

  lines.push('=================================');
  return lines.filter(l => l !== undefined).join('\n');
}

export function getDetectedToolNames(toolsData) {
  return (toolsData?.tools || []).filter(t => t.is_active).map(t => t.tool_name);
}
