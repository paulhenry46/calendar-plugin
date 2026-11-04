import React, { useCallback, useEffect, useState } from 'react';
import host from '@plugin-host';

import { broadcastLockKey, fetchKeyFromBackground, subscribeToKeyUpdates } from '../crypto/broadcastChannel.ts';
import { CalendarCryptoError, getKeys } from '../crypto/getKey.ts';
import { getDataFromMaster } from '../crypto/masterPlugin.ts';
import { getCurrentAccountId } from '../util.ts';
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

const t = (key: string) => host.i18n.t(key);

export function SettingsSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
      try {
        const accs = await host.user.getAccounts();
        setAccounts(accs || []);
      } catch (e) {
      }

    const defaultId = await getCurrentAccountId();
    const targetId = selectedAccountId !== undefined ? selectedAccountId : defaultId;

    if (!targetId) return setStatus('no_account');
    if (await fetchKeyFromBackground(targetId)) return setStatus('unlocked');

    const response = await getDataFromMaster(targetId);
    if (response.state === 'unavailable') return setStatus('master_unavailable');
    if (response.state === 'locked') return setStatus('master_locked');
    setStatus(response.data ? 'locked' : 'no_keys');
  }, [selectedAccountId]);

  useEffect(() => {
    void refresh();
    return subscribeToKeyUpdates(() => void refresh());
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      host.toast.error(e instanceof CalendarCryptoError ? t(`error.${e.code}`) : String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const getEffectiveAccountId = async () => {
    return selectedAccountId !== undefined ? selectedAccountId : await getCurrentAccountId();
  };

  const load = () =>
    run(async () => {
      const id = await getEffectiveAccountId();
      if (id) void (await getKeys(id));
    });

  const lock = () =>
    run(async () => {
      const id = await getEffectiveAccountId();
      await broadcastLockKey(id);
    });

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

        {status === 'master_unavailable' && (
          <div style={{ 
            padding: '12px', 
            borderRadius: '6px', 
            backgroundColor: 'color-mix(in srgb, var(--color-destructive, #dc2626) 8%, transparent)', 
            color: 'var(--color-destructive, #dc2626)', 
            border: '1px solid color-mix(in srgb, var(--color-destructive, #dc2626) 22%, transparent)', 
            fontSize: '13px' 
          }}>
            {t('hint.master_unavailable')}
          </div>
        )}
        {status === 'master_locked' && (
          <div style={{ 
            padding: '12px', 
            borderRadius: '6px', 
            backgroundColor: 'color-mix(in srgb, var(--color-warning, #d97706) 8%, transparent)', 
            color: 'var(--color-warning, #d97706)', 
            border: '1px solid color-mix(in srgb, var(--color-warning, #d97706) 22%, transparent)', 
            fontSize: '13px' 
          }}>
            {t('hint.master_locked')}
          </div>
        )}
        {status === 'unlocked' && (
          <div style={{ 
            padding: '12px', 
            borderRadius: '6px', 
            backgroundColor: 'color-mix(in srgb, var(--color-success, #16a34a) 8%, transparent)', 
            color: 'var(--color-success, #16a34a)', 
            border: '1px solid color-mix(in srgb, var(--color-success, #16a34a) 22%, transparent)', 
            fontSize: '13px' 
          }}>
            {t('hint.master_unlocked_keys_loaded')}
          </div>
        )}

        {status === 'locked' && (
          <div style={{ 
            padding: '12px', 
            borderRadius: '6px', 
            backgroundColor: 'color-mix(in srgb, var(--color-primary, #3b82f6) 8%, transparent)', 
            color: 'var(--color-primary, #3b82f6)', 
            border: '1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 22%, transparent)', 
            fontSize: '13px' 
          }}>
            {t('hint.master_unlocked_keys_not_loaded')}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status === 'loading' && <span style={{ fontSize: '13px', color: 'var(--color-muted-foreground, #64748b)' }}>Loading...</span>}

          {(status === 'master_unavailable' || status === 'master_locked') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
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
              disabled={busy}
              onClick={load}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
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
              disabled={busy}
              onClick={lock}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '0.375rem', fontWeight: 500, height: '2.25rem', padding: '0 1rem',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
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
}