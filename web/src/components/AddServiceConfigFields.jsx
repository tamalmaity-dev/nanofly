import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Info, RefreshCw } from 'lucide-react';
import CodeEditor from './CodeEditor';
import { ResourceIcon } from './ServiceLogo';
import { SelectRoot, SelectTrigger, SelectContent, SelectItem } from './ui/Select';
import { buildWordPressEnvTemplate, generateSecurePassword, generateRandomIdent } from '../utils/password';
import { githubApi, servicesApi } from '../api/client';

const RUNTIME_VERSIONS = {
  node: [
    { value: 'node:24-alpine', label: 'Node.js 24 Alpine (Latest)' },
    { value: 'node:22-alpine', label: 'Node.js 22 Alpine (Recommended)' },
    { value: 'node:20-alpine', label: 'Node.js 20 (LTS)' },
    { value: 'node:18-alpine', label: 'Node.js 18 (LTS)' },
  ],
  python: [
    { value: 'python:3.11-slim', label: 'Python 3.11 Slim (Recommended)' },
    { value: 'python:3.12-slim', label: 'Python 3.12 Slim' },
    { value: 'python:3.13-slim', label: 'Python 3.13 Slim' },
    { value: 'python:3.11-alpine', label: 'Python 3.11 Alpine' },
    { value: 'python:3.12-alpine', label: 'Python 3.12 Alpine' },
  ],
  go: [
    { value: 'golang:1.23-alpine', label: 'Go 1.23 (Latest)' },
    { value: 'golang:1.22-alpine', label: 'Go 1.22 (Recommended)' },
    { value: 'golang:1.21-alpine', label: 'Go 1.21' },
  ],
  php: [
    { value: 'php:8.5-apache', label: 'PHP 8.5 Apache (Latest)' },
    { value: 'php:8.4-apache', label: 'PHP 8.4 Apache (Recommended)' },
    { value: 'php:8.3-apache', label: 'PHP 8.3 Apache (LTS)' },
    { value: 'php:8.2-apache', label: 'PHP 8.2 Apache' },
    { value: 'php:8.1-apache', label: 'PHP 8.1 Apache' },
  ],
};

export const WORDPRESS_VERSIONS = [
  { value: 'wordpress:php8.5-apache', label: 'PHP 8.5 — Apache (Latest)' },
  { value: 'wordpress:php8.4-apache', label: 'PHP 8.4 — Apache (Recommended)' },
  { value: 'wordpress:php8.3-apache', label: 'PHP 8.3 — Apache (LTS)' },
  { value: 'wordpress:php8.2-apache', label: 'PHP 8.2 — Apache' },
  { value: 'wordpress:php8.1-apache', label: 'PHP 8.1 — Apache' },
];

export const WORDPRESS_ENV_TEMPLATE = buildWordPressEnvTemplate();

export const DOCKERFILE_TEMPLATES = {
  node: `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`,
  python: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]`,
  go: `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/main .
EXPOSE 8080
CMD ["./main"]`,
  php: `FROM php:8.2-apache
WORKDIR /var/www/html
COPY . .
EXPOSE 80
CMD ["apache2-foreground"]`,
  generic: `FROM alpine:3.19
WORKDIR /app
COPY . .
EXPOSE 8080
CMD ["./start.sh"]`,
};

const DEFAULT_COMPOSE = `version: "3.8"
services:
  app:
    build: .
    ports:
      - "8080:8080"
    restart: unless-stopped`;

export const parseBuilderValue = (val) => {
  if (!val || val === 'auto' || val === 'dockerfile' || val === 'docker-compose' || val === 'nixpacks' || val === 'static') {
    return { type: val || 'auto', version: val || '' };
  }
  if (val.includes(':')) {
    const parts = val.split(':');
    let type = parts[0];
    if (type === 'golang') type = 'go';
    return { type, version: val };
  }
  return { type: val, version: val };
};

/** Reset form fields when user picks a resource card */
export function getResourceFormDefaults(resource) {
  const path = `/opt/nanofly/apps/${resource.defaultName || 'app'}`;
  const shared = {
    appDirectory: '',
    runFile: '',
    startCommand: '',
    installCommand: '',
    dockerArgs: '',
    dockerfileContent: '',
    dockerComposeContent: '',
    requirementsFile: 'requirements.txt',
    useVenv: false,
    gitUrl: '',
    branch: 'main',
    token: '',
    sshKey: '',
    githubAppId: '',
  };

  switch (resource.id) {
    case 'node-template':
      return {
        ...shared,
        gitBuilder: 'node:22-alpine',
        port: '3000',
        localPath: path,
        runFile: 'index.js',
        startCommand: 'npm start',
        installCommand: 'if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi',
      };
    case 'python-template':
      return {
        ...shared,
        gitBuilder: 'python:3.11-slim',
        port: '8000',
        localPath: path,
        runFile: 'app.py',
        requirementsFile: 'requirements.txt',
        useVenv: true,
        installCommand: 'pip install --no-cache-dir -r requirements.txt',
      };
    case 'local-folder':
      return { ...shared, gitBuilder: 'auto', port: '', localPath: '' };
    case 'dockerfile':
      return {
        ...shared,
        gitBuilder: 'dockerfile',
        port: '8080',
        localPath: path,
        dockerfileContent: DOCKERFILE_TEMPLATES.generic,
      };
    case 'docker-compose':
      return {
        ...shared,
        gitBuilder: 'docker-compose',
        port: '8080',
        localPath: path,
        dockerComposeContent: DEFAULT_COMPOSE,
      };
    case 'wordpress': {
      const initPass = generateSecurePassword(24);
      const initUser = generateRandomIdent('wpuser_', 6);
      const initDbName = generateRandomIdent('wpdb_', 6);
      return {
        ...shared,
        port: '0',
        dbUser: initUser,
        dbName: initDbName,
        dbPassword: initPass,
        envText: `WORDPRESS_DB_HOST=host.docker.internal:3306
WORDPRESS_DB_USER=${initUser}
WORDPRESS_DB_PASSWORD=${initPass}
WORDPRESS_DB_NAME=${initDbName}
WORDPRESS_TABLE_PREFIX=wp_`,
      };
    }
    case 'docker-image':
      return { ...shared, port: '80' };
    default:
      if (resource.subType === 'github') {
        return { ...shared, gitBuilder: 'auto', port: '3000' };
      }
      return shared;
  }
}

function ConfigSection({ title, desc, children }) {
  return (
    <div
      style={{
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
        {desc && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function BuilderTypeSelect({ value, onChange, lockTo }) {
  const types = lockTo
    ? [{ id: lockTo, label: lockTo === 'dockerfile' ? 'Dockerfile' : lockTo === 'docker-compose' ? 'Docker Compose' : lockTo }]
    : [
        { id: 'auto', label: 'Auto-detect (Recommended)' },
        { id: 'node', label: 'Node.js' },
        { id: 'python', label: 'Python' },
        { id: 'go', label: 'Go' },
        { id: 'php', label: 'PHP' },
        { id: 'static', label: 'Static HTML' },
        { id: 'dockerfile', label: 'Dockerfile' },
        { id: 'docker-compose', label: 'Docker Compose' },
        { id: 'nixpacks', label: 'Nixpacks (Auto-build)' },
      ];

  const currentType = parseBuilderValue(value).type;

  return (
    <div className="form-group">
      <label className="form-label">Build Method</label>
      <SelectRoot
        value={currentType}
        onValueChange={val => {
          if (lockTo) return;
          let finalVal = val;
          if (val === 'node') finalVal = 'node:22-alpine';
          else if (val === 'python') finalVal = 'python:3.11-slim';
          else if (val === 'go') finalVal = 'golang:1.22-alpine';
          else if (val === 'php') finalVal = 'php:8.2-apache';
          onChange(finalVal);
        }}
      >
        <SelectTrigger style={{ width: '100%' }} />
        <SelectContent>
          {types.map(t => (
            <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}

function RuntimeVersionSelect({ builderType, value, onChange }) {
  let versions = [];
  switch (builderType) {
    case 'node': versions = RUNTIME_VERSIONS.node; break;
    case 'python': versions = RUNTIME_VERSIONS.python; break;
    case 'go': versions = RUNTIME_VERSIONS.go; break;
    case 'php': versions = RUNTIME_VERSIONS.php; break;
    default: return null;
  }
  return (
    <div className="form-group">
      <label className="form-label">Runtime Version</label>
      <SelectRoot value={value} onValueChange={onChange}>
        <SelectTrigger style={{ width: '100%' }} />
        <SelectContent>
          {versions.map(v => (
            <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}

function LanguageFields({ builderType, form, setForm }) {
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <RuntimeVersionSelect
        builderType={builderType}
        value={form.gitBuilder}
        onChange={val => setForm(f => ({ ...f, gitBuilder: val }))}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">App Directory</label>
          <input className="form-input" placeholder="Leave blank for project root" value={form.appDirectory} onChange={set('appDirectory')} />
        </div>
        <div className="form-group">
          <label className="form-label">{builderType === 'node' ? 'Entry file' : 'Run file'}</label>
          <input
            className="form-input"
            placeholder={builderType === 'node' ? 'index.js or server.js' : builderType === 'python' ? 'app.py' : 'main.go'}
            value={form.runFile}
            onChange={set('runFile')}
          />
        </div>
      </div>
      {builderType === 'python' && (
        <div className="form-group">
          <label className="form-label">Requirements file</label>
          <input className="form-input" value={form.requirementsFile} onChange={set('requirementsFile')} placeholder="requirements.txt" />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Install command</label>
          <input className="form-input" value={form.installCommand} onChange={set('installCommand')} placeholder="Auto if blank" />
        </div>
        <div className="form-group">
          <label className="form-label">Start command</label>
          <input className="form-input" value={form.startCommand} onChange={set('startCommand')} placeholder="Auto if blank" />
        </div>
      </div>
      {builderType === 'python' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.useVenv} onChange={e => setForm(f => ({ ...f, useVenv: e.target.checked }))} />
          Use Python virtual environment in container
        </label>
      )}
    </>
  );
}

function DockerfileEditor({ form, setForm, showTemplatePicker }) {
  const applyTemplate = lang => {
    let content = '';
    switch (lang) {
      case 'node': content = DOCKERFILE_TEMPLATES.node; break;
      case 'python': content = DOCKERFILE_TEMPLATES.python; break;
      case 'go': content = DOCKERFILE_TEMPLATES.go; break;
      case 'php': content = DOCKERFILE_TEMPLATES.php; break;
      default: content = DOCKERFILE_TEMPLATES.generic;
    }
    setForm(f => ({ ...f, dockerfileContent: content }));
  };

  return (
    <ConfigSection title="Dockerfile" desc="Edit the Dockerfile NanoFly will use to build this app. Saved to your project folder on deploy.">
      {showTemplatePicker && (
        <div className="form-group">
          <label className="form-label">Load starter template</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['node', 'python', 'go', 'php', 'generic'].map(lang => (
              <button
                key={lang}
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ border: '1px solid var(--border)', textTransform: 'capitalize' }}
                onClick={() => applyTemplate(lang)}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      )}
      <CodeEditor
        value={form.dockerfileContent}
        onChange={val => setForm(f => ({ ...f, dockerfileContent: val }))}
        language="docker"
        style={{ height: 260 }}
      />
    </ConfigSection>
  );
}

function ComposeEditor({ form, setForm }) {
  return (
    <ConfigSection title="Docker Compose" desc="Define services in docker-compose.yml. NanoFly runs compose up for this project.">
      <CodeEditor
        value={form.dockerComposeContent}
        onChange={val => setForm(f => ({ ...f, dockerComposeContent: val }))}
        language="yaml"
        style={{ height: 280 }}
      />
    </ConfigSection>
  );
}

function LocalPathFields({ form, setForm, required }) {
  return (
    <div className="form-group">
      <label className="form-label">Server folder path {required ? '*' : ''}</label>
      <input
        className="form-input"
        placeholder="/opt/nanofly/apps/my-app"
        value={form.localPath}
        onChange={e => setForm(f => ({ ...f, localPath: e.target.value }))}
      />
    </div>
  );
}

export function AddServiceConfigFields({
  projectId,
  resourceMeta,
  form,
  setForm,
  subType,
  isPrivate,
  selectedResourceId,
  githubApps,
}) {
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [projectDatabases, setProjectDatabases] = useState([]);

  useEffect(() => {
    if (selectedResourceId === 'wordpress' && projectId) {
      servicesApi.listByProject(projectId)
        .then(services => {
          const dbs = (services || []).filter(s => s.type === 'database' && (s.image?.includes('mysql') || s.image?.includes('maria')));
          setProjectDatabases(dbs);
        })
        .catch(() => {});
    }
  }, [projectId, selectedResourceId]);

  useEffect(() => {
    if (selectedResourceId === 'git-private-app' && form.githubAppId) {
      setLoadingRepos(true);
      githubApi.listRepos(form.githubAppId)
        .then(res => setRepos(res || []))
        .catch(err => {
          console.error(err);
          setRepos([]);
        })
        .finally(() => setLoadingRepos(false));
    } else {
      setRepos([]);
    }
  }, [form.githubAppId, selectedResourceId]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const builderType = parseBuilderValue(form.gitBuilder).type;
  const title = resourceMeta?.title || 'Application';
  const resourceId = selectedResourceId || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(79,110,247,0.12) 0%, rgba(79,110,247,0.04) 100%)',
          border: '1px solid rgba(79,110,247,0.2)',
          borderRadius: 'var(--radius)',
        }}
      >
        <ResourceIcon type={resourceId} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {resourceMeta?.desc || 'Configure deployment settings for production environment.'}
          </div>
        </div>
        <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>production</span>
      </div>

      <ConfigSection title="Basics" desc="Name, domain, and resource limits for this service.">
        <div className="form-group">
          <label className="form-label">Service name *</label>
          <input className="form-input" placeholder="e.g. api, wordpress, worker" value={form.name} onChange={set('name')} />
        </div>
        <div className="form-group">
          <label className="form-label">Domain</label>
          <input className="form-input" placeholder="e.g. app.sslip.io" value={form.domain || ''} onChange={set('domain')} />
          <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Specify the domain name for this service. If left blank, NanoFly will generate an auto-routing sslip.io domain.
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">Resource tier</label>
          <select className="form-input" value={form.resourceTier} onChange={set('resourceTier')}>
            <option value="nano">Nano (128MB / 0.25 CPU)</option>
            <option value="micro">Micro (256MB / 0.5 CPU)</option>
            <option value="standard">Standard (512MB / 1.0 CPU)</option>
            <option value="large">Large (1GB / 2.0 CPU)</option>
            <option value="unlimited">Unlimited</option>
          </select>
        </div>
      </ConfigSection>

      {/* ——— WordPress ——— */}
      {resourceId === 'wordpress' && (
        <ConfigSection title="WordPress runtime" desc="Official WordPress image with PHP and Apache or Alpine FPM.">
          <div className="form-group">
            <label className="form-label">WordPress / PHP version *</label>
            <SelectRoot value={form.image} onValueChange={val => setForm(f => ({ ...f, image: val }))}>
              <SelectTrigger style={{ width: '100%' }} placeholder="Select version..." />
              <SelectContent>
                {WORDPRESS_VERSIONS.map(v => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </div>
          <div className="form-group">
            <label className="form-label">Host port</label>
            <input className="form-input" value={form.port} onChange={set('port')} placeholder="8080" />
          </div>
          <div className="form-group">
            <label className="form-label">Database Configuration *</label>
            <SelectRoot value={form.dbSetupType || 'create-mysql'} onValueChange={val => setForm(f => ({ ...f, dbSetupType: val }))}>
              <SelectTrigger style={{ width: '100%' }} placeholder="Select database setup..." />
              <SelectContent>
                <SelectItem value="create-mysql">Create new MySQL database automatically</SelectItem>
                <SelectItem value="create-mariadb">Create new MariaDB database automatically</SelectItem>
                {projectDatabases.map(db => (
                  <SelectItem key={db.id} value={`link-${db.id}`}>
                    Use existing: {db.name} ({db.image?.split(':')[0]?.toUpperCase() || 'MySQL'})
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: 8 }}>
            <Info size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            {(!form.dbSetupType || form.dbSetupType.startsWith('create-')) ? (
              <span>NanoFly will automatically deploy an isolated database container and inject configuration credentials into WordPress.</span>
            ) : (
              <span>WordPress will connect to the selected database container. Credentials will be auto-mapped from the selected database service.</span>
            )}
          </div>
          {(!form.dbSetupType || form.dbSetupType.startsWith('create-')) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, padding: '1rem', border: '1px dashed var(--border)', borderRadius: 8, background: 'var(--bg-card)' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Database Credentials (Editable)</span>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Name *</label>
                <input
                  className="form-input"
                  value={form.dbName || ''}
                  onChange={e => {
                    const newVal = e.target.value;
                    setForm(f => {
                      let updatedEnv = f.envText || '';
                      if (updatedEnv.includes('WORDPRESS_DB_NAME=')) {
                        updatedEnv = updatedEnv.replace(/WORDPRESS_DB_NAME=.*/, `WORDPRESS_DB_NAME=${newVal}`);
                      } else {
                        updatedEnv += `\nWORDPRESS_DB_NAME=${newVal}`;
                      }
                      return { ...f, dbName: newVal, envText: updatedEnv };
                    });
                  }}
                  placeholder="wordpress"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Username *</label>
                <input
                  className="form-input"
                  value={form.dbUser || ''}
                  onChange={e => {
                    const newVal = e.target.value;
                    setForm(f => {
                      let updatedEnv = f.envText || '';
                      if (updatedEnv.includes('WORDPRESS_DB_USER=')) {
                        updatedEnv = updatedEnv.replace(/WORDPRESS_DB_USER=.*/, `WORDPRESS_DB_USER=${newVal}`);
                      } else {
                        updatedEnv += `\nWORDPRESS_DB_USER=${newVal}`;
                      }
                      return { ...f, dbUser: newVal, envText: updatedEnv };
                    });
                  }}
                  placeholder="wordpress"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Database Password *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={form.dbPassword || ''}
                    onChange={e => {
                      const newVal = e.target.value;
                      setForm(f => {
                        let updatedEnv = f.envText || '';
                        if (updatedEnv.includes('WORDPRESS_DB_PASSWORD=')) {
                          updatedEnv = updatedEnv.replace(/WORDPRESS_DB_PASSWORD=.*/, `WORDPRESS_DB_PASSWORD=${newVal}`);
                        } else {
                          updatedEnv += `\nWORDPRESS_DB_PASSWORD=${newVal}`;
                        }
                        return { ...f, dbPassword: newVal, envText: updatedEnv };
                      });
                    }}
                    placeholder="Database password"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const newPass = generateSecurePassword(24);
                      setForm(f => {
                        let updatedEnv = f.envText || '';
                        if (updatedEnv.includes('WORDPRESS_DB_PASSWORD=')) {
                          updatedEnv = updatedEnv.replace(/WORDPRESS_DB_PASSWORD=.*/, `WORDPRESS_DB_PASSWORD=${newPass}`);
                        } else {
                          updatedEnv += `\nWORDPRESS_DB_PASSWORD=${newPass}`;
                        }
                        return { ...f, dbPassword: newPass, envText: updatedEnv };
                      });
                    }}
                    style={{ border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.75rem', fontSize: '0.75rem', height: 38 }}
                  >
                    <RefreshCw size={14} /> Generate
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Environment variables</label>
            <textarea className="form-input" style={{ minHeight: 130, fontFamily: 'monospace', fontSize: '0.8rem' }} value={form.envText} onChange={set('envText')} />
          </div>
        </ConfigSection>
      )}

      {/* ——— Pre-built Docker image ——— */}
      {resourceId === 'docker-image' && (
        <ConfigSection title="Docker image" desc="Pull and run a ready-made image from Docker Hub or your registry.">
          <div className="form-group">
            <label className="form-label">Image name *</label>
            <input className="form-input" placeholder="nginx:alpine" value={form.image} onChange={set('image')} />
          </div>
          <div className="form-group">
            <label className="form-label">Host port</label>
            <input className="form-input" value={form.port} onChange={set('port')} placeholder="80" />
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Need a custom build? Use the <strong>Dockerfile</strong> or <strong>Local Folder</strong> template instead — those let you edit a Dockerfile before deploy.
          </p>
        </ConfigSection>
      )}

      {/* ——— Node template ——— */}
      {resourceId === 'node-template' && (
        <ConfigSection title="Node.js project" desc="Node.js Alpine runtime — use Local Folder template to switch to Dockerfile, Compose, or Nixpacks.">
          <LocalPathFields form={form} setForm={setForm} required />
          <div className="form-group">
            <label className="form-label">Container port</label>
            <input className="form-input" value={form.port} onChange={set('port')} placeholder="3000" />
          </div>
          <LanguageFields builderType="node" form={form} setForm={setForm} />
        </ConfigSection>
      )}

      {/* ——— Python template ——— */}
      {resourceId === 'python-template' && (
        <ConfigSection title="Python project" desc="Python slim/Alpine runtime — use Local Folder for Dockerfile, Compose, or Nixpacks.">
          <LocalPathFields form={form} setForm={setForm} required />
          <div className="form-group">
            <label className="form-label">Container port</label>
            <input className="form-input" value={form.port} onChange={set('port')} placeholder="8000" />
          </div>
          <LanguageFields builderType="python" form={form} setForm={setForm} />
        </ConfigSection>
      )}

      {/* ——— Local folder (generic) ——— */}
      {resourceId === 'local-folder' && (
        <>
          <ConfigSection title="Local folder" desc="Point to any folder; pick how NanoFly should build and run it.">
            <LocalPathFields form={form} setForm={setForm} required />
            <div className="form-group">
              <label className="form-label">Container port</label>
              <input className="form-input" value={form.port} onChange={set('port')} placeholder="3000" />
            </div>
            <BuilderTypeSelect value={form.gitBuilder} onChange={val => setForm(f => ({
              ...f,
              gitBuilder: val,
              useVenv: val.startsWith('python') ? f.useVenv : false,
            }))} />
            {['node', 'python', 'go', 'php'].includes(builderType) && (
              <LanguageFields builderType={builderType} form={form} setForm={setForm} />
            )}
          </ConfigSection>
          {builderType === 'dockerfile' && <DockerfileEditor form={form} setForm={setForm} showTemplatePicker />}
          {builderType === 'docker-compose' && <ComposeEditor form={form} setForm={setForm} />}
          {builderType === 'nixpacks' && (
            <div style={{ padding: '0.85rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: '0.85rem' }}>
              <strong>Nixpacks</strong> analyzes the folder and builds automatically — no manual Dockerfile needed.
            </div>
          )}
          {builderType === 'auto' && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Auto-detect scans for package.json, requirements.txt, go.mod, Dockerfile, or docker-compose.yml.
            </p>
          )}
        </>
      )}

      {/* ——— Dockerfile-only ——— */}
      {resourceId === 'dockerfile' && (
        <>
          <ConfigSection title="Project folder" desc="Folder that contains your app and Dockerfile.">
            <LocalPathFields form={form} setForm={setForm} required />
            <div className="form-group">
              <label className="form-label">Container port</label>
              <input className="form-input" value={form.port} onChange={set('port')} placeholder="8080" />
            </div>
          </ConfigSection>
          <DockerfileEditor form={form} setForm={setForm} showTemplatePicker />
        </>
      )}

      {/* ——— Compose-only ——— */}
      {resourceId === 'docker-compose' && (
        <>
          <ConfigSection title="Project folder" desc="Folder with docker-compose.yml (or paste definition below).">
            <LocalPathFields form={form} setForm={setForm} required />
          </ConfigSection>
          <ComposeEditor form={form} setForm={setForm} />
        </>
      )}

      {/* ——— Git ——— */}
      {subType === 'github' && (
        <ConfigSection
          title="Git repository"
          desc={selectedResourceId === 'git-private-app'
            ? 'Select your GitHub App. The repository links automatically on the first push via the app webhook (configure in Sources).'
            : 'Clone and build from your remote repository.'}
        >
          {selectedResourceId !== 'git-private-app' && (
            <div className="form-group">
              <label className="form-label">Repository URL *</label>
              <input className="form-input" placeholder="https://github.com/user/repo" value={form.gitUrl} onChange={set('gitUrl')} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Branch</label>
            <input className="form-input" value={form.branch} onChange={set('branch')} placeholder="main" />
          </div>
          {isPrivate && selectedResourceId === 'git-private-key' && (
            <div className="form-group">
              <label className="form-label">SSH private key *</label>
              <textarea className="form-input" style={{ fontFamily: 'monospace', height: 100, fontSize: '0.8rem' }} value={form.sshKey} onChange={e => setForm(f => ({ ...f, sshKey: e.target.value }))} />
            </div>
          )}
          {isPrivate && selectedResourceId === 'git-private-app' && (
            <>
              <div className="form-group">
                <label className="form-label">GitHub App *</label>
                {githubApps.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <Link to="/sources">Add a GitHub App in Sources</Link> first, set the webhook URL there, then install the app on your org/repos.
                  </p>
                ) : (
                  <SelectRoot value={form.githubAppId || undefined} onValueChange={val => setForm(f => ({ ...f, githubAppId: val }))}>
                    <SelectTrigger style={{ width: '100%' }} placeholder="Select app..." />
                    <SelectContent>
                      {githubApps.map(app => (
                        <SelectItem key={app.id} value={String(app.id)}>{app.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                )}
              </div>
              {form.githubAppId && (
                <div className="form-group">
                  <label className="form-label">Repository</label>
                  {loadingRepos ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Loading repositories...
                    </div>
                  ) : repos.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No repositories found. Make sure the app is installed on your repositories.
                    </div>
                  ) : (
                    <SelectRoot value={form.gitUrl || ""} onValueChange={val => setForm(f => ({ ...f, gitUrl: val }))}>
                      <SelectTrigger style={{ width: '100%' }} placeholder="Select repository..." />
                      <SelectContent>
                        <SelectItem value="">-- Webhook push to deploy (Auto-link) --</SelectItem>
                        {repos.map(r => (
                          <SelectItem key={r.full_name} value={r.clone_url}>{r.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  )}
                </div>
              )}
              {!form.gitUrl && (
                <div style={{ padding: '0.75rem', background: 'rgba(79,110,247,0.06)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  No repository selected. After you create this resource, push to any repo covered by the GitHub App installation — NanoFly links the repo and deploys automatically.
                </div>
              )}
            </>
          )}
          {isPrivate && !['git-private-key', 'git-private-app'].includes(selectedResourceId) && (
            <div className="form-group">
              <label className="form-label">GitHub token (optional)</label>
              <input className="form-input" type="password" value={form.token} onChange={set('token')} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Container port</label>
            <input className="form-input" value={form.port} onChange={set('port')} placeholder="3000" />
          </div>
          <BuilderTypeSelect value={form.gitBuilder} onChange={val => setForm(f => ({ ...f, gitBuilder: val }))} />
          {['node', 'python', 'go', 'php'].includes(builderType) && (
            <LanguageFields builderType={builderType} form={form} setForm={setForm} />
          )}
          {builderType === 'dockerfile' && <DockerfileEditor form={form} setForm={setForm} showTemplatePicker />}
          {builderType === 'docker-compose' && <ComposeEditor form={form} setForm={setForm} />}
          {builderType === 'nixpacks' && (
            <div style={{ padding: '0.85rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: '0.85rem' }}>
              <strong>Nixpacks</strong> builds from the cloned repo automatically.
            </div>
          )}
        </ConfigSection>
      )}

      {resourceId !== 'wordpress' && (
        <ConfigSection title="Environment variables" desc="Optional KEY=value pairs, one per line.">
          <textarea
            className="form-input"
            style={{ minHeight: 100, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}
            placeholder="PORT=3000&#10;NODE_ENV=production"
            value={form.envText}
            onChange={set('envText')}
          />
        </ConfigSection>
      )}

      {(subType === 'local' || subType === 'github') && (
        <ConfigSection title="Advanced" desc="Extra Docker flags for hardware or networking.">
          <div className="form-group">
            <label className="form-label">Docker run arguments</label>
            <input
              className="form-input"
              value={form.dockerArgs}
              onChange={set('dockerArgs')}
              placeholder="--network host"
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>
        </ConfigSection>
      )}
    </div>
  );
}

export function ConfigStepBackBar({ onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '0.85rem',
        padding: 0,
      }}
    >
      <ArrowLeft size={16} /> Back to templates
    </button>
  );
}
