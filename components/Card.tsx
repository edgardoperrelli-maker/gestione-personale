import * as React from 'react';

type CardProps = React.HTMLAttributes<HTMLDivElement>;

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }: CardHeaderProps) {
  return <div className={`border-b border-[var(--brand-border)] px-4 py-3 ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }: CardContentProps) {
  return <div className={`px-4 py-4 ${className}`} {...props} />;
}
