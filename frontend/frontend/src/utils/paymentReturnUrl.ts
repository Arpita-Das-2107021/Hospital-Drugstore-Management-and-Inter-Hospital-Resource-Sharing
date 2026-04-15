const DOCKER_ONLY_BROWSER_HOSTNAMES = new Set(['host.docker.internal', '0.0.0.0']);

const normalizeBrowserOrigin = (origin: string): string => {
  try {
    const parsedOrigin = new URL(origin);
    if (DOCKER_ONLY_BROWSER_HOSTNAMES.has(parsedOrigin.hostname.toLowerCase())) {
      parsedOrigin.hostname = 'localhost';
    }
    return parsedOrigin.origin;
  } catch {
    return origin;
  }
};

const readConfiguredPublicOrigin = (): string | null => {
  const configuredValue = String(import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim();
  if (!configuredValue) {
    return null;
  }

  try {
    return normalizeBrowserOrigin(new URL(configuredValue).origin);
  } catch {
    return null;
  }
};

export const getPublicAppOrigin = (currentOrigin = window.location.origin): string => {
  const configuredOrigin = readConfiguredPublicOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }
  return normalizeBrowserOrigin(currentOrigin);
};

export const buildPublicUrlFromLocation = (locationHref: string): URL => {
  const callbackUrl = new URL(locationHref);
  const publicOriginUrl = new URL(getPublicAppOrigin(callbackUrl.origin));

  callbackUrl.protocol = publicOriginUrl.protocol;
  callbackUrl.host = publicOriginUrl.host;
  return callbackUrl;
};