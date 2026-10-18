import { useCallback, useEffect, useState } from 'react';
import React from 'react';
import host from '@plugin-host';
import { broadcastLockKey, isUnlockedLocally, subscribeToKeyUpdates } from '../crypto/broadcastChannel.ts';
import { CalendarCryptoError, getKeys } from '../crypto/getKey.ts';
import { getDataFromMaster } from '../crypto/masterPlugin.ts';
import { getCurrentAccountId } from '../util.ts';
import { btn, card } from './shared.ts';

type Status =
  | 'loading'
  | 'no_account'
  | 'master_unavailable' // maître absent ou verrouillé
  | 'no_keys' // maître OK, aucune clé calendrier pour ce compte
  | 'locked' // clés présentes chez le maître, pas encore chargées en session
  | 'unlocked';

const t = (key: string) => host.i18n.t(key);

export function SettingsSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const id = await getCurrentAccountId();
    setAccountId(id);
    if (!id) return setStatus('no_account');
    if (isUnlockedLocally(id)) return setStatus('unlocked');

    const response = await getDataFromMaster(id);
    if (!response) return setStatus('master_unavailable');
    setStatus(response.data ? 'locked' : 'no_keys');
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToKeyUpdates(() => void refresh());
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      host.toast.error(e instanceof CalendarCryptoError ? t(`calendar.error.${e.code}`) : String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const load = () => run(async () => void (await getKeys(accountId!)));

  const generate = () =>
    run(async () => {
      const ok = await host.ui.confirm({
        title: t('calendar.generate.title'),
        message: t('calendar.generate.message'),
        confirmLabel: t('calendar.generate.confirm'),
        danger: true,
      });
      if (!ok) return;
      await getKeys(accountId!, { createIfMissing: true });
      host.toast.success(t('calendar.generate.done'));
    });

  const lock = () => run(async () => broadcastLockKey(accountId));

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <div>
        <strong>{t('calendar.title')}</strong>
        <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{t('calendar.desc')}</p>
      </div>

      <p style={{ margin: 0 }}>{t(`calendar.status.${status}`)}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'master_unavailable' && (
          <button style={btn} disabled={busy} onClick={() => void refresh()}>
            {t('calendar.action.retry')}
          </button>
        )}
        {status === 'locked' && (
          <button style={btn} disabled={busy} onClick={load}>
            {t('calendar.action.load')}
          </button>
        )}
        {status === 'no_keys' && (
          <button style={btn} disabled={busy} onClick={generate}>
            {t('calendar.action.generate')}
          </button>
        )}
        {status === 'unlocked' && (
          <button style={btn} disabled={busy} onClick={lock}>
            {t('calendar.action.lock')}
          </button>
        )}
      </div>
    </div>
  );
}