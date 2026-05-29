/** Cryptographically strong password for DB / WordPress env vars. */
export function generateSecurePassword(length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/** Cryptographically strong random identifier (lowercase letters & numbers, starts with a letter) */
export function generateRandomIdent(prefix = '', length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Ensure the first character after the prefix is a lowercase letter
  const firstLetterChars = 'abcdefghijklmnopqrstuvwxyz';
  const firstByte = new Uint8Array(1);
  crypto.getRandomValues(firstByte);
  const first = firstLetterChars[firstByte[0] % firstLetterChars.length];
  const rest = Array.from(bytes, b => chars[b % chars.length]).join('');
  return prefix + first + rest;
}

/** Build WordPress environment template with secure password. */
export function buildWordPressEnvTemplate(dbUser = 'wordpress', dbPassword = '', dbName = 'wordpress') {
  const password = dbPassword || generateSecurePassword(24);
  return `WORDPRESS_DB_HOST=host.docker.internal:3306
WORDPRESS_DB_USER=${dbUser}
WORDPRESS_DB_PASSWORD=${password}
WORDPRESS_DB_NAME=${dbName}
WORDPRESS_TABLE_PREFIX=wp_`;
}
