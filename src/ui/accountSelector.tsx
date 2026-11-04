import React, { useId } from 'react';
import { AccountEntry } from '../types.ts';
import host from '@plugin-host';
interface ProModeToggleProps {
  accounts: AccountEntry[];
  selectedAccountId: string | undefined;
  onSelectAccount: (accountId: string | undefined) => void;
  className?: string;
}

export const ProModeToggle: React.FC<ProModeToggleProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  className = '',
}) => {
  const labelId = useId();
  const isProMode = selectedAccountId === undefined;
  const connectedAccount = accounts.find((acc) => acc.isActive || (acc as any).isActive);

  const handleToggle = () => {
    if (isProMode) {
      onSelectAccount(connectedAccount?.id);
    } else {
      onSelectAccount(undefined);
    }
  };

  return (
    <>
      <style>{`
        .pro-toggle-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding-top: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
        }
        @media (min-width: 640px) {
          .pro-toggle-container {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
          }
        }
        .pro-toggle-info {
          flex: 1 1 0%;
          min-width: 0;
        }
        @media (min-width: 640px) {
          .pro-toggle-info {
            padding-end: 1rem;
          }
        }
        .pro-toggle-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-foreground, #111827);
          margin: 0;
        }
        .pro-toggle-desc {
          font-size: 0.75rem;
          color: var(--color-muted-foreground, #6b7280);
          margin-top: 0.25rem;
          margin-bottom: 0;
        }
        .pro-toggle-desc-highlight {
          color: #d97706;
          font-weight: 500;
        }
        .pro-toggle-action {
          flex-shrink: 0;
        }
        .pro-switch-btn {
          position: relative;
          display: inline-flex;
          height: 1.5rem;
          width: 2.75rem;
          align-items: center;
          border-radius: 9999px;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: background-color 150ms ease-in-out;
          background-color: var(--color-muted, #e5e7eb);
        }
        .pro-switch-btn[aria-checked="true"] {
          background-color: var(--color-primary, #2563eb);
        }
        .pro-switch-thumb {
          display: inline-block;
          height: 1rem;
          width: 1rem;
          border-radius: 9999px;
          background-color: var(--color-background, #ffffff);
          transition: transform 150ms ease-in-out;
          transform: translateX(0.25rem);
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
        .pro-switch-btn[aria-checked="true"] .pro-switch-thumb {
          transform: translateX(1.5rem);
        }
      `}</style>

      <div
        data-search-label="Mode Pro"
        className={`pro-toggle-container ${className}`}
      >
        <div className="pro-toggle-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <label id={labelId} className="pro-toggle-label">
              {host.i18n.t('settings.pro_mode_title')}
            </label>
          </div>
          <p className="pro-toggle-desc">
            {isProMode ? (
              <span className="pro-toggle-desc-highlight">
               {host.i18n.t('settings.pro_mode_desc')}
              </span>
            ) : (
              <span>
                {host.i18n.t('settings.account_mode_desc')} <strong>{connectedAccount?.displayName || connectedAccount?.email}</strong>
              </span>
            )}
          </p>
        </div>

        <div className="pro-toggle-action">
          <button
            type="button"
            role="switch"
            aria-checked={isProMode}
            aria-labelledby={labelId}
            onClick={handleToggle}
            className="pro-switch-btn"
          >
            <span className="pro-switch-thumb" />
          </button>
        </div>
      </div>
    </>
  );
};