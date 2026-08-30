// @ts-nocheck
import { load as yamlLoad } from 'js-yaml';

export function parseComposeEnv(composeYaml: string): { svc: string; key: string; value: string }[] {
  try {
    const parsed = yamlLoad(composeYaml || '');
    const entries: { svc: string; key: string; value: string }[] = [];
    if (!parsed?.services) return entries;
    for (const [svcName, cfg] of Object.entries(parsed.services as Record<string, any>)) {
      const env = (cfg as any).environment;
      if (!env) continue;
      if (Array.isArray(env)) {
        for (const e of env) {
          const s = String(e);
          const eq = s.indexOf('=');
          if (eq > 0) entries.push({ svc: svcName, key: s.slice(0, eq), value: s.slice(eq + 1) });
        }
      } else if (typeof env === 'object') {
        for (const [k, v] of Object.entries(env)) entries.push({ svc: svcName, key: k, value: String(v) });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function parseComposePorts(composeYaml: string): string[] {
  try {
    const parsed = yamlLoad(composeYaml || '');
    const ports: string[] = [];
    if (!parsed?.services) return ports;
    for (const cfg of Object.values(parsed.services as Record<string, any>)) {
      if (cfg.ports) {
        for (const p of cfg.ports) {
          const hp = String(p).split(':')[0]?.replace(/[^0-9]/g, '');
          if (hp) ports.push(hp);
        }
      }
    }
    return [...new Set(ports)];
  } catch {
    return [];
  }
}

export function parseComposeVolumes(composeYaml: string): { svcName: string; src: string; dst: string }[] {
  try {
    const parsed = yamlLoad(composeYaml || '');
    const entries: { svcName: string; src: string; dst: string }[] = [];
    if (!parsed?.services) return entries;
    for (const [svcName, cfg] of Object.entries(parsed.services as Record<string, any>)) {
      const vols = (cfg as any).volumes || [];
      for (const v of vols) {
        const str = String(v);
        const parts = str.split(':');
        const src = parts.length >= 2 ? parts[0] : '';
        const dst = parts.length >= 2 ? parts[1].split(':')[0] : parts[0];
        entries.push({ svcName, src: src || '—', dst });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function parseComposeResources(composeYaml: string): { name: string; image: string }[] {
  try {
    const parsed = yamlLoad(composeYaml || '');
    if (!parsed?.services) return [];
    return Object.entries(parsed.services as Record<string, any>).map(([name, cfg]) => ({
      name,
      image: (cfg as any).image || '—',
    }));
  } catch {
    return [];
  }
}

export function isComposeService(service: any): boolean {
  return service?.git_builder === 'docker-compose' || !!service?.docker_compose_content;
}
