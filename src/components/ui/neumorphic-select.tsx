'use client';

import { forwardRef, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface NeumorphicSelectProps {
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const NeumorphicSelect = forwardRef<HTMLDivElement, NeumorphicSelectProps>(
  ({ options, value, onChange, placeholder = 'Select...', loading, label, disabled, className }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const selectedOption = options.find(opt => opt.value === value);
    
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleSelect = (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
    };

    return (
      <div ref={ref} className={cn('relative', className)}>
        {label && (
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            {label}
          </label>
        )}
        
        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
            disabled={disabled || loading}
            className={cn(
              'w-full px-4 py-3 rounded-xl text-left',
              'flex items-center justify-between gap-2',
              'transition-all duration-200',
              'bg-[var(--bg-inset)]',
              'shadow-[inset_3px_3px_6px_var(--shadow-inset-dark),inset_-3px_-3px_6px_var(--shadow-inset-light)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]',
              disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              isOpen && 'ring-2 ring-[var(--accent-primary)]'
            )}
          >
            <span className={cn(
              'truncate',
              selectedOption ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            )}>
              {loading ? 'Loading...' : selectedOption?.label || placeholder}
            </span>
            
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" />
            </motion.div>
          </button>
          
          <AnimatePresence>
            {isOpen && options.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute z-50 w-full mt-2',
                  'bg-[var(--bg-elevated)] rounded-xl',
                  'shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]',
                  'max-h-60 overflow-y-auto',
                  'border border-[var(--shadow-dark)]/10'
                )}
              >
                <div className="p-2">
                  {options.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        'w-full px-3 py-2.5 rounded-lg text-left',
                        'flex items-center justify-between gap-2',
                        'transition-all duration-150',
                        option.value === value
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'hover:bg-[var(--bg-base)] hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{option.label}</div>
                        {option.sublabel && (
                          <div className={cn(
                            'text-sm truncate',
                            option.value === value ? 'text-white/80' : 'text-[var(--text-muted)]'
                          )}>
                            {option.sublabel}
                          </div>
                        )}
                      </div>
                      
                      {option.value === value && (
                        <Check className="w-4 h-4 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);

NeumorphicSelect.displayName = 'NeumorphicSelect';

export { NeumorphicSelect };
