'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  FileText,
  Shield,
  Database,
  HardDrive,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { NeumorphicButton } from '@/components/ui/neumorphic-button';
import type { ProgressState } from '@/types';

interface DownloadProgressProps {
  progress: ProgressState | null;
  isDownloading: boolean;
  downloadReady: boolean;
  error: string | null;
  onDownload: () => void;
  onCancel: () => void;
  onRetry: () => void;
  newspaperName?: string;
  editionName?: string;
}

const stageConfig = {
  validating: { icon: Shield, label: 'Validating', color: 'text-[var(--accent-primary)]' },
  fetching: { icon: Database, label: 'Fetching Data', color: 'text-[var(--accent-primary)]' },
  downloading: { icon: HardDrive, label: 'Downloading', color: 'text-[var(--accent-primary)]' },
  decrypting: { icon: Shield, label: 'Decrypting', color: 'text-[var(--accent-highlight)]' },
  merging: { icon: FileText, label: 'Merging', color: 'text-[var(--accent-secondary)]' },
  complete: { icon: CheckCircle, label: 'Complete', color: 'text-[var(--state-success)]' },
  error: { icon: AlertCircle, label: 'Error', color: 'text-[var(--state-error)]' },
};

const stages = ['validating', 'fetching', 'downloading', 'decrypting', 'merging', 'complete'] as const;

export function DownloadProgress({
  progress,
  isDownloading,
  downloadReady,
  error,
  onDownload,
  onCancel,
  onRetry,
  newspaperName,
  editionName,
}: DownloadProgressProps) {
  const [showLogs, setShowLogs] = useState(false);

  if (!progress && !error && !downloadReady && !isDownloading) {
    return null;
  }

  if (!progress && isDownloading && !error && !downloadReady) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl p-6',
          'bg-[var(--bg-elevated)]',
          'shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]'
        )}
      >
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin" />
          <div>
            <p className="font-medium text-[var(--text-primary)]">Finalizing download...</p>
            <p className="text-sm text-[var(--text-muted)]">Preparing your PDF. This can take a few seconds on mobile.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Error state
  if (error && !downloadReady) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={cn(
          'rounded-2xl p-6',
          'bg-[var(--bg-elevated)]',
          'shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]'
        )}
      >
        <div className="flex items-start gap-4">
          <div className={cn(
            'w-12 h-12 rounded-xl flex-shrink-0',
            'bg-[var(--state-error)]/10',
            'flex items-center justify-center'
          )}>
            <AlertCircle className="w-6 h-6 text-[var(--state-error)]" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              Download Failed
            </h3>
            <p className="text-[var(--text-secondary)] text-sm mb-4 whitespace-pre-wrap">
              {error}
            </p>
            
            <div className="flex items-center gap-3">
              <NeumorphicButton onClick={onRetry} size="sm">
                Try Again
              </NeumorphicButton>
              <NeumorphicButton variant="ghost" onClick={onCancel} size="sm">
                Cancel
              </NeumorphicButton>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Download ready state
  if (downloadReady && progress?.status === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={cn(
          'rounded-2xl p-6',
          'bg-[var(--bg-elevated)]',
          'shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]'
        )}
      >
        <div className="flex items-start gap-4">
          <div className={cn(
            'w-14 h-14 rounded-xl flex-shrink-0',
            'bg-[var(--state-success)]/10',
            'flex items-center justify-center'
          )}>
            <CheckCircle className="w-7 h-7 text-[var(--state-success)]" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--text-primary)] text-lg mb-1">
              Download Ready
            </h3>
            <p className="text-[var(--text-secondary)] mb-1">
              {newspaperName && <span className="font-medium">{newspaperName}</span>}
              {editionName && <span> • {editionName}</span>}
            </p>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {progress.message}
            </p>
            
            <NeumorphicButton 
              variant="primary" 
              size="lg" 
              onClick={onDownload}
              className="gap-2"
            >
              <Download className="w-5 h-5" />
              Download PDF
            </NeumorphicButton>
          </div>
        </div>
      </motion.div>
    );
  }

  // Progress state (downloading)
  if (progress && progress.status === 'running') {
    const currentStageIndex = stages.indexOf(progress.stage as typeof stages[number]);
    const config = stageConfig[progress.stage] || stageConfig.downloading;
    const StageIcon = config.icon;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl overflow-hidden',
          'bg-[var(--bg-elevated)]',
          'shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)]'
        )}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg',
                'bg-[var(--accent-primary)]/10',
                'flex items-center justify-center'
              )}>
                <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Preparing Download
                </h3>
                {newspaperName && (
                  <p className="text-sm text-[var(--text-muted)]">{newspaperName}</p>
                )}
              </div>
            </div>
            
            <button
              onClick={onCancel}
              className={cn(
                'p-2 rounded-lg transition-all duration-200',
                'hover:bg-[var(--bg-inset)]',
                'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stage Indicator */}
          <div className="flex items-center gap-2 mb-6">
            {stages.slice(0, -1).map((stage, index) => {
              const isActive = index === currentStageIndex;
              const isComplete = index < currentStageIndex;
              
              return (
                <div key={stage} className="flex-1 flex items-center gap-2">
                  <div className={cn(
                    'h-1.5 flex-1 rounded-full transition-all duration-300',
                    isComplete 
                      ? 'bg-[var(--state-success)]'
                      : isActive
                        ? 'bg-[var(--accent-primary)]'
                        : 'bg-[var(--bg-inset)] shadow-[inset_1px_1px_2px_var(--shadow-inset-dark)]'
                  )}>
                    {isActive && (
                      <motion.div
                        className="h-full bg-[var(--accent-secondary)] rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ 
                          width: progress.total && progress.current !== undefined 
                            ? `${(progress.current / progress.total) * 100}%` 
                            : '30%' 
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current Stage Display */}
          <div className={cn(
            'rounded-xl p-4 mb-4',
            'bg-[var(--bg-inset)]',
            'shadow-[inset_3px_3px_6px_var(--shadow-inset-dark),inset_-3px_-3px_6px_var(--shadow-inset-light)]'
          )}>
            <div className="flex items-center gap-3">
              <StageIcon className={cn('w-5 h-5', config.color)} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--text-primary)]">
                  {config.label}
                </p>
                <p className="text-sm text-[var(--text-muted)] truncate">
                  {progress.message}
                </p>
              </div>
              {progress.total && progress.current !== undefined && (
                <div className="text-sm font-medium text-[var(--text-secondary)]">
                  {progress.current} / {progress.total}
                </div>
              )}
            </div>

            {/* Detailed Progress Bar */}
            {progress.total && progress.current !== undefined && (
              <div className="mt-3">
                <div className={cn(
                  'h-2 rounded-full overflow-hidden',
                  'bg-[var(--bg-base)]',
                  'shadow-[inset_1px_1px_2px_var(--shadow-inset-dark)]'
                )}>
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reassuring Message */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 3, duration: 0.5 }}
            className={cn(
              'rounded-xl p-3 mb-4',
              'bg-gradient-to-r from-[var(--accent-primary)]/5 to-[var(--accent-secondary)]/5',
              'border border-[var(--accent-primary)]/10'
            )}
          >
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <span className="font-medium text-[var(--text-primary)]">Processing large files?</span>
                {' '}If progress appears paused, don&apos;t worry — the server is actively working. 
                Decryption and merging can take a moment. Just hang tight! ✨
              </p>
            </div>
          </motion.div>

          {/* Logs Section */}
          {progress.logs && progress.logs.length > 0 && (
            <div>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className={cn(
                  'flex items-center gap-2 text-sm text-[var(--text-muted)]',
                  'hover:text-[var(--text-secondary)] transition-colors'
                )}
              >
                {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showLogs ? 'Hide' : 'Show'} activity log ({progress.logs.length})
              </button>
              
              <AnimatePresence>
                {showLogs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className={cn(
                      'mt-3 p-3 rounded-lg max-h-32 overflow-y-auto',
                      'bg-[var(--bg-base)]',
                      'font-mono text-xs'
                    )}>
                      {progress.logs.slice(-10).map((log, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            'py-0.5',
                            i === progress.logs.length - 1 
                              ? 'text-[var(--text-primary)]' 
                              : 'text-[var(--text-muted)]'
                          )}
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return null;
}
