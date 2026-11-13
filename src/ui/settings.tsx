import React, { useCallback, useEffect, useState } from 'react';
import host from '@plugin-host';

import { broadcastLockKey, fetchKeyFromBackground, subscribeToKeyUpdates } from '../crypto/broadcastChannel.ts';
import { CalendarCryptoError, getKeys } from '../crypto/getKey.ts';
import { getDataFromMaster } from '../crypto/masterPlugin.ts';
import { ProModeToggle } from './accountSelector.tsx';
import { AccountEntry } from '../types.ts';

type Status =
  | 'loading'
  | 'no_account'
  | 'master_unavailable'
  | 'master_locked'
  | 'no_keys'
  | 'locked'
  | 'unlocked';

interface AccountStatusState {
  [accountId: string]: Status;
}

const t = (key: string) => host.i18n.t(key);

export function SettingsSection() {
  const [statuses, setStatuses] = useState<AccountStatusState>({});
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [busyAccounts, setBusyAccounts] = useState<Record<string, boolean>>({});

  const checkStatusForAccount = async (accountId: string): Promise<Status> => {
    if (await fetchKeyFromBackground(accountId)) return 'unlocked';

    const response = await getDataFromMaster(accountId);
    if (response.state === 'unavailable') return 'master_unavailable';
    if (response.state === 'locked') return 'master_locked';
    return response.data ? 'locked' : 'no_keys';
  };

  const refresh = useCallback(async () => {
    let currentAccs = accounts;
    try {
      const accs = await host.user.getAccounts();
      if (accs) {
        currentAccs = accs;
        setAccounts(accs);
      }
    } catch (e) {
      // Ignorer l'erreur
    }

    const targetAccountIds = selectedAccountId !== undefined 
      ? [selectedAccountId] 
      : currentAccs.map((acc) => acc.id);

    if (targetAccountIds.length === 0) {
      setStatuses({});
      return;
    }

    const updatedStatuses: AccountStatusState = {};
    await Promise.all(
      targetAccountIds.map(async (id) => {
        updatedStatuses[id] = await checkStatusForAccount(id);
      })
    );

    setStatuses(updatedStatuses);
  }, [selectedAccountId]);

  useEffect(() => {
    void refresh();
    return subscribeToKeyUpdates(() => void refresh());
  }, [refresh]);

  const runAction = async (accountId: string, action: () => Promise<void>) => {
    setBusyAccounts((prev) => ({ ...prev, [accountId]: true }));
    try {
      await action();
    } catch (e) {
      host.toast.error(e instanceof CalendarCryptoError ? t(`error.${e.code}`) : String(e));
    } finally {
      setBusyAccounts((prev) => ({ ...prev, [accountId]: false }));
      await refresh();
    }
  };

  const loadAccount = (accountId: string) =>
    runAction(accountId, async () => {
      await getKeys(accountId);
    });

  const lockAccount = (accountId: string) =>
    runAction(accountId, async () => {
      await broadcastLockKey(accountId);
    });

  const renderStatusBadge = (status: Status) => {
    const config: Record<string, { bg: string; color: string; border: string; labelKey: string }> = {
      master_unavailable: {
        bg: 'color-mix(in srgb, var(--color-destructive, #dc2626) 8%, transparent)',
        color: 'var(--color-destructive, #dc2626)',
        border: 'color-mix(in srgb, var(--color-destructive, #dc2626) 22%, transparent)',
        labelKey: 'hint.master_unavailable',
      },
      master_locked: {
        bg: 'color-mix(in srgb, var(--color-warning, #d97706) 8%, transparent)',
        color: 'var(--color-warning, #d97706)',
        border: 'color-mix(in srgb, var(--color-warning, #d97706) 22%, transparent)',
        labelKey: 'hint.master_locked',
      },
      unlocked: {
        bg: 'color-mix(in srgb, var(--color-success, #16a34a) 8%, transparent)',
        color: 'var(--color-success, #16a34a)',
        border: 'color-mix(in srgb, var(--color-success, #16a34a) 22%, transparent)',
        labelKey: 'hint.master_unlocked_keys_loaded',
      },
      locked: {
        bg: 'color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent)',
        color: 'var(--color-primary, #3b82f6)',
        border: 'color-mix(in srgb, var(--color-primary, #3b82f6) 22%, transparent)',
        labelKey: 'hint.master_unlocked_keys_not_loaded',
      },
    };

    const style = config[status];
    if (!style) return null;

    return (
      <div
        style={{
          padding: '8px 12px',
          borderRadius: '6px',
          backgroundColor: style.bg,
          color: style.color,
          border: `1px solid ${style.border}`,
          fontSize: '13px',
          flex: 1,
        }}
      >
        {t(style.labelKey)}
      </div>
    );
  };

  const activeAccounts = selectedAccountId !== undefined
    ? accounts.filter((acc) => acc.id === selectedAccountId)
    : accounts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px' }}>
      <ProModeToggle
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{t('settings.title')}</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-muted-foreground, #64748b)' }}>
            {t('settings.desc')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeAccounts.map((account) => {
            const status = statuses[account.id] || 'loading';
            const isBusy = !!busyAccounts[account.id];

            return (
              <div
                key={account.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: selectedAccountId === undefined ? '8px' : undefined,
                  padding: selectedAccountId === undefined ? '12px' : undefined,
                  borderRadius: selectedAccountId === undefined ? '8px' : undefined,
                  border: selectedAccountId === undefined ? '1px solid var(--color-border, #e2e8f0)' : undefined,
                  backgroundColor: selectedAccountId === undefined ? 'var(--color-card, #ffffff)' : undefined,
                }}
              >
                {selectedAccountId === undefined && (
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-foreground, #0f172a)' }}>
                    {account.username || account.email || account.id}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {status === 'loading' ? (
                    <span style={{ fontSize: '13px', color: 'var(--color-muted-foreground, #64748b)' }}>
                      Loading...
                    </span>
                  ) : (
                    renderStatusBadge(status)
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {(status === 'master_unavailable' || status === 'master_locked') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void refresh()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                          cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
                          border: '1px solid var(--color-border, #e2e8f0)',
                          backgroundColor: 'var(--color-background, #ffffff)', color: 'var(--color-foreground, #0f172a)'
                        }}
                      >
                        {t('action.retry')}
                      </button>
                    )}

                    {status === 'locked' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => loadAccount(account.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                          cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
                          border: '1px solid var(--color-border, #e2e8f0)',
                          backgroundColor: 'var(--color-background, #ffffff)', color: 'var(--color-foreground, #0f172a)'
                        }}
                      >
                        {t('action.load')}
                      </button>
                    )}

                    {status === 'unlocked' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => lockAccount(account.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                          cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
                          border: '1px solid var(--color-border, #e2e8f0)',
                          backgroundColor: 'var(--color-background, #ffffff)', color: 'var(--color-foreground, #0f172a)'
                        }}
                      >
                        {t('action.lock')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}