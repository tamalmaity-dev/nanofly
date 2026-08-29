/** Track services that saved config but still need a redeploy to apply. */
const key = (serviceId: string): string => `nanofly_pending_redeploy_${serviceId}`;

export function markPendingRedeploy(serviceId: string): void {
  if (serviceId) sessionStorage.setItem(key(serviceId), '1');
}

export function clearPendingRedeploy(serviceId: string): void {
  if (serviceId) sessionStorage.removeItem(key(serviceId));
}

export function hasPendingRedeploy(serviceId: string): boolean {
  return serviceId ? sessionStorage.getItem(key(serviceId)) === '1' : false;
}
