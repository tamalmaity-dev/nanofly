// @ts-nocheck
import { useState, useEffect } from 'react';
import { Save, Globe, Info } from 'lucide-react';
import { servicesApi, domainsApi } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Tooltip } from '../../components/ui/Tooltip';
import { useToast } from '../../components/ui/Toast';
import { markPendingRedeploy } from '../../utils/servicePending';
import { parseBuilderValue } from '../../components/AddServiceConfigFields';

const SUB_NAV = [
  { id: 'details', label: 'Application details' },
  { id: 'access', label: 'Access' },
  { id: 'build', label: 'Build pipeline' },
  { id: 'image', label: 'Container image' },
  { id: 'networking', label: 'Networking' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'lifecycle', label: 'Deployment lifecycle' },
  { id: 'labels', label: 'Container labels' },
];

const NANOFLY_NETWORK = 'nanofly-network';

function parseImageRef(image) {
  if (!image) return { base: '', tag: 'latest', digest: '' };
  if (image.includes('@sha256:')) {
    const [basePart, digestPart] = image.split('@sha256:');
    let base = basePart;
    const lastSlash = base.lastIndexOf('/');
    const lastColon = base.lastIndexOf(':');
    if (lastColon > lastSlash) base = base.substring(0, lastColon);
    return { base, tag: '', digest: digestPart };
  }
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  if (lastColon > lastSlash) {
    return { base: image.substring(0, lastColon), tag: image.substring(lastColon + 1), digest: '' };
  }
  return { base: image, tag: 'latest', digest: '' };
}

function buildImageRef(base, tag, digest) {
  base = (base || '').trim();
  if (!base) return '';
  const cleanDigest = (digest || '').trim().replace(/^sha256:/, '');
  if (cleanDigest) {
    let b = base.split('@')[0];
    const lastSlash = b.lastIndexOf('/');
    const lastColon = b.lastIndexOf(':');
    if (lastColon > lastSlash) b = b.substring(0, lastColon);
    return `${b}@sha256:${cleanDigest}`;
  }
  const cleanTag = (tag || '').trim();
  if (cleanTag) {
    let b = base.split('@')[0];
    const lastSlash = b.lastIndexOf('/');
    const lastColon = b.lastIndexOf(':');
    if (lastColon > lastSlash) b = b.substring(0, lastColon);
    return `${b}:${cleanTag}`;
  }
  return base;
}

function ConfigSection({ title, desc, children }) {
  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
        {desc && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function GeneralSettingsPanel({ service, project, domains, onUpdate, onNavigateTab }) {
  const toast = useToast();
  const [section, setSection] = useState('details');
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState('both');

  const [form, setForm] = useState(() => buildForm(service, domains, project));

  useEffect(() => {
    setForm(buildForm(service, domains, project));
    const matched = domains.find(d => d.service === service.name && d.project === project?.name);
    setDirection(matched?.direction || 'both');
  }, [service, domains, project]);

  const domainCount = domains.filter(d => d.service === service.name && d.project === project?.name).length;
  const exposedPort = form.portsExposes || form.port || '—';
  const internalHostname = service.status === 'running' || service.status === 'deploying'
    ? service.name
    : 'No deployed container found';
  const isDockerImage = service.type === 'app' && !!service.image && (!service.git_repo_url || service.git_repo_url === '' || service.git_repo_url === 'github-app://pending');

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (isDockerImage && !form.imageBase.trim()) {
      toast.error('Image name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        port: Number(form.port) || 0,
        git_builder: form.gitBuilder,
        app_directory: form.appDirectory.trim(),
        run_file: form.runFile.trim(),
        requirements_file: form.requirementsFile.trim() || 'requirements.txt',
        use_venv: !!form.useVenv,
        start_command: form.startCommand.trim(),
        install_command: form.installCommand.trim(),
        docker_registry_image: form.dockerRegistryImage.trim(),
        docker_registry_tag: form.dockerRegistryTag.trim(),
        base_directory: form.baseDirectory.trim(),
        dockerfile_location: form.dockerfileLocation.trim(),
        build_stage_target: form.buildStageTarget.trim(),
        build_watch_paths: form.buildWatchPaths.trim(),
        build_custom_options: form.buildCustomOptions.trim(),
        build_use_server: !!form.buildUseServer,
        ports_exposes: Number(form.portsExposes) || 0,
        port_mappings: form.portMappings.trim(),
        network_aliases: form.networkAliases.trim(),
      };
      if (isDockerImage) {
        payload.image = buildImageRef(form.imageBase, form.imageTag, form.imageDigest);
      }
      await servicesApi.update(service.id, payload);

      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      const cleanNewDomain = form.domain.trim().replace(/^https?:\/\//, '');
      const cleanOldDomain = matched ? matched.domain : '';

      if (cleanNewDomain !== cleanOldDomain) {
        if (matched) await domainsApi.delete(matched.id);
        if (cleanNewDomain) {
          await domainsApi.create({
            domain: cleanNewDomain,
            service: form.name.trim(),
            project: project?.name || 'Production',
            direction,
          });
        }
      } else if (matched && matched.direction !== direction) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: form.name.trim(),
          project: project?.name || 'Production',
          direction,
        });
      }

      markPendingRedeploy(service.id);
      toast.info('Configuration saved — Redeploy to apply changes');
      onUpdate();
    } catch (e) {
      toast.error(e.message || 'Failed to save configuration');
    }
    setSaving(false);
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const builderType = parseBuilderValue(form.gitBuilder).type;

  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SUB_NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius)',
              border: '1px solid',
              borderColor: section === item.id ? 'rgba(79,110,247,0.25)' : 'transparent',
              background: section === item.id ? 'rgba(79,110,247,0.10)' : 'transparent',
              color: section === item.id ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: section === item.id ? 600 : 400,
              textAlign: 'left',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {section === 'details' && (
          <ConfigSection title="Application details" desc="Name and description for this resource.">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={set('name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" value={form.description} onChange={set('description')} rows={3} />
            </div>
          </ConfigSection>
        )}

        {section === 'access' && (
          <ConfigSection title="Access" desc="Public and internal access configuration.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Public Access</div>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
                  {domainCount} configured domain{domainCount !== 1 ? 's' : ''}
                </div>
                <Button variant="outline" size="sm" icon={Globe} onClick={() => onNavigateTab?.('domains')}>
                  Manage domains
                </Button>
              </div>
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Internal Access</div>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Internal hostname: </span>{internalHostname}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Docker network: </span>{NANOFLY_NETWORK}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Exposed ports: </span>{exposedPort}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Network aliases: </span>{form.networkAliases || 'None'}</div>
                </div>
                <Button variant="outline" size="sm" style={{ marginTop: 10 }} onClick={() => onNavigateTab?.('networking')}>
                  Edit networking
                </Button>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Internal hostnames are only reachable by resources connected to the {NANOFLY_NETWORK} Docker network.
            </p>
          </ConfigSection>
        )}

        {section === 'build' && (
          isDockerImage ? (
            <ConfigSection title="Build pipeline" desc="Build configuration for this application.">
              <div style={{ padding: '1rem', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Nothing to build. This application deploys a prebuilt Docker image.
              </div>
            </ConfigSection>
          ) : (
            <ConfigSection title="Build pipeline" desc="Configure compilation paths and builder options.">
              <div className="form-group">
                <label className="form-label">Builder</label>
                <select className="form-input" value={form.gitBuilder} onChange={set('gitBuilder')}>
                  <option value="auto">Auto-detect</option>
                  <option value="dockerfile">Dockerfile</option>
                  <option value="docker-compose">Docker Compose</option>
                  <option value="nixpacks">Nixpacks</option>
                  <option value="node:22-alpine">Node.js</option>
                  <option value="python:3.11-slim">Python</option>
                  <option value="golang:1.22-alpine">Go</option>
                  <option value="php:8.2-apache">PHP</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Base Directory</label>
                  <input className="form-input" placeholder="/" value={form.baseDirectory} onChange={set('baseDirectory')} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Dockerfile Location</label>
                  <input className="form-input" placeholder="/Dockerfile" value={form.dockerfileLocation} onChange={set('dockerfileLocation')} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Build Stage Target</label>
                  <input className="form-input" placeholder="e.g. runner" value={form.buildStageTarget} onChange={set('buildStageTarget')} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Watch Paths</label>
                  <input className="form-input" placeholder="src/**" value={form.buildWatchPaths} onChange={set('buildWatchPaths')} />
                </div>
              </div>
            </ConfigSection>
          )
        )}

        {section === 'image' && (
          isDockerImage ? (
            <ConfigSection title="Container image" desc="Prebuilt Docker image from a registry.">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Image
                  <Tooltip content="e.g. nginx, ghcr.io/user/app"><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></Tooltip>
                </label>
                <input className="form-input" placeholder="ghcr.io/tamalmaity-dev/roopsa-web" value={form.imageBase} onChange={set('imageBase')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Tag
                    <Tooltip content="Image tag, e.g. latest"><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></Tooltip>
                  </label>
                  <input className="form-input" placeholder="latest" value={form.imageTag} onChange={set('imageTag')} disabled={!!form.imageDigest.trim()} style={form.imageDigest.trim() ? { opacity: 0.5 } : undefined} />
                </div>
                <div style={{ paddingBottom: 10, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>OR</div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    SHA256 digest
                    <Tooltip content="Without sha256: prefix"><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></Tooltip>
                  </label>
                  <input className="form-input" placeholder="59e02939b1bf39f16c93138a28727aec..." value={form.imageDigest} onChange={set('imageDigest')} disabled={!!form.imageTag.trim() && form.imageTag.trim() !== 'latest'} style={form.imageTag.trim() && form.imageTag.trim() !== 'latest' ? { opacity: 0.5 } : undefined} />
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg-elevated)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Full reference: <span style={{ color: 'var(--text-primary)' }}>{buildImageRef(form.imageBase, form.imageTag, form.imageDigest) || '—'}</span>
              </div>
            </ConfigSection>
          ) : (
            <ConfigSection title="Container image" desc="Docker registry image and tag (optional).">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Docker Image</label>
                  <input className="form-input" placeholder="username/my-app" value={form.dockerRegistryImage} onChange={set('dockerRegistryImage')} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Docker Image Tag</label>
                  <input className="form-input" placeholder="latest" value={form.dockerRegistryTag} onChange={set('dockerRegistryTag')} />
                </div>
              </div>
            </ConfigSection>
          )
        )}

        {section === 'networking' && (
          <ConfigSection title="Networking" desc="Container ports and network configuration.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Ports Exposes</label>
                <input className="form-input" placeholder="3000" value={form.portsExposes} onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, portsExposes: val, port: val }));
                }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Port Mappings</label>
                <input className="form-input" placeholder="8080:3000" value={form.portMappings} onChange={set('portMappings')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Network Aliases</label>
                <input className="form-input" placeholder="my-alias" value={form.networkAliases} onChange={set('networkAliases')} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Docker network</label>
              <input className="form-input" value={NANOFLY_NETWORK} readOnly style={{ opacity: 0.7 }} />
            </div>
          </ConfigSection>
        )}

        {section === 'runtime' && (
          <ConfigSection title="Runtime" desc="Start and install commands for your application.">
            <div className="form-group">
              <label className="form-label">Start command</label>
              <input className="form-input" value={form.startCommand} onChange={set('startCommand')} placeholder="npm start" />
            </div>
            <div className="form-group">
              <label className="form-label">Install command</label>
              <input className="form-input" value={form.installCommand} onChange={set('installCommand')} />
            </div>
            {['node', 'python', 'go', 'php'].includes(builderType) && (
              <>
                <div className="form-group">
                  <label className="form-label">App directory</label>
                  <input className="form-input" value={form.appDirectory} onChange={set('appDirectory')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Run file</label>
                  <input className="form-input" value={form.runFile} onChange={set('runFile')} />
                </div>
                {builderType === 'python' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Requirements file</label>
                      <input className="form-input" value={form.requirementsFile} onChange={set('requirementsFile')} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                      <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
                      Use virtual environment
                    </label>
                  </>
                )}
              </>
            )}
          </ConfigSection>
        )}

        {section === 'lifecycle' && (
          <ConfigSection title="Deployment lifecycle" desc="Build server and watch path settings.">
            <div className="form-group">
              <label className="form-label">Watch Paths</label>
              <input className="form-input" placeholder="src/pages/**" value={form.buildWatchPaths} onChange={set('buildWatchPaths')} />
            </div>
            <div className="form-group">
              <label className="form-label">Custom Docker Options</label>
              <input className="form-input" placeholder="--build-arg KEY=value" value={form.buildCustomOptions} onChange={set('buildCustomOptions')} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={form.buildUseServer} onChange={e => setForm(f => ({ ...f, buildUseServer: e.target.checked }))} />
              Use a Build Server?
            </label>
          </ConfigSection>
        )}

        {section === 'labels' && (
          <ConfigSection title="Container labels" desc="Read-only labels applied to the container.">
            <div className="form-group">
              <label className="form-label">nanofly.service</label>
              <input className="form-input" value={service.id} readOnly style={{ fontFamily: 'monospace', opacity: 0.8 }} />
            </div>
          </ConfigSection>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <Button variant="primary" icon={Save} onClick={handleSave} loading={saving} disabled={saving}>
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildForm(service, domains, project) {
  const matched = domains.find(d => d.service === service.name && d.project === project?.name);
  let initialDomain = matched?.domain || '';
  if (initialDomain && !initialDomain.startsWith('http')) {
    initialDomain = `http://${initialDomain}`;
  }
  const { base: imageBase, tag: imageTag, digest: imageDigest } = parseImageRef(service.image || '');
  return {
    name: service.name,
    description: service.description || '',
    port: service.port || '',
    image: service.image || '',
    imageBase,
    imageTag,
    imageDigest,
    gitBuilder: service.git_builder || 'auto',
    appDirectory: service.app_directory || '',
    runFile: service.run_file || '',
    requirementsFile: service.requirements_file || 'requirements.txt',
    useVenv: service.use_venv !== false,
    startCommand: service.start_command || '',
    installCommand: service.install_command || '',
    dockerRegistryImage: service.docker_registry_image || '',
    dockerRegistryTag: service.docker_registry_tag || '',
    baseDirectory: service.base_directory || '',
    dockerfileLocation: service.dockerfile_location || '',
    buildStageTarget: service.build_stage_target || '',
    buildWatchPaths: service.build_watch_paths || '',
    buildCustomOptions: service.build_custom_options || '',
    buildUseServer: !!service.build_use_server,
    portsExposes: service.ports_exposes ? String(service.ports_exposes) : (service.port ? String(service.port) : ''),
    portMappings: service.port_mappings || '',
    networkAliases: service.network_aliases || '',
    domain: initialDomain,
  };
}

// Expose networking section id for access card navigation
GeneralSettingsPanel.NETWORKING_SECTION = 'networking';
