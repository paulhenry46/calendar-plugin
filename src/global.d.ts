declare module '@plugin-host' {
  interface HostAccount {
    id: string;
    label?: string;
    email?: string;
    isActive: boolean;
    isConnected?: boolean;
    isDefault?: boolean;
  }

  interface Host {
    i18n: { t(key: string, params?: Record<string, string>): string };
    log: {
      info(msg: string, ...args: any[]): void;
      warn(msg: string, ...args: any[]): void;
      error(msg: string, ...args: any[]): void;
    };
    toast: {
      success(msg: string): void;
      error(msg: string): void;
      info(msg: string): void;
    };
    ui: {
      confirm(options: {
        title: string;
        message: string;
        danger?: boolean;
        confirmLabel?: string;
      }): Promise<boolean>;
    };
    user: {
      getAccounts(): Promise<HostAccount[]>;
    };
    api: {
      event: {
        get(eventId: string): Promise<any>;
      };
    };
  }

  const host: Host;
  export default host;
}
