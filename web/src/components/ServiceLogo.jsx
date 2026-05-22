import React, { useState } from 'react';
import { Database, Package, Globe, Folder, Key, Lock, FileCode, Sliders } from 'lucide-react';

const DEVICON_MAP = {
  postgres: 'postgresql/postgresql-original.svg',
  mysql: 'mysql/mysql-original.svg',
  mariadb: 'mariadb/mariadb-original.svg',
  redis: 'redis/redis-original.svg',
  mongo: 'mongodb/mongodb-original.svg',
  clickhouse: 'clickhouse/clickhouse-original.svg',
  wordpress: 'wordpress/wordpress-plain.svg',
  python: 'python/python-original.svg',
  node: 'nodejs/nodejs-original.svg',
  go: 'go/go-original-wordmark.svg',
  php: 'php/php-original.svg',
  docker: 'docker/docker-original.svg'
};

export function ServiceLogo({ type, subType, name, image, builder, size = 18 }) {
  const [imgError, setImgError] = useState(false);
  
  let matchedName = (name || '').toLowerCase();
  let matchedImg = (image || '').toLowerCase();
  let matchedBuilder = (builder || '').toLowerCase();
  let matchedSubType = (subType || '').toLowerCase();

  // Determine specific engine based on type/image/name/subType
  let engine = 'unknown';

  if (matchedSubType === 'github') {
    engine = 'github';
  } else if (type === 'database') {
    if (matchedImg.includes('postgres') || matchedName.includes('postgres')) engine = 'postgres';
    else if (matchedImg.includes('mysql') || matchedName.includes('mysql')) engine = 'mysql';
    else if (matchedImg.includes('mariadb') || matchedName.includes('mariadb')) engine = 'mariadb';
    else if (matchedImg.includes('redis') || matchedName.includes('redis')) engine = 'redis';
    else if (matchedImg.includes('keydb') || matchedName.includes('keydb')) engine = 'keydb';
    else if (matchedImg.includes('dragonfly') || matchedName.includes('dragonfly')) engine = 'dragonfly';
    else if (matchedImg.includes('mongo') || matchedName.includes('mongo')) engine = 'mongo';
    else if (matchedImg.includes('clickhouse') || matchedName.includes('clickhouse')) engine = 'clickhouse';
  } else {
    // Determine specific app platform
    if (matchedImg.includes('wordpress') || matchedName.includes('wordpress')) engine = 'wordpress';
    else if (matchedBuilder.includes('python')) engine = 'python';
    else if (matchedBuilder.includes('node') || matchedImg.includes('node')) engine = 'node';
    else if (matchedBuilder.includes('go') || matchedImg.includes('golang')) engine = 'go';
    else if (matchedBuilder.includes('php') || matchedImg.includes('php')) engine = 'php';
    else if (matchedImg.includes('docker') || matchedBuilder.includes('docker')) engine = 'docker';
  }

  // If Devicon has it and it hasn't errored out, use the official CDN image
  if (DEVICON_MAP[engine] && !imgError) {
    return (
      <img 
        src={`https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${DEVICON_MAP[engine]}`} 
        width={size} 
        height={size} 
        alt={engine} 
        onError={() => setImgError(true)} 
        style={{ objectFit: 'contain' }}
      />
    );
  }

  // Exact image mapping overrides for SVGs (Fallbacks + Custom Engines)
  switch (engine) {
    case 'github':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      );
    case 'postgres':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#336791" d="M122.9 83.2l-3.3-25.5H89.2V27.4C89.2 12.3 76.9 0 61.8 0 46.7 0 34.4 12.3 34.4 27.4v30.3H4v25.5l98.3-2.6 20.6 2.6z" />
          <path fill="#FFF" d="M85.4 79.5h32.2l-2.4-18.4H85.4v18.4zm-48-21.8v-30.3c0-13.5 11-24.5 24.5-24.5s24.5 11 24.5 24.5v30.3h-49z" />
        </svg>
      );
    case 'mysql':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#F29111" d="M64 123.5c-30.9 0-56.1-24.3-57.9-54.8H122c-1.8 30.5-27 54.8-58 54.8z" />
          <path fill="#00758F" d="M64 4.5c30.9 0 56.1 24.3 57.9 54.8H6.1C7.9 28.8 33.1 4.5 64 4.5z" />
          <path fill="#FFF" d="M38.8 38.8h8.8v25.2h12V38.8h8.8v34h-8.8V46.6h-12v26.2h-8.8v-34z" />
        </svg>
      );
    case 'mariadb':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <circle cx="64" cy="64" r="60" fill="#003545" />
          <path fill="#FFF" d="M50 82L64 44l14 38z" />
          <path fill="#E08B32" d="M26 82l24-38-12-16z" />
          <path fill="#5499C7" d="M102 82L78 44l12-16z" />
        </svg>
      );
    case 'redis':
    case 'keydb':
    case 'dragonfly':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#D82C20" d="M86.8 54.9c-2.3 0-4.6.4-6.8 1.1-6.1-5.1-14.8-7-23-4.8 2.3-4 6.6-6.4 11.2-6.4 5.6 0 10.6 3.6 12.3 8.9 1 .4 2 .8 3 1.3-3.6-7.8-11.4-12.8-20.1-12.8-5 0-9.8 1.6-13.8 4.6l-5.6-5.6c-.6-.6-1.5-.7-2.3-.2l-5.3 3.6c-4.9-4.2-11.3-6.5-17.8-6.5C8.4 38 0 46.4 0 56.7c0 10 8.1 18.2 18.2 18.4 3.7.1 7.2-1.1 10.1-3l5.6 5.6c.4.4.9.6 1.4.6.5 0 .9-.2 1.3-.6l18.5-18.5c1.4-1.4 3.3-2.1 5.3-2.1s3.9.8 5.3 2.1c2.5 2.5 2.5 6.6 0 9.2-2.3 2.3-5.7 2.6-8.2 1.1-1.3 2.8-2.5 5.7-3.7 8.5 4.5.3 9-.5 13.1-2.4 12.1 5.7 25 11 38 16 3-8.8 6-17.6 9-26.4C122.9 66 128 58 128 48.7 128 36.1 117.8 26 105.2 26c-9.1 0-17 5.3-20.6 13 4 2.8 7 7.2 8.2 12.4v.1c-1.8.8-3.9 1.4-6 2zm18.4-15c5.3 0 9.5 4.3 9.5 9.5s-4.3 9.5-9.5 9.5-9.5-4.3-9.5-9.5 4.2-9.5 9.5-9.5zM18.6 62.4c-3.1 0-5.7-2.6-5.7-5.7s2.6-5.7 5.7-5.7 5.7 2.6 5.7 5.7-2.6 5.7-5.7 5.7z" />
        </svg>
      );
    case 'mongo':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#4DB33D" d="M62.6 128C41.2 119.5 27 94.6 27 67.8c0-36.8 27.2-56.1 35.6-67.8C71 11.7 98.2 31 98.2 67.8c0 26.8-14.2 51.7-35.6 60.2z" />
          <path fill="#3F9E33" d="M62.6 128c1.3-46.1-4.7-61.9-8.7-82 0 0 10.5 8 13.2 24.1 2.3 14 0 46-4.5 57.9z" />
        </svg>
      );
    case 'clickhouse':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <rect x="24" y="24" width="24" height="24" fill="#FFCC00" />
          <rect x="24" y="52" width="24" height="24" fill="#FFCC00" />
          <rect x="24" y="80" width="24" height="24" fill="#FFCC00" />
          <rect x="52" y="52" width="24" height="24" fill="#FFCC00" />
          <rect x="52" y="80" width="24" height="24" fill="#FFCC00" />
          <rect x="80" y="80" width="24" height="24" fill="#FFCC00" />
        </svg>
      );
    case 'python':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#3776AB" d="M63.9 6.2C30 6.2 32.2 21 32.2 21v15.6h32v4.6H23.5S5.8 40.5 5.8 63.3C5.8 86 20.3 89.2 20.3 89.2h9.7V75.6s-.2-16.7 17-16.7H78s15.9.1 15.9-15.5V21.6S96.1 6.2 63.9 6.2zm-15.6 11c3.2 0 5.8 2.6 5.8 5.8s-2.6 5.8-5.8 5.8-5.8-2.6-5.8-5.8 2.6-5.8 5.8-5.8z" />
          <path fill="#FFD43B" d="M64.6 121.8c33.9 0 31.7-14.8 31.7-14.8V91.4h-32v-4.6h40.7s17.6.7 17.6-22.2c0-22.7-14.5-25.8-14.5-25.8h-9.7v13.6s.2 16.7-17 16.7H50.5s-15.9-.1-15.9 15.5v21.8s-2.1 15.4 30 15.4zm15.6-11c-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8 5.8 2.6 5.8 5.8-2.6 5.8-5.8 5.8z" />
        </svg>
      );
    case 'node':
      return (
        <svg viewBox="0 0 128 128" width={size} height={size}>
          <path fill="#339933" d="M64 4.3L12 34.2v59.7l52 29.8 52-29.8V34.2L64 4.3zm24.1 82.2l-23.7 13.5v-27l11.7-6.8v13.5l12-6.8V45.7l-23.7-13.5L40.7 45.7v27.2l-11.7 6.8V52.5l23.7-13.5L64 45.8l11.4-6.5L64 32.5 28.7 52.8v40.5L64 113.7l35.3-20.3v-40.5L88.1 60l.1 26.5h-.1z" />
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
export function ResourceIcon({ type, size = 18 }) {
  if (type === 'postgres') return <ServiceLogo type="database" image="postgres" size={size} />;
  if (type === 'mysql') return <ServiceLogo type="database" image="mysql" size={size} />;
  if (type === 'mariadb') return <ServiceLogo type="database" image="mariadb" size={size} />;
  if (type === 'redis') return <ServiceLogo type="database" image="redis" size={size} />;
  if (type === 'keydb') return <ServiceLogo type="database" image="keydb" size={size} />;
  if (type === 'dragonfly') return <ServiceLogo type="database" image="dragonfly" size={size} />;
  if (type === 'mongo') return <ServiceLogo type="database" image="mongo" size={size} />;
  if (type === 'clickhouse') return <ServiceLogo type="database" image="clickhouse" size={size} />;

  if (type === 'git-public') return <ServiceLogo subType="github" size={size} />;
  if (type === 'local-folder') return <Folder size={size} color="var(--accent)" />;
  if (type === 'wordpress') return <ServiceLogo type="app" image="wordpress" size={size} />;
  if (type === 'python-template') return <ServiceLogo type="app" builder="python" size={size} />;
  if (type === 'node-template') return <ServiceLogo type="app" builder="node" size={size} />;
  if (type === 'git-private-app') return <ServiceLogo subType="github" size={size} />;
  if (type === 'git-private-key') return <ServiceLogo subType="github" size={size} />;
  if (type === 'dockerfile') return <ServiceLogo type="dockerfile" image="docker" size={size} />;
  if (type === 'docker-compose') return <ServiceLogo type="docker-compose" image="docker" size={size} />;
  if (type === 'docker-image') return <ServiceLogo type="docker-image" image="docker" size={size} />;

  return <Package size={size} color="var(--accent)" />;
}
