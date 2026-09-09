import host from '@plugin-host';


export interface Identity {
  id: string;
  name: string;
  email: string;
  replyTo?: any[];
  bcc?: any[];
  textSignature?: string;
  htmlSignature?: string;
  mayDelete: boolean;
  localAccountId?: string;
  accountName?: string;
}

export interface AccountEntry {
  id: string;/** Unique key: `${username}@${serverHostname}` */
  label: string;
  serverUrl: string;
  username: string;
  displayName: string;
  email: string;
  avatarColor: string;
  isConnected: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export async function getCurrentAccountId(): Promise<string | undefined> {
  const accounts = await host.user.getAccounts();
  const currentAccount = accounts.find(account => account.isActive);
  if(!currentAccount) {
    host.log.warn('No connected account found. Returning undefined for current account ID.');
  }
  return currentAccount ? currentAccount.id : undefined;
}


export function getCoveredMonths(startIso: string, durationIso?: string, endIso?: string | null): string[] {
  const startDate = new Date(startIso);
  let endDate: Date;

  if (endIso) {
    endDate = new Date(endIso);
  } else if (durationIso) {
    const milliseconds = parseIsoDurationToMs(durationIso);
    endDate = new Date(startDate.getTime() + milliseconds);
  } else {
    endDate = new Date(startDate);
  }

  const months: string[] = [];
  const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (current <= last) {
    const yearMonth = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push(yearMonth);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return months;
}


export function parseIsoDurationToMs(duration: string): number {
  const regex = /P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/;
  const matches = duration.match(regex);
  if (!matches) return 3600000; 
  const [_, years, months, weeks, days, hours, mins, secs] = matches.map(v => parseInt(v || '0', 10));

  const ms =
    (years * 365 + months * 30 + weeks * 7 + days) * 86400000 +
    hours * 3600000 +
    mins * 60000 +
    secs * 1000;

  return ms || 3600000;
}