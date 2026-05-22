import React from 'react';
import { ShieldCheck, Clock, ShieldAlert } from 'lucide-react';

export function StatusBadge({ status, type = 'default' }) {
  const s = (status || '').toLowerCase();

  // SSL/Domain Specific Badges
  if (type === 'ssl') {
    if (s === 'active') return <span className="badge badge-green"><ShieldCheck size={11} /> Active</span>;
    if (s === 'pending') return <span className="badge badge-yellow"><Clock size={11} /> Pending</span>;
    return <span className="badge badge-red"><ShieldAlert size={11} /> Error</span>;
  }

  // General Status Badges (Containers, Services, Databases)
  const colorMap = {
    running: 'badge-green',
    creating: 'badge-yellow',
    deploying: 'badge-yellow',
    building: 'badge-yellow',
    error: 'badge-red',
    failed: 'badge-red',
    stopped: 'badge-gray',
    idle: 'badge-gray',
  };

  const className = colorMap[s] || 'badge-gray';
  return <span className={`badge ${className}`}>● {s}</span>;
}
