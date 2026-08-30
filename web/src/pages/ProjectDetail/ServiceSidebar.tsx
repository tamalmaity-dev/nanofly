// @ts-nocheck
import React from 'react';
import {
  Settings, Key, Package, FileText, TerminalSquare, Cpu, Sliders, HardDrive, Globe, Folder,
  FileCode, Database, GitBranch, Server, Activity, Wrench,
} from 'lucide-react';

const iconMap = {
  Settings, Key, Package, FileText, TerminalSquare, Cpu, Sliders, HardDrive, Globe, Folder,
  FileCode, Database, GitBranch, Server, Activity, Wrench,
};

export function ServiceSidebar({ service, activeTab, onSelect, domains, project }) {
  const isCompose = service?.git_builder === 'docker-compose' || !!service?.docker_compose_content;
  const isGitHubApp = !!service?.github_app_id;

  const groups = isGitHubApp ? [
    {
      title: 'Settings',
      items: [
        { id: 'configuration', label: 'General', icon: Settings },
        { id: 'domains', label: 'Domains', icon: Globe },
        { id: 'envvars', label: 'Environment Variables', icon: FileCode },
        { id: 'volumes', label: 'Persistent Storage', icon: HardDrive },
        { id: 'advanced', label: 'Advanced', icon: Wrench },
        { id: 'healthcheck', label: 'Healthcheck', icon: Activity },
      ],
    },
    {
      title: 'Observe & troubleshoot',
      items: [
        { id: 'deployments', label: 'Deployment Logs', icon: Package },
        { id: 'logs', label: 'Runtime Logs', icon: FileText },
        { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
        { id: 'monitoring', label: 'Metrics', icon: Cpu },
      ],
    },
    {
      title: 'Deploy',
      items: [
        { id: 'gitsource', label: 'Git Source', icon: GitBranch },
        { id: 'servers', label: 'Servers', icon: Server },
      ],
    },
    {
      title: 'Automation',
      items: [
        { id: 'webhooks', label: 'Webhooks', icon: Globe },
        { id: 'backup', label: 'Backups', icon: Database },
      ],
    },
  ] : [
    {
      title: 'Settings',
      items: [
        ...(service?.type !== 'database' ? [{ id: 'configuration', label: 'General', icon: Settings }] : []),
        ...(service?.type === 'database' ? [{ id: 'connection', label: 'Connection Details', icon: Key }] : []),
        { id: 'domains', label: 'Domains', icon: Globe },
        ...(service?.type !== 'database' ? [{ id: 'envvars', label: 'Environment Variables', icon: FileCode }] : []),
        { id: 'volumes', label: 'Persistent Storage', icon: HardDrive },
        ...(isCompose ? [{ id: 'compose', label: 'Compose', icon: FileCode }] : []),
      ].filter(Boolean),
    },
    {
      title: 'Observe & troubleshoot',
      items: [
        { id: 'deployments', label: 'Deployments', icon: Package },
        { id: 'logs', label: 'Runtime Logs', icon: FileText },
        ...(service?.type !== 'database' ? [{ id: 'terminal', label: 'Terminal', icon: TerminalSquare }] : []),
        { id: 'monitoring', label: 'Monitoring', icon: Cpu },
      ],
    },
    {
      title: 'Deploy',
      items: [
        ...(service?.git_repo_url && !service?.git_repo_url?.startsWith('file://') ? [{ id: 'gitsource', label: 'Git Source', icon: GitBranch }] : []),
        { id: 'servers', label: 'Servers', icon: Server },
      ],
    },
    {
      title: 'Automation',
      items: [
        ...((service?.github_app_id || (service?.git_repo_url && !service?.git_repo_url?.startsWith('file://'))) ? [{ id: 'webhooks', label: 'Webhooks', icon: Globe }] : []),
        ...(service?.git_repo_url?.startsWith('file://') ? [{ id: 'files', label: 'Source Files', icon: Folder }] : []),
        { id: 'backup', label: 'Backups', icon: Database },
      ].filter(Boolean),
    },
    {
      title: 'Operations',
      items: [
        { id: 'resources', label: 'Resource Operations', icon: Sliders },
      ],
    },
  ];

  return (
    <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 16 }}>
      {groups.map(group => (
        group.items.length === 0 ? null : (
          <div key={group.title}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, paddingLeft: 8 }}>{group.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius)',
                      border: '1px solid',
                      borderColor: active ? 'rgba(79,110,247,0.25)' : 'transparent',
                      background: active ? 'rgba(79,110,247,0.10)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.84rem',
                      fontWeight: active ? 600 : 400,
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.15s',
                    }}
                  >
                    {Icon ? <Icon size={14} style={{ flexShrink: 0 }} /> : <span style={{ width: 14 }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ))}
    </div>
  );
}
