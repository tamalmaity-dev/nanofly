/** Cryptographically strong password for DB / WordPress env vars. */
export function generateSecurePassword(length = 24) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/** Build WordPress environment template with secure password. */
export function buildWordPressEnvTemplate() {
  const password = generateSecurePassword(24);
  return `WORDPRESS_DB_HOST=host.docker.internal:3306
WORDPRESS_DB_USER=wordpress
WORDPRESS_DB_PASSWORD=${password}
WORDPRESS_DB_NAME=wordpress
WORDPRESS_TABLE_PREFIX=wp_`;
}
