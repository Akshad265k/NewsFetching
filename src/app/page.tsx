'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Newspaper,
  BookOpen,
  RefreshCw,
  Calendar,
  Languages,
  FileText,
  Download,
  Eye,
  Database,
  Sparkles,
} from 'lucide-react';
import { useNewspaper } from '@/hooks/use-newspaper';
import { DatePicker } from '@/components/features/date-picker';
import { DownloadProgress } from '@/components/features/download-progress';
import { ReaderModal } from '@/components/features/reader-modal';
import { DatasetPanel } from '@/components/features/dataset-panel';
import { NeumorphicSelect } from '@/components/ui/neumorphic-select';
import { NeumorphicCard } from '@/components/ui/neumorphic-card';
import { NeumorphicButton } from '@/components/ui/neumorphic-button';
import { cn } from '@/lib/utils/cn';
import { format } from 'date-fns';

export default function Home() {
  const [viewMode, setViewMode] = useState<'reader' | 'dataset'>('reader');

  const {
    date,
    language,
    newspaper,
    edition,
    languages,
    newspapers,
    editions,
    downloadReady,
    error,
    progress,
    loading,
    setDate,
    setLanguage,
    setNewspaper,
    setEdition,
    startDownload,
    triggerDownload,
    cancelDownload,
    reset,
    canStartDownload,
    isAnyLoading,
    selectedNewspaper,
    selectedEdition,
  } = useNewspaper();

  // Reader Modal State
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [readerData, setReaderData] = useState<{
    type: string;
    totalPages: number;
    pages: string[];
  } | null>(null);

  const handleReadOnline = async () => {
    if (!date || !language || !newspaper || !edition) return;

    setIsReaderOpen(true);
    setReaderLoading(true);
    setReaderError(null);
    setReaderData(null);

    try {
      const dateStr = format(date, 'yyyyMMdd');
      const response = await fetch(
        `/api/reader?date=${dateStr}&language=${encodeURIComponent(language)}&newspaper=${encodeURIComponent(newspaper)}&edition=${encodeURIComponent(edition)}`
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setReaderData({
          type: data.type,
          totalPages: data.totalPages,
          pages: data.pages,
        });
      } else {
        setReaderError(data.error || 'Failed to load edition for online reading');
      }
    } catch {
      setReaderError('Network error while loading reader pages. Please try again.');
    } finally {
      setReaderLoading(false);
    }
  };

  const languageOptions = languages.map((l) => ({
    value: l.id,
    label: l.name,
    sublabel: l.nativeName !== l.name ? l.nativeName : undefined,
  }));

  const newspaperOptions = newspapers.map((n) => ({
    value: n.id,
    label: n.name,
  }));

  const editionOptions = editions.map((e) => ({
    value: e.id,
    label: e.name,
    sublabel: e.pagesCount ? `${e.pagesCount} pages` : undefined,
  }));

  const showSelectionSummary = date && language && newspaper && edition && !loading.download && !downloadReady;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      {/* Fixed Header */}
      <header className="sticky top-0 left-0 right-0 z-[100] glass-effect border-b border-[var(--shadow-dark)]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative flex items-center justify-between h-16">
            {/* Logo */}
            <motion.div
              className="flex items-center gap-3 lg:absolute lg:left-1/2 lg:-translate-x-1/2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-xl',
                  'bg-[var(--bg-elevated)]',
                  'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
                  'flex items-center justify-center'
                )}
              >
                <BookOpen className="w-5 h-5 text-[var(--accent-primary)]" />
              </div>
              <h1 className="text-base sm:text-lg font-bold font-[var(--font-heading)] text-[var(--text-primary)] whitespace-nowrap">
                The Chronicle Vault
              </h1>
            </motion.div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {isAnyLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
                    'bg-[var(--bg-elevated)]',
                    'shadow-[3px_3px_6px_var(--shadow-dark),-3px_-3px_6px_var(--shadow-light)]'
                  )}
                >
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  <span className="text-[var(--text-muted)]">Loading...</span>
                </motion.div>
              )}

              {date && (
                <NeumorphicButton variant="ghost" size="sm" onClick={reset}>
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Reset</span>
                </NeumorphicButton>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Mode Switcher Tabs */}
        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex p-1 rounded-2xl bg-[var(--bg-inset)] shadow-[inset_3px_3px_6px_var(--shadow-inset-dark),inset_-3px_-3px_6px_var(--shadow-inset-light)]">
            <button
              type="button"
              onClick={() => setViewMode('reader')}
              className={cn(
                'flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer',
                viewMode === 'reader'
                  ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)] shadow-[3px_3px_6px_var(--shadow-dark),-3px_-3px_6px_var(--shadow-light)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <BookOpen className="w-4 h-4" />
              <span>E-Paper Reader & PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dataset')}
              className={cn(
                'flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer',
                viewMode === 'dataset'
                  ? 'bg-[var(--bg-elevated)] text-[var(--accent-primary)] shadow-[3px_3px_6px_var(--shadow-dark),-3px_-3px_6px_var(--shadow-light)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <Database className="w-4 h-4" />
              <span>OCR Dataset Studio</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]">
                <Sparkles className="w-2.5 h-2.5" /> Python
              </span>
            </button>
          </div>
        </div>

        {/* Hero Section - shown when nothing selected */}
        <AnimatePresence mode="wait">
          {!date && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center mb-8"
            >
              <h2 className="text-3xl sm:text-4xl font-bold font-[var(--font-heading)] text-[var(--text-primary)] mb-3">
                {viewMode === 'dataset' ? 'Indian Newspaper OCR Pipeline' : 'Access Indian Newspapers'}
              </h2>
              <p className="text-lg text-[var(--text-secondary)] max-w-lg mx-auto mb-2">
                {viewMode === 'dataset'
                  ? 'Collect high-res 300 DPI page images & metadata for Marathi, Hindi, and regional OCR'
                  : 'From across 14 languages'}
              </p>
              <p className="text-sm text-[var(--text-muted)] italic mb-6">
                &ldquo;Where yesterday&apos;s news becomes tomorrow&apos;s history&rdquo;
              </p>

              {/* Stats */}
              <div className="flex items-center justify-center gap-6 text-sm text-[var(--text-muted)]">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Jul 2025 - Today
                </span>
                <span className="flex items-center gap-2">
                  <Languages className="w-4 h-4" />
                  14 Languages
                </span>
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  100+ Papers
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selection Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <NeumorphicCard className="mb-6">
            {/* Title */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className={cn(
                  'w-8 h-8 rounded-lg',
                  'bg-[var(--accent-primary)]/10',
                  'flex items-center justify-center'
                )}
              >
                <Newspaper className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <h3 className="text-lg font-semibold font-[var(--font-heading)] text-[var(--text-primary)]">
                Select Newspaper
              </h3>
            </div>

            {/* Selectors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Date Picker */}
              <div>
                <DatePicker value={date} onChange={setDate} label="Date" />
                <button
                  type="button"
                  onClick={() => setDate(new Date(2026, 8, 17))}
                  className="mt-1.5 text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  ⚡ Load snapshot (17 Sep 2026)
                </button>
              </div>

              {/* Language Selector */}
              <NeumorphicSelect
                label="Language"
                options={languageOptions}
                value={language}
                onChange={setLanguage}
                placeholder={date ? 'Select language...' : 'Select date first'}
                disabled={!date || loading.languages}
                loading={loading.languages}
              />

              {/* Newspaper Selector */}
              <NeumorphicSelect
                label="Newspaper"
                options={newspaperOptions}
                value={newspaper}
                onChange={setNewspaper}
                placeholder={language ? 'Select newspaper...' : 'Select language first'}
                disabled={!language || loading.newspapers}
                loading={loading.newspapers}
              />

              {/* Edition Selector */}
              <NeumorphicSelect
                label="Edition"
                options={editionOptions}
                value={edition}
                onChange={setEdition}
                placeholder={newspaper ? 'Select edition...' : 'Select newspaper first'}
                disabled={!newspaper || loading.editions}
                loading={loading.editions}
              />
            </div>

            {/* In Reader Mode: Selection Summary & Action Buttons */}
            {viewMode === 'reader' && (
              <>
                <AnimatePresence mode="wait">
                  {showSelectionSummary && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          'rounded-xl p-4 mb-4',
                          'bg-[var(--bg-inset)]',
                          'shadow-[inset_3px_3px_6px_var(--shadow-inset-dark),inset_-3px_-3px_6px_var(--shadow-inset-light)]'
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          <span className="text-[var(--text-muted)]">
                            <span className="font-medium text-[var(--text-primary)]">
                              {selectedNewspaper?.name}
                            </span>
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {date && format(date, 'MMMM d, yyyy')}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {selectedEdition?.name}
                            {selectedEdition?.pagesCount && ` • ${selectedEdition.pagesCount} pages`}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Buttons Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Read Online Button */}
                  <NeumorphicButton
                    variant="default"
                    size="lg"
                    disabled={!canStartDownload || loading.download}
                    onClick={handleReadOnline}
                    className="w-full flex items-center justify-center gap-2 border border-[var(--accent-primary)]/30 hover:border-[var(--accent-primary)]/60 text-[var(--accent-primary)]"
                  >
                    <Eye className="w-5 h-5 text-[var(--accent-primary)]" />
                    <span>Read Online</span>
                  </NeumorphicButton>

                  {/* Download Button */}
                  <NeumorphicButton
                    variant="primary"
                    size="lg"
                    disabled={!canStartDownload || loading.download || downloadReady}
                    onClick={startDownload}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download PDF</span>
                  </NeumorphicButton>
                </div>
              </>
            )}
          </NeumorphicCard>
        </motion.div>

        {/* View Mode: Reader vs Dataset */}
        {viewMode === 'reader' ? (
          <>
            {/* Download Progress Section */}
            <AnimatePresence>
              {(progress || downloadReady || error || loading.download) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <DownloadProgress
                    progress={progress}
                    isDownloading={loading.download}
                    downloadReady={downloadReady}
                    error={error}
                    onDownload={triggerDownload}
                    onCancel={cancelDownload}
                    onRetry={startDownload}
                    newspaperName={selectedNewspaper?.name}
                    editionName={selectedEdition?.name}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Info Section */}
            <AnimatePresence>
              {date && !loading.download && !downloadReady && !progress && !error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-8"
                >
                  <NeumorphicCard variant="pressed" padding="sm">
                    <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
                      <p>
                        <strong>Archive Range:</strong> July 29, 2025 - Today
                      </p>
                      <p>
                        <strong>Languages:</strong> Bengali, Hindi, English, Tamil, Telugu, and 9 more
                      </p>
                      <p>
                        <strong>Papers:</strong> 100+ regional and national publications
                      </p>
                    </div>
                  </NeumorphicCard>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* OCR Dataset Studio View */
          <DatasetPanel
            date={date}
            language={language}
            newspaper={newspaper}
            edition={edition}
            newspaperName={selectedNewspaper?.name}
            editionName={selectedEdition?.name}
          />
        )}
      </main>

      {/* Reader Modal */}
      <ReaderModal
        isOpen={isReaderOpen}
        onClose={() => setIsReaderOpen(false)}
        newspaperName={selectedNewspaper?.name || 'Newspaper'}
        editionName={selectedEdition?.name || 'Edition'}
        dateStr={date ? format(date, 'MMMM d, yyyy') : ''}
        onDownload={startDownload}
        readerData={readerData}
        isLoading={readerLoading}
        error={readerError}
      />

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-[var(--shadow-dark)]/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
            <p>© {new Date().getFullYear()} The Chronicle Vault</p>
            <p className="text-xs">Indian Newspaper Archive • 14 Languages • 100+ Publications</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
