/** Track services that saved config but still need a redeploy to apply. */
const key = (serviceId) => `nanofly_pending_redeploy_${serviceId}`;

export function markPendingRedeploy(serviceId) {
  if (serviceId) sessionStorage.setItem(key(serviceId), '1');
}

export function clearPendingRedeploy(serviceId) {
  if (serviceId) sessionStorage.removeItem(key(serviceId));
}

export function hasPendingRedeploy(serviceId) {
  return serviceId ? sessionStorage.getItem(key(serviceId)) === '1' : false;
}
