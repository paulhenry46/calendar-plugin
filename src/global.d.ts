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
      getAccounts(): Promise<AccountEntry[]>;
    };
      calendar: {
        getEvent(eventId: string): Promise<any>;
      };
  }

  const host: Host;
  export default host;
}

declare module '@plugin-host/ui' {
  import * as React from 'react';

  export interface CommonProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }

  export interface StackProps extends CommonProps {
    gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  }

  export interface RowProps extends CommonProps {
    gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between' | 'around';
    fill?: boolean;
  }

  export interface TextProps extends CommonProps {
    color?: 'subtle' | 'muted' | 'default' | 'error' | 'success';
    size?: 'sm' | 'md' | 'lg';
  }

  export interface HeadingProps extends CommonProps {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
  }

  export interface ButtonProps extends CommonProps {
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    busy?: boolean;
    disabled?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    type?: 'button' | 'submit' | 'reset';
  }

  export interface BadgeProps extends CommonProps {
    variant?: 'neutral' | 'success' | 'warning' | 'destructive';
  }

  export interface IconProps extends CommonProps {
    name: string;
    size?: 'sm' | 'md' | 'lg' | string;
  }

  export interface AlertProps extends CommonProps {
    variant?: 'info' | 'success' | 'warning' | 'destructive';
  }

  export const Stack: React.FC<StackProps>;
  export const Row: React.FC<RowProps>;
  export const Text: React.FC<TextProps>;
  export const Heading: React.FC<HeadingProps>;
  export const Card: React.FC<CommonProps>;
  export const Button: React.FC<ButtonProps>;
  export const Badge: React.FC<BadgeProps>;
  export const Icon: React.FC<IconProps>;
  export const Alert: React.FC<AlertProps>;
  export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }>;
  
  // Composants additionnels de l'UI si besoin
  export const Field: React.FC<CommonProps>;
  export const Input: React.FC<any>;
  export const Select: React.FC<any>;
  export const Checkbox: React.FC<any>;
  export const DialogButtons: React.FC<CommonProps>;
}