import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import type { TrustProxySetting } from './env.validation';

const DNS_CACHE_TTL_MS = 5000;
const DNS_NEGATIVE_BACKOFF_MS = 1000;
const DNS_LOOKUP_TIMEOUT_MS = 1500;

export function normalizePeerIp(rawIp: string | undefined): string {
  if (!rawIp) {
    return '';
  }
  const trimmed = rawIp.trim();
  const v4MappedPrefix = '::ffff:';
  if (trimmed.toLowerCase().startsWith(v4MappedPrefix)) {
    const candidateV4 = trimmed.slice(v4MappedPrefix.length);
    if (isIP(candidateV4) === 4) {
      return candidateV4;
    }
  }
  return trimmed;
}

function buildStaticBlockList(cidrs: readonly string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const slash = cidr.indexOf('/');
    const addr = slash === -1 ? cidr : cidr.slice(0, slash);
    const version = isIP(addr);
    if (version === 0) {
      continue;
    }
    const family = version === 4 ? 'ipv4' : 'ipv6';
    if (slash === -1) {
      list.addAddress(addr, family);
    } else {
      const prefix = Number.parseInt(cidr.slice(slash + 1), 10);
      list.addSubnet(addr, prefix, family);
    }
  }
  return list;
}

async function resolveHostnameIpsWithTimeout(hostnames: readonly string[]): Promise<Set<string>> {
  const resolved = new Set<string>();
  await Promise.all(
    hostnames.map(async (hostname) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Proxy DNS lookup timeout')), DNS_LOOKUP_TIMEOUT_MS);
          timer.unref?.();
        });
        const records = await Promise.race([dns.lookup(hostname, { all: true }), timeout]);
        for (const rec of records) {
          const norm = normalizePeerIp(rec.address);
          if (norm) {
            resolved.add(norm);
          }
        }
      } catch {
        // Unresolvable host fails closed (not trusted).
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }),
  );
  return resolved;
}

export const TRUSTED_PROXY_CHECKER_KEY = 'qaehTrustedProxyChecker';

export interface ConfiguredProxyTrust {
  readonly expressSetting: false | ((ip: string, hopIndex: number) => boolean);
  readonly isTrustedPeer: (rawIp: string | undefined) => boolean;
  readonly middleware?: (req: Request, res: Response, next: NextFunction) => void;
}

export function createConfiguredProxyTrust(setting: TrustProxySetting): ConfiguredProxyTrust {
  if (setting.mode === 'disabled') {
    return {
      expressSetting: false,
      isTrustedPeer: () => false,
    };
  }

  const staticBlockList = buildStaticBlockList(setting.cidrs);
  let dynamicHostIps = new Set<string>();
  let cacheExpiresAt = 0;
  let lastRefreshAt = 0;
  let refreshPromise: Promise<void> | null = null;

  const isStaticMatch = (normIp: string): boolean => {
    const version = isIP(normIp);
    if (version === 4) {
      return staticBlockList.check(normIp, 'ipv4');
    }
    if (version === 6) {
      return staticBlockList.check(normIp, 'ipv6');
    }
    return false;
  };

  const isTrustedPeer = (rawIp: string | undefined): boolean => {
    const normIp = normalizePeerIp(rawIp);
    if (!normIp) {
      return false;
    }
    return isStaticMatch(normIp) || dynamicHostIps.has(normIp);
  };

  const expressSetting = (ip: string, hopIndex: number): boolean => {
    if (hopIndex !== 0) {
      return false;
    }
    return isTrustedPeer(ip);
  };

  if (setting.hostnames.length === 0) {
    return { expressSetting, isTrustedPeer };
  }

  const refreshDnsCache = async (): Promise<void> => {
    if (refreshPromise) {
      await refreshPromise;
      return;
    }
    refreshPromise = (async () => {
      try {
        dynamicHostIps = await resolveHostnameIpsWithTimeout(setting.hostnames);
        const now = Date.now();
        lastRefreshAt = now;
        cacheExpiresAt = now + DNS_CACHE_TTL_MS;
      } finally {
        refreshPromise = null;
      }
    })();
    await refreshPromise;
  };

  const middleware = (req: Request, _res: Response, next: NextFunction): void => {
    const peerIp = normalizePeerIp(req.socket.remoteAddress);
    if (!peerIp || isStaticMatch(peerIp)) {
      next();
      return;
    }

    const now = Date.now();
    const isFreshHit = now < cacheExpiresAt && dynamicHostIps.has(peerIp);
    const shouldSkipNegativeRefresh =
      now < cacheExpiresAt && !dynamicHostIps.has(peerIp) && now - lastRefreshAt < DNS_NEGATIVE_BACKOFF_MS;

    if (isFreshHit || shouldSkipNegativeRefresh) {
      next();
      return;
    }

    void refreshDnsCache().then(
      () => next(),
      () => next(),
    );
  };

  return { expressSetting, isTrustedPeer, middleware };
}
