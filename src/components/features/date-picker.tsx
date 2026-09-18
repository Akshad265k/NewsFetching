'use client';

import { useState, useEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { EARLIEST_DATE } from '@/lib/constants';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
  label?: string;
}

export function DatePicker({ value, onChange, disabled, label }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState<Date>(value || new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  
  const handleSelect = (date: Date | undefined) => {
    onChange(date || null);
    if (date) {
      setIsOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 rounded-xl text-left',
          'flex items-center justify-between gap-3',
          'transition-all duration-200',
          'bg-[var(--bg-inset)]',
          'shadow-[inset_3px_3px_6px_var(--shadow-inset-dark),inset_-3px_-3px_6px_var(--shadow-inset-light)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          isOpen && 'ring-2 ring-[var(--accent-primary)]'
        )}
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-[var(--accent-primary)]" />
          <span className={cn(
            value ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          )}>
            {value ? format(value, 'MMMM d, yyyy') : 'Pick a date...'}
          </span>
        </div>
        
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-[var(--text-secondary)]"
        >
          <ChevronLeft className="w-5 h-5 rotate-[-90deg]" />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'absolute mt-2 left-0',
              'bg-[var(--bg-elevated)] rounded-2xl',
              'shadow-[12px_12px_24px_var(--shadow-dark),-12px_-12px_24px_var(--shadow-light)]',
              'p-4 calendar-wrapper',
              'z-[100]',
              'min-w-[300px]'
            )}
          >
            <DayPicker
              mode="single"
              selected={value || undefined}
              onSelect={handleSelect}
              month={month}
              onMonthChange={setMonth}
              disabled={[
                { before: EARLIEST_DATE },
                { after: today }
              ]}
              startMonth={EARLIEST_DATE}
              endMonth={today}
              showOutsideDays={false}
              components={{
                Chevron: ({ orientation }) => (
                  orientation === 'left' 
                    ? <ChevronLeft className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />
                ),
              }}
            />
            
            <div className="mt-4 pt-4 border-t border-[var(--shadow-dark)]/10">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Available: Jul 29, 2025 - Today</span>
                {value && (
                  <button
                    onClick={() => onChange(null)}
                    className="text-[var(--accent-primary)] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
