import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { servicesApi, projectsApi, domainsApi } from '../api/client';
import { Plus, Play, Trash2, RefreshCw, ChevronRight, GitBranch, Package, Database, Globe, Settings, Eye, EyeOff, Copy, X, Check, ExternalLink, Cpu, MemoryStick, Folder, Key, Lock, FileCode, Sliders } from 'lucide-react';
import { Modal, Tabs, TabsContent, Button, SelectRoot, SelectTrigger, SelectContent, SelectItem } from '../components/ui';

const DB_VERSIONS = {
  postgres: ['postgres:18', 'postgres:17', 'postgres:16', 'postgres:15', 'postgres:14', 'postgres:13'],
  mysql: ['mysql:8.3', 'mysql:8.0'],
  mariadb: ['mariadb:11', 'mariadb:10'],
  redis: ['redis:7', 'redis:6'],
  mongo: ['mongo:7', 'mongo:6', 'mongo:5'],
  keydb: ['keydb'],
  dragonfly: ['dragonfly'],
  clickhouse: ['clickhouse'],
};

// ── Add Service Modal ─────────────────────────────────────────────────────────
function AddServiceModal({ projectId, projectName, open, onOpenChange, onCreated }) {
  const [step, setStep] = useState('type'); // type | config
  const [type, setType] = useState('app'); // app | database
  const [subType, setSubType] = useState('docker'); // docker | github
  const [dbType, setDbType] = useState('postgres:18');
  const [isPrivate, setIsPrivate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    image: '',
    port: '',
    gitUrl: '',
    localPath: '',
    branch: 'main',
    token: '',
    gitBuilder: 'auto',
    appDirectory: '',
    runFile: '',
    requirementsFile: 'requirements.txt',
    useVenv: true,
    startCommand: '',
    installCommand: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (subType === 'local' && !form.localPath.trim()) { setError('Server folder path is required'); return; }
    if (subType === 'github' && !form.gitUrl.trim()) { setError('Repository URL is required'); return; }
    setLoading(true); setError('');
    try {
      let svc;
      if (type === 'database') {
        svc = await servicesApi.createDB(projectId, { name: form.name.trim(), db_type: dbType });
      } else if (subType === 'github' || subType === 'local') {
        svc = await servicesApi.createApp(projectId, {
          name: form.name.trim(),
          git_repo_url: subType === 'github' ? form.gitUrl.trim() : '',
          local_path: subType === 'local' ? form.localPath.trim() : '',
          git_branch: form.branch.trim() || 'main',
          git_token: form.token.trim(),
          git_builder: form.gitBuilder || 'auto',
          app_directory: form.appDirectory.trim(),
          run_file: form.runFile.trim(),
          requirements_file: form.requirementsFile.trim() || 'requirements.txt',
          use_venv: !!form.useVenv,
          start_command: form.startCommand.trim(),
          install_command: form.installCommand.trim(),
          port: Number(form.port) || 0
        });
      } else {
        svc = await servicesApi.createApp(projectId, {
          name: form.name.trim(),
          image: form.image.trim(),
          port: Number(form.port) || 0
        });
      }

      // Auto-register a sslip.io domain for app services
      if (svc && type !== 'database') {
        const svcData = svc.data || svc;
        const port = Number(form.port) || 0;
        const host = window.location.hostname;
        const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        const autoDomain = `${randomStr}.${host}.sslip.io`;
        try {
          await domainsApi.create({
            domain: autoDomain,
            service: svcData.name || form.name.trim(),
            project: projectName || '',
            direction: 'both',
          });
        } catch (_) { /* domain already exists or conflict, skip */ }

        // Auto-trigger first deploy
        try { await servicesApi.deploy(svcData.id); } catch (_) { }
      }

      onCreated(svc);
    } catch (e) { setError(e.message || 'Failed to create resource'); }
    setLoading(false);
  };

  const handleSelectResource = (resource) => {
    if (resource.type === 'app') {
      setType('app');
      setSubType(resource.subType);
      setIsPrivate(resource.isPrivate || false);
      setForm(f => ({
        ...f,
        name: resource.defaultName || '',
        image: resource.defaultImage || '',
        port: resource.defaultPort || '',
        gitBuilder: resource.defaultBuilder || f.gitBuilder || 'auto',
      }));
    } else {
      setType('database');
      const defaultVer = DB_VERSIONS[resource.dbType]?.[0] || resource.dbType;
      setDbType(defaultVer);
      setForm(f => ({
        ...f,
        name: `my-${resource.dbType}`,
      }));
    }
    setStep('config');
  };

  const APP_RESOURCES = [
    {
      id: 'git-public',
      type: 'app',
      subType: 'github',
      isPrivate: false,
      title: 'Public Repository',
      desc: 'Deploy any kind of public repositories from the supported git providers.',
      icon: '🌐',
      defaultName: 'public-app'
    },
    {
      id: 'local-folder',
      type: 'app',
      subType: 'local',
      title: 'Local Folder',
      desc: 'Map any server folder and build it with auto-detected Node, Python, Go, PHP, static, or Dockerfile templates.',
      icon: 'Folder',
      defaultName: 'local-app',
      defaultBuilder: 'auto'
    },
    {
      id: 'wordpress',
      type: 'app',
      subType: 'docker',
      title: 'WordPress',
      desc: 'One-click WordPress container. Add a database resource and environment variables for production use.',
      icon: 'WP',
      defaultName: 'wordpress',
      defaultImage: 'wordpress:php8.2-apache',
      defaultPort: '8080'
    },
    {
      id: 'python-template',
      type: 'app',
      subType: 'local',
      title: 'Python Template',
      desc: 'Run a Python folder with generated slim Dockerfile support.',
      icon: 'Py',
      defaultName: 'python-app',
      defaultPort: '8000',
      defaultBuilder: 'python'
    },
    {
      id: 'node-template',
      type: 'app',
      subType: 'local',
      title: 'Node.js Template',
      desc: 'Run a Node.js folder with generated Alpine Dockerfile support.',
      icon: 'JS',
      defaultName: 'node-app',
      defaultPort: '3000',
      defaultBuilder: 'node'
    },
    {
      id: 'git-private-app',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (GitHub App)',
      desc: 'Deploy public & private repositories through GitHub Apps integrations.',
      icon: '🔑',
      defaultName: 'private-app'
    },
    {
      id: 'git-private-key',
      type: 'app',
      subType: 'github',
      isPrivate: true,
      title: 'Private Repository (Deploy Key)',
      desc: 'Deploy private repositories securely using a standalone SSH deploy key.',
      icon: '🔒',
      defaultName: 'secure-app'
    },
    {
      id: 'dockerfile',
      type: 'app',
      subType: 'docker',
      title: 'Dockerfile',
      desc: 'Deploy a custom Dockerfile build configuration directly without Git setup.',
      icon: '📄',
      defaultName: 'docker-app',
      defaultImage: 'nginx:alpine'
    },
    {
      id: 'docker-compose',
      type: 'app',
      subType: 'docker',
      title: 'Docker Compose Empty',
      desc: 'Deploy complex application stacks easily with custom multi-container Compose definitions.',
      icon: '🎛️',
      defaultName: 'compose-app'
    },
    {
      id: 'docker-image',
      type: 'app',
      subType: 'docker',
      title: 'Docker Image',
      desc: 'Deploy an existing compiled Docker image from Docker Hub or a custom registry.',
      icon: '🐳',
      titleSuffix: 'Image',
      defaultName: 'web-image',
      defaultImage: 'nginx:alpine'
    }
  ];

  const DB_RESOURCES = [
    { dbType: 'postgres', title: 'PostgreSQL', desc: 'Object-relational database known for robustness and standards compliance.', icon: '🐘' },
    { dbType: 'mysql', title: 'MySQL', desc: 'Popular open-source relational database management system.', icon: '🐬' },
    { dbType: 'mariadb', title: 'MariaDB', desc: 'Commercially supported fork of MySQL relational database system.', icon: '🌊' },
    { dbType: 'redis', title: 'Redis', desc: 'Fast, in-memory key-value data store used as database, cache, or broker.', icon: '🔴' },
    { dbType: 'keydb', title: 'KeyDB', desc: 'High-performance, multithreaded alternative to Redis core.', icon: '⚡' },
    { dbType: 'dragonfly', title: 'Dragonfly', desc: 'Modern in-memory database built for high-throughput memory efficiency.', icon: '🐉' },
    { dbType: 'mongo', title: 'MongoDB', desc: 'Flexible NoSQL document-oriented database for scalable data storage.', icon: '🍃' },
    { dbType: 'clickhouse', title: 'ClickHouse', desc: 'Column-oriented DBMS optimized for real-time analytical queries.', icon: '📊' }
  ];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          New Resource <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Environment: production</span>
        </span>
      }
      description="Deploy applications, databases, or third-party services on your server."
      maxWidth={840}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginTop: '0.5rem' }}>

        {step === 'type' ? (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 6 }}>
            {/* Apps Section */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>Applications</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {APP_RESOURCES.map(r => (
                  <div
                    key={r.id}
                    onClick={() => handleSelectResource(r)}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover-glow"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'var(--bg-base)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <ResourceIcon type={r.id} size={18} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.title}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* DB Section */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>Databases</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {DB_RESOURCES.map(r => (
                  <div
                    key={r.dbType}
                    onClick={() => handleSelectResource({ type: 'database', dbType: r.dbType })}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover-glow"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'var(--bg-base)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <ResourceIcon type={r.dbType} size={18} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{r.title}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6 }}>
            {type === 'app' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                  <span style={{ fontSize: '1.1rem' }}>⚙️</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Configuring {subType === 'github' ? 'Git Application' : subType === 'local' ? 'Local Folder Application' : 'Docker Application'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Setup the name and deployment parameters for the container.
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Service Name *</label>
                  <input className="form-input" placeholder="e.g. production-api" value={form.name} onChange={set('name')} autoFocus />
                </div>

                {subType === 'docker' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Docker Image *</label>
                      <input className="form-input" placeholder="e.g. nginx:alpine" value={form.image} onChange={set('image')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Host Port (Optional)</label>
                      <input className="form-input" placeholder="e.g. 80 or empty for random" value={form.port} onChange={set('port')} />
                    </div>
                  </>
                ) : subType === 'local' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Server Folder Path *</label>
                      <input className="form-input" placeholder="/opt/apps/my-python-app" value={form.localPath} onChange={set('localPath')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Exposed Container Port</label>
                      <input className="form-input" placeholder="e.g. 3000 or 8000" value={form.port} onChange={set('port')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Build Type / Runtime</label>
                      <SelectRoot value={form.gitBuilder} onValueChange={val => setForm(f => ({ ...f, gitBuilder: val }))}>
                        <SelectTrigger style={{ width: '100%' }} />
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect (Recommended)</SelectItem>
                          <SelectItem value="node">Node.js</SelectItem>
                          <SelectItem value="go">Go (Golang)</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="php">PHP</SelectItem>
                          <SelectItem value="static">HTML / Static Website</SelectItem>
                          <SelectItem value="dockerfile">Use existing Dockerfile</SelectItem>
                        </SelectContent>
                      </SelectRoot>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">App Directory</label>
                        <input className="form-input" placeholder="Blank for folder root, or src/app" value={form.appDirectory} onChange={set('appDirectory')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Run File</label>
                        <input className="form-input" placeholder="e.g. ecopulse.py, main.py, server.js" value={form.runFile} onChange={set('runFile')} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Requirements File</label>
                        <input className="form-input" placeholder="requirements.txt" value={form.requirementsFile} onChange={set('requirementsFile')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Start Command Override</label>
                        <input className="form-input" placeholder="Blank auto-runs the selected file" value={form.startCommand} onChange={set('startCommand')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Install Command Override</label>
                      <input className="form-input" placeholder="Blank installs from requirements file" value={form.installCommand} onChange={set('installCommand')} />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
                        Generate Python virtual environment inside the container
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Repository URL *</label>
                      <input className="form-input" placeholder="e.g. https://github.com/username/repo" value={form.gitUrl} onChange={set('gitUrl')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Branch</label>
                      <input className="form-input" placeholder="main" value={form.branch} onChange={set('branch')} />
                    </div>
                    {isPrivate && (
                      <div className="form-group">
                        <label className="form-label">Personal Access Token (GitHub Token)</label>
                        <input className="form-input" type="password" placeholder="ghp_xxxxxxxxxxxx" value={form.token} onChange={set('token')} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Exposed Container Port</label>
                      <input className="form-input" placeholder="e.g. 3000" value={form.port} onChange={set('port')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Build Type / Runtime</label>
                      <SelectRoot value={form.gitBuilder} onValueChange={val => setForm(f => ({ ...f, gitBuilder: val }))}>
                        <SelectTrigger style={{ width: '100%' }} />
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect (Recommended)</SelectItem>
                          <SelectItem value="node">Node.js</SelectItem>
                          <SelectItem value="go">Go (Golang)</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="php">PHP</SelectItem>
                          <SelectItem value="static">HTML / Static Website</SelectItem>
                          <SelectItem value="dockerfile">Use existing Dockerfile</SelectItem>
                        </SelectContent>
                      </SelectRoot>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">App Directory</label>
                        <input className="form-input" placeholder="Blank for repo root, or backend" value={form.appDirectory} onChange={set('appDirectory')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Run File</label>
                        <input className="form-input" placeholder="e.g. main.py, app.py, server.js" value={form.runFile} onChange={set('runFile')} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Requirements File</label>
                        <input className="form-input" placeholder="requirements.txt" value={form.requirementsFile} onChange={set('requirementsFile')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Start Command Override</label>
                        <input className="form-input" placeholder="Blank auto-runs the selected file" value={form.startCommand} onChange={set('startCommand')} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Install Command Override</label>
                      <input className="form-input" placeholder="Blank installs from requirements file" value={form.installCommand} onChange={set('installCommand')} />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
                        Generate Python virtual environment inside the container
                      </label>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(79,110,247,0.06)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid rgba(79,110,247,0.1)' }}>
                  <span style={{ fontSize: '1.1rem' }}>💾</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Deploying Database: {dbType.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      NanoFly will spin up an isolated database container and inject connection strings automatically.
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Database Version</label>
                  <SelectRoot value={dbType} onValueChange={setDbType}>
                    <SelectTrigger style={{ width: '100%' }} />
                    <SelectContent>
                      {(DB_VERSIONS[dbType.split(':')[0]] || [dbType]).map(v => (
                        <SelectItem key={v} value={v}>
                          {v.includes(':') ? `${v.split(':')[0].toUpperCase()} ${v.split(':')[1]}` : v.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </div>

                <div className="form-group">
                  <label className="form-label">Database Instance Name *</label>
                  <input className="form-input" placeholder={`my-${dbType.split(':')[0]}`} value={form.name} onChange={set('name')} autoFocus />
                </div>
              </div>
            )}

            {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {error}</p>}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button variant="soft" color="gray" onClick={() => setStep('type')}>Back</Button>
              <Button variant="solid" onClick={submit} loading={loading}>
                Deploy Now
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Env Vars Editor ───────────────────────────────────────────────────────────
function EnvVarsPanel({ serviceId }) {
  const [vars, setVars] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [show, setShow] = useState({});
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    servicesApi.getEnvVars(serviceId).then(setVars).catch(() => { });
  }, [serviceId]);

  const add = async () => {
    if (!newKey) return;
    await servicesApi.upsertEnvVar(serviceId, newKey, newVal);
    setVars(v => [...v.filter(x => x.key !== newKey), { key: newKey, value: newVal }]);
    setSaved(newKey); setTimeout(() => setSaved(null), 2000);
    setNewKey(''); setNewVal('');
  };

  const remove = async (key) => {
    await servicesApi.deleteEnvVar(serviceId, key);
    setVars(v => v.filter(x => x.key !== key));
  };

  const copy = (val) => navigator.clipboard.writeText(val);

  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <table className="data-table">
          <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {vars.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No environment variables</td></tr>
            )}
            {vars.map(ev => (
              <tr key={ev.key}>
                <td><code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{ev.key}</code></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                      {show[ev.key] ? ev.value : '••••••••'}
                    </code>
                    <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28 }} onClick={() => setShow(s => ({ ...s, [ev.key]: !s[ev.key] }))} icon={show[ev.key] ? EyeOff : Eye} />
                    <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28 }} onClick={() => copy(ev.value)} icon={Copy} />
                  </div>
                </td>
                <td>
                  <Button variant="ghost" size="sm" style={{ padding: 3, minWidth: 28, height: 28, color: 'var(--red)' }} onClick={() => remove(ev.key)} icon={Trash2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="KEY" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }} />
        <input className="form-input" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} style={{ flex: 2 }} />
        <Button variant="primary" size="sm" onClick={add} icon={saved ? Check : Plus}>
          {saved ? ' Saved' : ' Add'}
        </Button>
      </div>
    </div>
  );
}

// ── Deployments Panel ─────────────────────────────────────────────────────────
function DeploymentsPanel({ serviceId }) {
  const [deps, setDeps] = useState([]);
  const [open, setOpen] = useState(null);
  const logRef = useCallback(node => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  const fetchDeps = useCallback(() => {
    servicesApi.deployments(serviceId).then(d => {
      setDeps(d || []);
      // Auto-open the latest deployment
      if (d && d.length > 0 && open === null) setOpen(d[0].id);
    }).catch(() => { });
  }, [serviceId, open]);

  useEffect(() => {
    fetchDeps();
    // Poll faster (1.5s) if something is building
    const interval = setInterval(() => {
      servicesApi.deployments(serviceId).then(d => {
        setDeps(d || []);
      }).catch(() => { });
    }, 1500);
    return () => clearInterval(interval);
  }, [serviceId]);

  const isBuilding = deps.some(d => d.status === 'building' || d.status === 'deploying');

  const statusColor = {
    running: 'var(--green)',
    completed: 'var(--green)',
    building: 'var(--yellow)',
    deploying: 'var(--yellow)',
    error: 'var(--red)',
    idle: 'var(--text-muted)',
  };

  const statusLabel = {
    running: '✅ Running',
    completed: '✅ Completed',
    building: '🔨 Building...',
    deploying: '🚀 Deploying...',
    error: '❌ Failed',
    idle: '💤 Idle',
  };

  return (
    <div>
      {isBuilding && (
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '0.6rem 1rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.85rem',
          color: '#f59e0b',
        }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>⚙️</span>
          <strong>Build in progress</strong> — logs are updating live below…
        </div>
      )}

      {deps.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No deployments yet. Click <strong>Redeploy</strong> to start.
        </div>
      )}

      {deps.map(d => (
        <div key={d.id} className="card" style={{ marginBottom: '0.75rem', padding: 0, overflow: 'hidden', border: open === d.id ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          {/* Deployment header */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', cursor: 'pointer', background: 'var(--bg-card)' }}
            onClick={() => setOpen(open === d.id ? null : d.id)}
          >
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: statusColor[d.status] || 'var(--text-muted)',
              flexShrink: 0,
              boxShadow: (d.status === 'building' || d.status === 'deploying') ? `0 0 6px ${statusColor[d.status]}` : 'none',
            }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
              {statusLabel[d.status] || d.status}
            </span>
            {d.commit_sha && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(79,110,247,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                {d.commit_sha.slice(0, 7)}
              </span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              {new Date(d.started_at).toLocaleString()}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, transform: open === d.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
          </div>

          {/* Build log */}
          {open === d.id && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {d.log ? (
                <pre
                  ref={logRef}
                  style={{
                    margin: 0,
                    background: '#0a0d14',
                    padding: '1rem',
                    fontSize: '0.78rem',
                    color: '#a8d8a8',
                    overflow: 'auto',
                    maxHeight: 380,
                    fontFamily: 'JetBrains Mono, monospace',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                >
                  {d.log.split('\n').map((line, i) => {
                    let color = '#a8d8a8';
                    if (line.includes('❌') || line.includes('Error') || line.includes('error') || line.includes('failed')) color = '#ff6b6b';
                    else if (line.includes('✅') || line.includes('succeeded') || line.includes('complete')) color = '#51cf66';
                    else if (line.includes('⚠') || line.includes('warn')) color = '#ffd43b';
                    else if (line.includes('📥') || line.includes('📦') || line.includes('🔨') || line.includes('🚀')) color = '#74c0fc';
                    return <span key={i} style={{ color, display: 'block' }}>{line}</span>;
                  })}
                  {(d.status === 'building' || d.status === 'deploying') && (
                    <span style={{ color: '#f59e0b', display: 'block', marginTop: 4 }}>▌ Building...</span>
                  )}
                </pre>
              ) : (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                  {(d.status === 'building' || d.status === 'deploying') ? '⚙️ Starting build, logs will appear shortly...' : 'No log output.'}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Service Logo Component ───────────────────────────────────────────────────
function ServiceLogo({ type, name, image, builder, size = 18 }) {
  const imgLower = (image || '').toLowerCase();
  const builderLower = (builder || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();

  let logoKey = '';
  if (type === 'database') {
    if (imgLower.includes('postgres')) logoKey = 'postgres';
    else if (imgLower.includes('mysql')) logoKey = 'mysql';
    else if (imgLower.includes('maria')) logoKey = 'mariadb';
    else if (imgLower.includes('redis')) logoKey = 'redis';
    else if (imgLower.includes('mongo')) logoKey = 'mongo';
    else if (imgLower.includes('clickhouse')) logoKey = 'clickhouse';
    else if (imgLower.includes('keydb')) logoKey = 'keydb';
    else if (imgLower.includes('dragonfly')) logoKey = 'dragonfly';
    else logoKey = 'database';
  } else {
    if (imgLower.includes('wordpress') || nameLower.includes('wordpress')) logoKey = 'wordpress';
    else if (builderLower.includes('node') || nameLower.includes('node')) logoKey = 'node';
    else if (builderLower.includes('python') || nameLower.includes('python')) logoKey = 'python';
    else if (builderLower.includes('go') || nameLower.includes('go')) logoKey = 'go';
    else if (builderLower.includes('php') || nameLower.includes('php')) logoKey = 'php';
    else if (imgLower.includes('docker') || builderLower.includes('docker') || nameLower.includes('docker')) logoKey = 'docker';
    else logoKey = 'app';
  }

  switch (logoKey) {
    case 'postgres':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#336791" d="M110.2 59c-1.6-4.7-6.2-7.5-6.2-7.5s-2.9-2.3-9-4c-6-1.7-16-1.7-22.3 2-6.3 3.6-11.8 10.3-15.6 17.5-3.8 7.3-5.2 15-5.2 15s-2 6-8.3 8.3c-6.4 2.4-14.7 1.4-14.7 1.4S23 93 17 97.4c-6 4.3-8 9-8 9s12 1.6 22.8-5c10.7-6.7 15.6-14.5 15.6-14.5s4-4.8 11.2-5c7.2-.3 15 2.2 15 2.2s6 2.3 9.4 6.7c3.5 4.5 4.3 10.3 4.3 10.3s1.2 5.5 5.5 8c4.3 2.7 11.6 3 11.6 3s10-.4 14.7-4.6c4.6-4.2 5.6-10.4 5.6-10.4s1-5.7.5-12.7c-.5-7-2.6-14.6-4.6-18.7z" />
          <path fill="#FFF" d="M83.4 57.3c-.6-.7-1.4-1.2-2.3-1.4-1-.3-2 .2-2.5 1.1-.5.9-.3 2.1.4 2.8.7.7 1.7.9 2.6.7.9-.2 1.5-.9 1.8-1.7.2-.5.2-1 .1-1.5z" />
        </svg>
      );
    case 'mysql':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#00758F" d="M96.7 54.3c-1.4-3.4-3.5-6.5-6.2-9.1-3.6-3.4-7.9-6-12.6-7.8-8.2-3.1-17.1-4.2-25.8-3.1-4.4.5-8.7 1.6-12.7 3.2-3.2 1.3-6.2 3.1-8.7 5.3-2.6 2.3-4.6 5.1-6.1 8.2-1.4 3.1-2.2 6.5-2.2 9.9 0 4.1 1.1 8.1 3.2 11.7l1.5 2.4c.5.8 1.1 1.6 1.8 2.3 2.1 2.3 4.7 4.1 7.6 5.3 4.1 1.7 8.5 2.7 13 2.9 6.2.3 12.4-.6 18.2-2.8 4.2-1.6 8.1-3.9 11.4-6.8l3.1-2.9c3.3-3.3 5.9-7.2 7.7-11.5 1.4-3.4 2.2-7 2.2-10.7-.1-1.4-.4-2.8-1.4-4z" />
          <path fill="#F29111" d="M38.7 41.5c-3.1 1.5-6 3.6-8.4 6.1s-4.3 5.4-5.5 8.7c-1 2.7-1.4 5.6-1.2 8.5.1 2.3.6 4.6 1.4 6.7 1.3 3.3 3.3 6.3 5.9 8.8 2 2 4.4 3.5 7.1 4.5 3.3 1.2 6.8 1.8 10.3 1.8h3.3c3.4 0 6.9-.6 10.1-1.8 2.7-1 5.1-2.5 7.1-4.5 2.6-2.5 4.6-5.5 5.9-8.8.8-2.1 1.3-4.4 1.4-6.7.2-2.9-.2-5.8-1.2-8.5-1.2-3.3-3.1-6.2-5.5-8.7s-5.3-4.6-8.4-6.1c-3.2-1.5-6.7-2.3-10.2-2.3s-7 .8-10.1 2.3z" opacity="0.3" />
        </svg>
      );
    case 'mariadb':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#003545" d="M106.3 75.3c-.6-1.5-1.4-2.9-2.4-4.2-1.7-2.1-3.8-3.8-6.2-5-4.1-2.1-8.7-3-13.3-2.6-6 .5-11.7 2.6-16.7 6.1-4.1 2.9-7.5 6.6-9.9 10.9-2.1 3.7-3.2 7.8-3.2 12 0 4 .9 7.9 2.7 11.5l1 1.7c1.3 2.1 3.1 3.9 5.2 5.2 4.1 2.5 8.8 3.8 13.6 3.8h.3c5.3 0 10.5-1.6 14.9-4.6 3.7-2.5 6.7-5.8 8.7-9.7 1.7-3.3 2.6-7 2.6-10.8 0-4.1-1.1-8.1-3.2-11.7l-1.1-1.6z" />
          <path fill="#00E5FF" d="M60.7 35.3c-2.4 1.1-4.6 2.7-6.4 4.6s-3.2 4.2-4.1 6.7c-.8 2.1-1.1 4.3-1 6.5.1 1.8.5 3.5 1.1 5.1 1 2.5 2.5 4.8 4.5 6.7 1.5 1.5 3.3 2.7 5.4 3.5 2.5.9 5.2 1.4 7.9 1.4h2.5c2.6 0 5.3-.5 7.7-1.4 2.1-.8 3.9-2 5.4-3.5 2-1.9 3.5-4.2 4.5-6.7.6-1.6 1-3.3 1.1-5.1.1-2.2-.2-4.4-1-6.5-.9-2.5-2.4-4.8-4.1-6.7s-4-3.5-6.4-4.6c-2.5-1.1-5.1-1.7-7.8-1.7s-5.3.6-7.7 1.7z" />
        </svg>
      );
    case 'redis':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#D82C20" d="M64 8l54 31v44L64 120 10 83V39L64 8z" />
          <path fill="#A31F17" d="M64 8L10 39v44l54 37V8z" opacity="0.15" />
          <path fill="#FFF" d="M64 35l36 21v21L64 98 28 77V56l36-21z" opacity="0.3" />
          <path fill="#D82C20" d="M64 45L88 59v14L64 87 40 73V59l24-14z" />
        </svg>
      );
    case 'mongo':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#13AA52" d="M64.4 12.5c0 0-25.5 30-22.3 59.7 3.2 29.8 22.3 43.3 22.3 43.3s19.1-13.5 22.3-43.3c3.2-29.7-22.3-59.7-22.3-59.7zm-2.7 17.5c-.3 15-4.5 45.4-.5 73.1C55 84.7 48 57.3 61.7 30zm5.4 0c13.7 27.3 6.7 54.7.5 73.1 4-27.7-.2-58.1-.5-73.1z" />
          <path fill="#118D4B" d="M64.4 12.5v103s19.1-13.5 22.3-43.3c3.2-29.7-22.3-59.7-22.3-59.7z" opacity="0.15" />
        </svg>
      );
    case 'clickhouse':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <rect x="20" y="20" width="16" height="88" fill="#FCAA08" rx="2" />
          <rect x="44" y="20" width="16" height="52" fill="#FCAA08" rx="2" />
          <rect x="68" y="20" width="16" height="88" fill="#F04F23" rx="2" />
          <rect x="92" y="20" width="16" height="70" fill="#F04F23" rx="2" />
        </svg>
      );
    case 'keydb':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <rect x="14" y="14" width="100" height="100" rx="20" fill="#202538" />
          <circle cx="64" cy="40" r="22" stroke="#4F6EF7" strokeWidth="8" fill="none" />
          <path d="M64 62v46h16v-12h-8v-8h8v-8H64z" fill="#4F6EF7" />
          <path d="M64 25l-12 25h12l-6 18 18-28h-12z" fill="#F59E0B" />
        </svg>
      );
    case 'dragonfly':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <circle cx="64" cy="64" r="54" fill="#FEF2F2" />
          <path d="M64 25c-2 0-3 10-3 30s1 45 3 45 3-25 3-45-1-30-3-30z" fill="#EF4444" />
          <path d="M64 50c0-1-15-8-35-8s-20 4-20 4 5 4 20 4 35-3 35-4zm0 0c0-1 15-8 35-8s20 4 20 4-5 4-20 4-35-3-35-4z" fill="#F87171" opacity="0.8" />
        </svg>
      );
    case 'node':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#339933" d="M115.4 35.8L66.7 7.7c-1.7-1-3.8-1-5.5 0L12.6 35.8c-1.7 1-2.8 2.8-2.8 4.8v56.2c0 2 1.1 3.8 2.8 4.8l48.6 28.1c1.7 1 3.8 1 5.5 0l48.6-28.1c1.7-1 2.8-2.8 2.8-4.8V40.6c.1-2-1-3.8-2.7-4.8zM64 113.8V82.3c-.9-.4-1.7-1-2.4-1.7L43.8 62.9c-1.8-1.8-1.8-4.7 0-6.5l17.8-17.8c.7-.7 1.5-1.2 2.4-1.6V5.5c2 0 4 .5 5.7 1.5l48.6 28.1c1.7 1 2.8 2.8 2.8 4.8v56.2c0 2-1.1 3.8-2.8 4.8L74.8 129c-1.8 1-3.8 1-5.5.1V113.8c-.8 0-1.6-.2-2.3-.6-1.2-.5-2.2-1.4-3-2.5z" />
        </svg>
      );
    case 'python':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#3776AB" d="M64 8c-15.6 0-24.8 6.8-24.8 21.2v9.3h25.4V42H39.2C23.6 42 16 49.6 16 65.2c0 15.6 7.1 22.1 20.3 22.1h6.9v-9.7c0-11 8.9-19.9 19.9-19.9h25.7V34c0-14.4-12.8-26-24.8-26zm-11.7 8.3c2.4 0 4.3 1.9 4.3 4.3s-1.9 4.3-4.3 4.3-4.3-1.9-4.3-4.3 1.9-4.3 4.3-4.3z" />
          <path fill="#FFE052" d="M64 120c15.6 0 24.8-6.8 24.8-21.2v-9.3H63.4v-3.5h25.4C104.4 86 112 78.4 112 62.8c0-15.6-7.1-22.1-20.3-22.1h-6.9v9.7c0 11-8.9 19.9-19.9 19.9H39.2V94c0 14.4 12.8 26 24.8 26zm11.7-8.3c-2.4 0-4.3-1.9-4.3-4.3s1.9-4.3 4.3-4.3 4.3 1.9 4.3 4.3-1.9 4.3-4.3 4.3z" />
        </svg>
      );
    case 'go':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <rect width="128" height="128" rx="24" fill="#00ADD8" />
          <text x="64" y="86" fill="#FFF" fontSize="52" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">GO</text>
        </svg>
      );
    case 'php':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <ellipse cx="64" cy="64" rx="58" ry="38" fill="#777BB4" />
          <text x="64" y="76" fill="#FFF" fontSize="36" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">PHP</text>
        </svg>
      );
    case 'docker':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#2496ED" d="M123.6 57.6c-.6-.4-1.3-.7-2.1-.9-.8-.2-1.7-.2-2.5 0-1.8.5-3.4 1.7-4.4 3.2-1 1.5-1.4 3.3-1.2 5.1.2 1.8 1.1 3.4 2.5 4.5s3.2 1.5 5 1.1c1.8-.4 3.3-1.5 4.2-3.1.9-1.6 1.1-3.4 0.6-5.1-.3-1.8-1.2-3.4-2.1-4.8zM106.8 62.4c-4.2-3.4-9.3-5.3-14.7-5.3H87c-1 0-1.9.4-2.6 1.1-.7.7-1.1 1.6-1.1 2.6v17c0 4.1-1.6 8-4.6 11-2.9 2.9-6.9 4.6-11 4.6H54c-1.5 0-2.9-.6-4-1.7-1-1-1.7-2.5-1.7-4v-6.3c0-1-.4-1.9-1.1-2.6-.7-.7-1.6-1.1-2.6-1.1H29.3c-2.3 0-4.5 1-6 2.7-1.5 1.7-2.3 4-2.3 6.3V91c0 8 3.2 15.6 8.8 21.2 5.6 5.6 13.2 8.8 21.2 8.8h25.4c11.3 0 22.2-4.5 30.2-12.5s12.5-18.9 12.5-30.2v-11c0-1.5-.6-2.9-1.7-4-1.1-1.1-2.6-1.7-4.1-1.7l-6 .1z" />
          <rect x="26" y="32" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="42" y="32" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="58" y="32" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="74" y="32" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="34" y="16" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="50" y="16" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="66" y="16" width="12" height="12" fill="#2496ED" rx="2" />
          <rect x="58" y="0" width="12" height="12" fill="#2496ED" rx="2" />
        </svg>
      );
    case 'wordpress':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <circle cx="64" cy="64" r="58" fill="#21759B" />
          <path fill="#FFF" d="M64 12C35.3 12 12 35.3 12 64s23.3 52 52 52 52-23.3 52-52S92.7 12 64 12zm0 10c8.2 0 15.8 2.3 22.3 6.3l-16 43.7L57.2 38.6c1.8-1 3.8-1.6 6.8-1.6 1.2 0 1.8-.4 1.8-1s-.6-1-2.2-1h-12c-1.6 0-2.2.4-2.2 1s.6 1 1.8 1c2.4 0 3.7.8 5 4.3l10 27.6-13.6 37L35.7 45.4c1-.4 2-.6 3.3-.6 1.2 0 1.8-.4 1.8-1s-.6-1-2.2-1h-8.8c-1.6 0-2.2.4-2.2 1s.6 1 1.8 1c2.2 0 3.2.4 4.5 4.2l12 36-9 24.6C29.3 98.4 22 82 22 64c0-23.2 18.8-42 42-42zm3 90C45.3 102 29 84.8 29 64.6c0-1.8.2-3.6.5-5.3l23 63C55.4 102.3 59 102 67 102zm7.6-32.3c2.4-7.3 4.2-14.7 6.4-22.3.8-2.6 1.4-4 2.8-4 1 0 1.6.4 1.6 1s-.4 1-1 2.8c-1.6 5.3-3.2 10.6-5 16l8.8 24.7C99.2 102.8 106 84.2 106 64c0-19.4-13-35.8-31-40.6l23.5 64.5c2-6 3.6-12 5-18 1-3.6 1.6-5 3.3-5 1.2 0 1.8-.4 1.8-1s-.6-1-2.2-1h-8.8c-1.6 0-2.2.4-2.2 1s.6 1 1.8 1c2 0 2.8.4 3.7 3.4l-7.3 22-8.3-25.4c1.2-3 2-3 3.6-3 1.2 0 1.8-.4 1.8-1s-.6-1-2.2-1H67c-1.6 0-2.2.4-2.2 1s.6 1 1.8 1c2 0 2.7.2 3.8 3.3l12 36.7-7.8 21.8z" />
        </svg>
      );
    default:
      return type === 'database' ? <Database size={size} color="var(--accent)" /> : <Package size={size} color="var(--accent)" />;
  }
}

// ── Resource Icon Component ──────────────────────────────────────────────────
function ResourceIcon({ type, size = 18 }) {
  if (type === 'postgres') return <ServiceLogo type="database" image="postgres" size={size} />;
  if (type === 'mysql') return <ServiceLogo type="database" image="mysql" size={size} />;
  if (type === 'mariadb') return <ServiceLogo type="database" image="mariadb" size={size} />;
  if (type === 'redis') return <ServiceLogo type="database" image="redis" size={size} />;
  if (type === 'keydb') return <ServiceLogo type="database" image="keydb" size={size} />;
  if (type === 'dragonfly') return <ServiceLogo type="database" image="dragonfly" size={size} />;
  if (type === 'mongo') return <ServiceLogo type="database" image="mongo" size={size} />;
  if (type === 'clickhouse') return <ServiceLogo type="database" image="clickhouse" size={size} />;

  if (type === 'git-public') return <Globe size={size} color="var(--accent)" />;
  if (type === 'local-folder') return <Folder size={size} color="var(--accent)" />;
  if (type === 'wordpress') return <ServiceLogo type="app" image="wordpress" size={size} />;
  if (type === 'python-template') return <ServiceLogo type="app" builder="python" size={size} />;
  if (type === 'node-template') return <ServiceLogo type="app" builder="node" size={size} />;
  if (type === 'git-private-app') return <Key size={size} color="var(--accent)" />;
  if (type === 'git-private-key') return <Lock size={size} color="var(--accent)" />;
  if (type === 'dockerfile') return <FileCode size={size} color="var(--accent)" />;
  if (type === 'docker-compose') return <Sliders size={size} color="var(--accent)" />;
  if (type === 'docker-image') return <ServiceLogo type="app" image="docker" size={size} />;

  return <Package size={size} color="var(--accent)" />;
}

// ── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({ svc, onDeploy, onDelete }) {
  const [deploying, setDeploying] = useState(false);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)' };

  const handleDeploy = async (e) => {
    e.stopPropagation();
    setDeploying(true);
    try { await onDeploy(svc.id); } finally { setDeploying(false); }
  };

  return (
    <div className="card hover-glow" style={{ padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ServiceLogo type={svc.type} name={svc.name} image={svc.image} builder={svc.git_builder} size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{svc.name}</span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[svc.status] || 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.8rem', color: statusColor[svc.status] || 'var(--text-muted)', textTransform: 'capitalize' }}>{svc.status}</span>
            {svc.type === 'database' && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{svc.image || 'database'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: '0.8125rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {svc.git_repo_url && <span><GitBranch size={11} style={{ display: 'inline' }} /> {svc.git_repo_url.replace('https://github.com/', '')}</span>}
            {svc.port > 0 && <span><Globe size={11} style={{ display: 'inline' }} /> :{svc.port}</span>}
          </div>
          {svc.status === 'running' && svc.cpu_percent !== undefined && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(79,110,247,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                <Cpu size={11} style={{ color: 'var(--accent)' }} />
                CPU: <strong style={{ color: 'var(--text-primary)' }}>{(svc.cpu_percent || 0).toFixed(1)}%</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(79,110,247,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                <Database size={11} style={{ color: 'var(--accent)' }} />
                RAM: <strong style={{ color: 'var(--text-primary)' }}>{svc.memory_usage || '0 B'}</strong>
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Button variant="primary" size="sm" onClick={handleDeploy} disabled={deploying} loading={deploying} icon={Play}>
            {svc.type === 'database' ? 'Recreate' : 'Deploy'}
          </Button>
          <Button variant="ghost" size="sm" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); onDelete(svc.id); }} icon={Trash2} />
        </div>
      </div>
    </div>
  );
}

// ── Container Logs Panel ──────────────────────────────────────────────────────
function ContainerLogsPanel({ serviceId }) {
  const [logs, setLogs] = useState('Fetching container logs...');

  const fetchLogs = useCallback(async () => {
    try {
      const res = await servicesApi.getLogs(serviceId);
      setLogs(res.logs || 'No runtime logs found. Container might be stopped or starting.');
    } catch (err) {
      setLogs(`Error: ${err.message}`);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Runtime Container Logs</span>
        <Button variant="ghost" size="sm" onClick={fetchLogs} icon={RefreshCw}>Refresh</Button>
      </div>
      <pre style={{
        background: '#0d1117',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem',
        fontSize: '0.875rem',
        lineHeight: 1.6,
        color: '#e2e8f0',
        overflow: 'auto',
        maxHeight: 320,
        fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
        whiteSpace: 'pre-wrap',
      }}>
        {logs}
      </pre>
    </div>
  );
}

// ── Webhook Panel ─────────────────────────────────────────────────────────────
function WebhookPanel({ serviceId }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${window.location.origin}/api/webhooks/${serviceId}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Automatic Deployments Webhook</h4>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Configure a webhook in your repository provider to trigger automatic builds and deployments on every Git push event.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          readOnly
          className="form-input"
          value={webhookUrl}
          style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', flex: 1 }}
        />
        <Button variant="ghost" size="sm" onClick={copyToClipboard} style={{ height: 38, width: 38 }} icon={copied ? Check : Copy} />
      </div>

      <div className="card" style={{ padding: '1rem', background: 'rgba(79,110,247,0.04)', border: '1px solid rgba(79,110,247,0.08)', borderRadius: 8 }}>
        <h5 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🛠️</span> How to configure GitHub Webhooks
        </h5>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Go to your repository on <strong>GitHub</strong>.</li>
          <li>Navigate to <strong>Settings</strong> &rarr; <strong>Webhooks</strong> in the sidebar.</li>
          <li>Click the <strong>Add webhook</strong> button on the right.</li>
          <li>Paste the Payload URL copied above into the <strong>Payload URL</strong> input field.</li>
          <li>Set Content type to <strong>application/json</strong>.</li>
          <li>Set triggering events to <strong>Just the push event</strong>.</li>
          <li>Click the green <strong>Add webhook</strong> button to save.</li>
        </ol>
      </div>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ service, project, domains = [], onUpdate }) {
  const [name, setName] = useState(service.name);
  const [image, setImage] = useState(service.image || '');
  const [port, setPort] = useState(service.port || '');
  const [gitUrl, setGitUrl] = useState(service.git_repo_url || '');
  const [branch, setBranch] = useState(service.git_branch || 'main');
  const [gitBuilder, setGitBuilder] = useState(service.git_builder || 'auto');
  const [appDirectory, setAppDirectory] = useState(service.app_directory || '');
  const [runFile, setRunFile] = useState(service.run_file || '');
  const [requirementsFile, setRequirementsFile] = useState(service.requirements_file || 'requirements.txt');
  const [useVenv, setUseVenv] = useState(service.use_venv !== false);
  const [startCommand, setStartCommand] = useState(service.start_command || '');
  const [installCommand, setInstallCommand] = useState(service.install_command || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Domains & Direction handling
  const [domainVal, setDomainVal] = useState('');
  const [direction, setDirection] = useState('both');

  useEffect(() => {
    setName(service.name);
    setImage(service.image || '');
    setPort(service.port || '');
    setGitUrl(service.git_repo_url || '');
    setBranch(service.git_branch || 'main');
    setGitBuilder(service.git_builder || 'auto');
    setAppDirectory(service.app_directory || '');
    setRunFile(service.run_file || '');
    setRequirementsFile(service.requirements_file || 'requirements.txt');
    setUseVenv(service.use_venv !== false);
    setStartCommand(service.start_command || '');
    setInstallCommand(service.install_command || '');

    const matched = domains.find(d => d.service === service.name && d.project === project?.name);
    setDomainVal(matched ? matched.domain : '');
    setDirection(matched && matched.direction ? matched.direction : 'both');
  }, [service, domains, project]);

  const handleGenerateDomain = () => {
    const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const host = window.location.hostname;
    const cleanHost = host.split(':')[0];
    setDomainVal(`http://${randomStr}.${cleanHost}.sslip.io`);
  };

  const handleSetDirection = async () => {
    const cleanNewDomain = domainVal.trim().replace(/^https?:\/\//, '');
    if (!cleanNewDomain) {
      setError('Please specify a domain before setting direction');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      if (matched) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      } else {
        await domainsApi.create({
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      setError(err.message || 'Failed to set direction');
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await servicesApi.update(service.id, {
        name: name.trim(),
        image: image.trim(),
        port: Number(port) || 0,
        git_repo_url: gitUrl.trim(),
        git_branch: branch.trim(),
        git_builder: gitBuilder,
        app_directory: appDirectory.trim(),
        run_file: runFile.trim(),
        requirements_file: requirementsFile.trim() || 'requirements.txt',
        use_venv: !!useVenv,
        start_command: startCommand.trim(),
        install_command: installCommand.trim(),
      });

      // Update domain and direction in domains_v2 if modified
      const matched = domains.find(d => d.service === service.name && d.project === project?.name);
      const cleanNewDomain = domainVal.trim().replace(/^https?:\/\//, ''); // strip protocol
      const cleanOldDomain = matched ? matched.domain : '';

      if (cleanNewDomain !== cleanOldDomain) {
        if (matched) {
          await domainsApi.delete(matched.id);
        }
        if (cleanNewDomain) {
          await domainsApi.create({
            domain: cleanNewDomain,
            service: service.name,
            project: project?.name || 'Production',
            direction: direction
          });
        }
      } else if (matched && matched.direction !== direction) {
        await domainsApi.update(matched.id, {
          domain: cleanNewDomain,
          service: service.name,
          project: project?.name || 'Production',
          direction: direction
        });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: '0.75rem' }}>Resource Name</label>
        <input className="form-input form-input-sm" value={name} onChange={e => setName(e.target.value)} />
      </div>

      {service.type === 'database' ? (
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Engine</label>
          <input className="form-input form-input-sm" value={image} onChange={e => setImage(e.target.value)} placeholder="e.g. postgres, redis, mysql" />
        </div>
      ) : (
        <>
          {gitUrl ? (
            <>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Source URL / Local Folder</label>
                <input className="form-input form-input-sm" value={gitUrl} onChange={e => setGitUrl(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Branch</label>
                <input className="form-input form-input-sm" value={branch} onChange={e => setBranch(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Build Type / Runtime</label>
                <select className="form-input form-input-sm" value={gitBuilder} onChange={e => setGitBuilder(e.target.value)}>
                  <option value="auto">Auto-detect (Recommended)</option>
                  <option value="node">Node.js</option>
                  <option value="go">Go (Golang)</option>
                  <option value="python">Python</option>
                  <option value="php">PHP</option>
                  <option value="static">HTML / Static Website</option>
                  <option value="dockerfile">Use existing Dockerfile</option>
                </select>
              </div>
              <div style={{ background: 'rgba(79,110,247,0.06)', border: '1px solid rgba(79,110,247,0.18)', borderRadius: 8, padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Changing runtime fields affects the next deploy. Use App Directory when the app lives inside a subfolder, and Run File for Python files like ecopulse.py.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>App Directory</label>
                  <input className="form-input form-input-sm" value={appDirectory} onChange={e => setAppDirectory(e.target.value)} placeholder="Blank for source root" />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Run File</label>
                  <input className="form-input form-input-sm" value={runFile} onChange={e => setRunFile(e.target.value)} placeholder="ecopulse.py" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Requirements File</label>
                  <input className="form-input form-input-sm" value={requirementsFile} onChange={e => setRequirementsFile(e.target.value)} placeholder="requirements.txt" />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Command Override</label>
                  <input className="form-input form-input-sm" value={startCommand} onChange={e => setStartCommand(e.target.value)} placeholder="python ecopulse.py" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Install Command Override</label>
                <input className="form-input form-input-sm" value={installCommand} onChange={e => setInstallCommand(e.target.value)} placeholder="pip install --no-cache-dir -r requirements.txt" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                <input type="checkbox" checked={useVenv} onChange={e => setUseVenv(e.target.checked)} />
                Generate Python virtual environment during build
              </label>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Docker Image</label>
              <input className="form-input form-input-sm" value={image} onChange={e => setImage(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Port</label>
            <input className="form-input form-input-sm" value={port} onChange={e => setPort(e.target.value)} placeholder="80" />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              Domains
              <span style={{ cursor: 'help', color: 'var(--text-muted)' }} title="Add custom domains. Point your DNS A record to your server IP.">ℹ️</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input form-input-sm"
                value={domainVal}
                onChange={e => setDomainVal(e.target.value)}
                placeholder="e.g. app.yourdomain.com"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleGenerateDomain}
                style={{ border: '1px solid var(--border)', height: 32, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                Generate Domain
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              Direction *
              <span style={{ cursor: 'help', color: 'var(--text-muted)' }} title="Select how requests to www and non-www subdomains are handled.">ℹ️</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="form-input form-input-sm"
                value={direction}
                onChange={e => setDirection(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="both">Allow www & non-www.</option>
                <option value="www">Redirect to www</option>
                <option value="non-www">Redirect to non-www</option>
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleSetDirection}
                style={{ border: '1px solid var(--border)', height: 32, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              >
                Set Direction
              </button>
            </div>
          </div>
        </>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>⚠️ {error}</div>}
      {success && <div style={{ color: 'var(--green)', fontSize: '0.75rem' }}>✓ Settings saved successfully!</div>}

      <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} loading={saving} style={{ marginTop: 6, alignSelf: 'flex-end' }}>
        Save Settings
      </Button>
    </div>
  );
}

// ── Main ProjectDetail ────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [services, setServices] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('deployments');
  const [activeSvc, setActiveSvc] = useState(null);

  const load = useCallback(async () => {
    try {
      const [proj, svcs, doms] = await Promise.all([
        projectsApi.get(id),
        servicesApi.listByProject(id),
        domainsApi.list(),
      ]);
      setProject(proj?.data || proj);
      setServices(svcs || []);
      setDomains(doms?.data || doms || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const handleDeploy = async (svcId) => {
    const svc = services.find(s => s.id === svcId);
    if (svc?.type === 'app') {
      const existing = domains.find(d => d.service === svc.name && d.project === project?.name);
      if (!existing) {
        const host = window.location.hostname.split(':')[0];
        const randomStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
        try {
          await domainsApi.create({
            domain: `${randomStr}.${host}.sslip.io`,
            service: svc.name,
            project: project?.name || '',
            direction: 'both',
          });
        } catch (_) { }
      }
    }
    await servicesApi.deploy(svcId);
    setActiveTab('deployments');
    setTimeout(load, 500);
  };

  const handleStop = async (svcId) => {
    try {
      await servicesApi.stop(svcId);
      setTimeout(load, 500);
    } catch (e) { console.error(e); }
  };

  const handleRestart = async (svcId) => {
    try {
      await servicesApi.restart(svcId);
      setActiveTab('logs');
      setTimeout(load, 500);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (svcId) => {
    if (!confirm('Delete this service? This will stop and remove its container.')) return;
    await servicesApi.delete(svcId);
    setServices(s => s.filter(x => x.id !== svcId));
    if (activeSvc === svcId) setActiveSvc(null);
  };

  const handleCreated = (svc) => {
    setServices(s => [svc, ...s]);
    setShowModal(false);
    setActiveSvc(svc.id);
    setActiveTab('deployments');
  };

  const apps = services.filter(s => s.type === 'app');
  const dbs = services.filter(s => s.type === 'database');
  const selectedSvc = services.find(s => s.id === activeSvc);
  const statusColor = { running: 'var(--green)', deploying: 'var(--yellow)', error: 'var(--red)', idle: 'var(--text-muted)', creating: 'var(--yellow)' };

  if (loading) return <div className="page-content"><div className="spinner" /></div>;

  if (activeSvc && selectedSvc) {
    const matchedDomain = domains.find(d => d.service === selectedSvc.name && d.project === project?.name);
    const serviceUrl = matchedDomain
      ? (matchedDomain.domain.startsWith('http') ? matchedDomain.domain : `http://${matchedDomain.domain}`)
      : (selectedSvc.port > 0 && selectedSvc.type === 'app' ? `http://${window.location.hostname}:${selectedSvc.port}` : null);

    return (
      <div className="page-content fade-in">
        {/* Resource Header */}
        <div className="page-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setActiveSvc(null)} style={{ padding: '2px 8px', color: 'var(--accent)' }}>
                &larr; Projects
              </Button>
              <ChevronRight size={14} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{project?.name}</span>
              <ChevronRight size={14} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>{selectedSvc.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>localhost</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[selectedSvc.status] || 'var(--text-muted)', display: 'inline-block', marginLeft: 8 }} />
              <span style={{ fontSize: '0.78rem', color: statusColor[selectedSvc.status] || 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{selectedSvc.status}</span>
            </div>
            <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>Type: <strong style={{ color: 'var(--text-primary)' }}>{selectedSvc.type === 'database' ? `${selectedSvc.image || 'Database'}` : 'Application'}</strong></span>
              {selectedSvc.git_repo_url && (
                <span>&bull;&nbsp;&nbsp;Repository: <strong style={{ color: 'var(--text-primary)' }}>{selectedSvc.git_repo_url.replace('https://github.com/', '')} ({selectedSvc.git_branch})</strong></span>
              )}
              {selectedSvc.port > 0 && (
                <span>&bull;&nbsp;&nbsp;Container Port: <strong style={{ color: 'var(--text-primary)' }}>:{selectedSvc.port}</strong></span>
              )}
              {serviceUrl && (
                <>
                  <span>&bull;&nbsp;&nbsp;Access URL:</span>
                  <a href={serviceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(79,110,247,0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, textDecoration: 'none', fontWeight: 500, fontSize: '0.78rem' }}>
                    <ExternalLink size={11} /> {serviceUrl}
                  </a>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="solid" color="amber" size="sm" onClick={() => handleDeploy(selectedSvc.id)} icon={Play} style={{ fontWeight: 600 }}>
              Redeploy
            </Button>
            <Button variant="outline" color="amber" size="sm" onClick={() => handleRestart(selectedSvc.id)} icon={RefreshCw}>
              Restart
            </Button>
            {selectedSvc.status === 'running' && (
              <Button variant="outline" color="red" size="sm" onClick={() => handleStop(selectedSvc.id)} icon={X}>
                Stop
              </Button>
            )}
            <Button variant="ghost" size="sm" style={{ color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => handleDelete(selectedSvc.id)} icon={Trash2}>
              Delete
            </Button>
          </div>
        </div>

        {/* Full-width Details Panel */}
        <div className="card hover-glow" style={{ padding: '1.5rem', minHeight: '400px' }}>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            items={[
              { id: 'deployments', label: 'Deployments' },
              { id: 'logs', label: 'Logs' },
              ...(selectedSvc.git_repo_url ? [{ id: 'webhooks', label: 'Webhooks' }] : []),
              { id: 'envvars', label: 'Environment Variables' },
              { id: 'settings', label: 'Settings', icon: Settings },
            ]}
          >
            <TabsContent value="deployments">
              <DeploymentsPanel serviceId={activeSvc} />
            </TabsContent>
            <TabsContent value="logs">
              <ContainerLogsPanel serviceId={activeSvc} />
            </TabsContent>
            {selectedSvc.git_repo_url && (
              <TabsContent value="webhooks">
                <WebhookPanel serviceId={activeSvc} />
              </TabsContent>
            )}
            <TabsContent value="settings">
              <SettingsPanel service={selectedSvc} project={project} domains={domains} onUpdate={load} />
            </TabsContent>
            <TabsContent value="envvars">
              <EnvVarsPanel serviceId={activeSvc} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Projects</span>
            <ChevronRight size={14} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{project?.name}</span>
          </div>
          <p className="page-subtitle">{project?.description || 'Project environment'}</p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)} icon={Plus}>New Resource</Button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Applications', val: apps.length, icon: Package, color: 'var(--accent)' },
          { label: 'Databases', val: dbs.length, icon: Database, color: 'var(--blue)' },
          { label: 'Running', val: services.filter(s => s.status === 'running').length, icon: Play, color: 'var(--green)' },
        ].map(st => (
          <div key={st.label} className="card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${st.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <st.icon size={18} color={st.color} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{st.val}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: activeSvc ? '1fr 380px' : '1fr', gap: '1rem' }}>
        {/* Left: service list */}
        <div>
          {apps.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Applications</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {apps.map(s => (
                  <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('deployments'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                    <ServiceCard svc={s} onDeploy={handleDeploy} onDelete={handleDelete} />
                  </div>
                ))}
              </div>
            </>
          )}

          {dbs.length > 0 && (
            <>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Databases</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dbs.map(s => (
                  <div key={s.id} onClick={() => { setActiveSvc(s.id); setActiveTab('deployments'); }} style={{ cursor: 'pointer', outline: activeSvc === s.id ? '1px solid var(--accent)' : 'none', borderRadius: 'var(--radius-lg)' }}>
                    <ServiceCard svc={s} onDeploy={handleDeploy} onDelete={handleDelete} />
                  </div>
                ))}
              </div>
            </>
          )}

          {services.length === 0 && (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="empty-icon" style={{ margin: '0 auto 1rem' }}><Package size={28} /></div>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 8 }}>No resources yet</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Add an app or database to get started</p>
              <Button variant="primary" onClick={() => setShowModal(true)} icon={Plus}>Add Resource</Button>
            </div>
          )}
        </div>
      </div>

      <AddServiceModal
        projectId={id}
        projectName={project?.name}
        open={showModal}
        onOpenChange={setShowModal}
        onCreated={handleCreated}
      />
    </div>
  );
}
