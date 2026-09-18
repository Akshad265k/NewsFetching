'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface NeumorphicCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'pressed' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const NeumorphicCard = forwardRef<HTMLDivElement, NeumorphicCardProps>(
  ({ className, variant = 'elevated', padding = 'md', children, ...props }, ref) => {
    const variants = {
      elevated: `
        bg-[var(--bg-elevated)]
        shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]
      `,
      pressed: `
        bg-[var(--bg-inset)]
        shadow-[inset_4px_4px_8px_var(--shadow-inset-dark),inset_-4px_-4px_8px_var(--shadow-inset-light)]
      `,
      flat: `
        bg-[var(--bg-base)]
        shadow-none
      `,
    };
    
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-5',
      lg: 'p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl transition-all duration-300',
          variants[variant],
          paddings[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

NeumorphicCard.displayName = 'NeumorphicCard';

export { NeumorphicCard };
