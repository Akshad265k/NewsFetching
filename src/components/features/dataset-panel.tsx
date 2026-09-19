'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Play,
  Terminal,
  FileSpreadsheet,
  Layers,
  HardDrive,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Maximize2,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { NeumorphicCard } from '@/components/ui/neumorphic-card';
import { NeumorphicButton } from '@/components/ui/neumorphic-button';
import { cn } from '@/lib/utils/cn';
import { format } from 'date-fns';

interface DatasetPanelProps {
  date: Date | null | undefined;
  language: string | null;
  newspaper: string | null;
  edition: string | null;
  newspaperName?: string;
  editionName?: string;
}

interface ManifestStats {
  totalPages: number;
  totalIssues: number;
  diskSizeMb: string;
  languageCounts: Record<string, number>;
  newspaperCounts: Record<string, number>;
}

interface ManifestRecord {
  id: string;
  date: string;
  language: string;
  newspaper: string;
  edition: string;
  page_number: string;
  image_path: string;
  pdf_path: string;
  source: string;
  source_url: string;
}

interface JobProgress {
  id: string;
  status: 'running' | 'complete' | 'error';
  stage: string;
  message: string;
  current: number;
  total: number;
  logs: string[];
  record?: any;
  error?: string;
}

export function DatasetPanel({
  date,
  language,
  newspaper,
  edition,
  newspaperName,
  editionName,
}: DatasetPanelProps) {
  // Collection settings
  const [collectAllEditions, setCollectAllEditions] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [activeJob, setActiveJob] = useState<JobProgress | null>(null);
  const [showLogs, setShowLogs] = useState(true);

  // Manifest and stats
  const [stats, setStats] = useState<ManifestStats | null>(null);
  const [recentPages, setRecentPages] = useState<ManifestRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // Lightbox preview modal
  const [selectedPreview, setSelectedPreview] = useState<ManifestRecord | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const activeJobIdRef = useRef<string | null>(null);

  // Auto scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeJob?.logs, showLogs]);

  // Load manifest & stats
  const loadManifestData = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/dataset/manifest');
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
        setRecentPages(data.recentPages || []);
      }
    } catch (err) {
      console.error('Failed to load dataset manifest:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadManifestData();
  }, [loadManifestData]);

  // Handle SSE progress stream
  const connectProgressStream = useCallback((jobId: string) => {
    activeJobIdRef.current = jobId;
    const eventSource = new EventSource(`/api/dataset/collect?jobId=${jobId}&stream=true`);

    eventSource.onmessage = (e) => {
      try {
        const jobData: JobProgress = JSON.parse(e.data);
        setActiveJob(jobData);

        if (jobData.status === 'complete') {
          setIsCollecting(false);
          eventSource.close();
          loadManifestData();
        } else if (jobData.status === 'error') {
          setIsCollecting(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      // Fallback to polling if SSE encounters issues
      eventSource.close();
      const interval = setInterval(async () => {
        if (!activeJobIdRef.current) {
          clearInterval(interval);
          return;
        }
        try {
          const res = await fetch(`/api/dataset/collect?jobId=${jobId}`);
          const pollData = await res.json();
          if (pollData.success && pollData.job) {
            setActiveJob(pollData.job);
            if (pollData.job.status === 'complete' || pollData.job.status === 'error') {
              setIsCollecting(false);
              clearInterval(interval);
              loadManifestData();
            }
          }
        } catch {}
      }, 1500);
    };
  }, [loadManifestData]);

  // Start Collection
  const handleStartCollection = async () => {
    if (!date || !language) return;

    setIsCollecting(true);
    const dateStr = format(date, 'yyyy-MM-dd');
    const targetEdition = collectAllEditions ? 'all' : edition || 'all';
    const targetNewspaper = newspaper || 'all';

    try {
      const res = await fetch('/api/dataset/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          language,
          newspaper: targetNewspaper,
          edition: targetEdition,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.jobId) {
        setActiveJob({
          id: data.jobId,
          status: 'running',
          stage: 'resolving',
          message: 'Initializing collection task...',
          current: 0,
          total: 1,
          logs: ['Collection job started'],
        });
        connectProgressStream(data.jobId);
      } else {
        setIsCollecting(false);
        alert(data.error || 'Failed to start collection');
      }
    } catch (err: any) {
      setIsCollecting(false);
      alert(err.message || 'Network error while initiating collection');
    }
  };

  const progressPercent = activeJob && activeJob.total > 0
    ? Math.min(100, Math.round((activeJob.current / activeJob.total) * 100))
    : activeJob?.status === 'complete' ? 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Card */}
      <NeumorphicCard className="relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/15 flex items-center justify-center shadow-inner">
              <Database className="w-6 h-6 text-[var(--accent-primary)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-[var(--font-heading)] text-[var(--text-primary)]">
                  OCR Research Dataset Studio
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]">
                  <Sparkles className="w-3 h-3" /> Python PyMuPDF
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Renders 300 DPI JPEG pages, decrypts locked PDF archives, and builds OCR metadata catalogs.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <a
              href="/api/dataset/manifest?download=true"
              download="manifest.csv"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-[3px_3px_6px_var(--shadow-dark),-3px_-3px_6px_var(--shadow-light)] hover:-translate-y-0.5 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Export Manifest (.csv)</span>
            </a>

            <NeumorphicButton
              variant="ghost"
              size="sm"
              onClick={loadManifestData}
              disabled={loadingStats}
              className="px-3 py-2 text-xs"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loadingStats && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </NeumorphicButton>
          </div>
        </div>

        {/* Dataset Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[var(--shadow-dark)]/10">
          {/* Total Pages */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
              <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>OCR Pages</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {stats?.totalPages ?? 0}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              300 DPI high-res JPEGs
            </div>
          </div>

          {/* Total Issues */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Issues Assembled</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {stats?.totalIssues ?? 0}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              Merged PDFs + Manifest
            </div>
          </div>

          {/* Disk Footprint */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
              <span>Dataset Size</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {stats?.diskSizeMb ? `${stats.diskSizeMb} MB` : '0 MB'}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              Local repository footprint
            </div>
          </div>

          {/* Languages breakdown */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Languages</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {stats?.languageCounts && Object.keys(stats.languageCounts).length > 0 ? (
                Object.entries(stats.languageCounts).map(([lang, count]) => (
                  <span
                    key={lang}
                    className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-primary)] capitalize"
                  >
                    {lang}: {count}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--text-muted)]">No data yet</span>
              )}
            </div>
          </div>
        </div>
      </NeumorphicCard>

      {/* Collection Control Panel */}
      <NeumorphicCard>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Collect Selected Newspaper Issue
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Uses Python PyMuPDF backend with automatic locked PDF decryption (10-char auth) and 300 DPI rendering.
            </p>
          </div>

          {/* Collect All Editions Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-primary)] select-none">
            <input
              type="checkbox"
              checked={collectAllEditions}
              onChange={(e) => setCollectAllEditions(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] bg-[var(--bg-inset)] border-none"
            />
            <span>Collect All Editions for this newspaper</span>
          </label>
        </div>

        {/* Selected target summary */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)] mb-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="text-[var(--text-muted)]">
              Date: <strong className="text-[var(--text-primary)]">{date ? format(date, 'yyyy-MM-dd') : 'None'}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              Language: <strong className="text-[var(--text-primary)] capitalize">{language || 'None'}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              Newspaper: <strong className="text-[var(--text-primary)]">{newspaperName || newspaper || 'None'}</strong>
            </span>
            <span className="text-[var(--text-muted)]">
              Edition: <strong className="text-[var(--text-primary)]">{collectAllEditions ? 'All Available Editions' : editionName || edition || 'None'}</strong>
            </span>
          </div>
        </div>

        {/* Action Button */}
        <NeumorphicButton
          variant="primary"
          size="lg"
          onClick={handleStartCollection}
          disabled={!date || !language || isCollecting}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold"
        >
          {isCollecting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Dataset Collection In Progress...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>Collect OCR Dataset (300 DPI Images + PDF + Manifest)</span>
            </>
          )}
        </NeumorphicButton>

        {/* Live Progress Card */}
        <AnimatePresence>
          {activeJob && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-5 border-t border-[var(--shadow-dark)]/10"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    activeJob.status === 'running' && 'bg-[var(--accent-primary)] animate-pulse',
                    activeJob.status === 'complete' && 'bg-emerald-500',
                    activeJob.status === 'error' && 'bg-red-500'
                  )} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                    Stage: {activeJob.stage}
                  </span>
                </div>

                <div className="text-xs font-mono text-[var(--accent-primary)] font-bold">
                  {progressPercent}%
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full bg-[var(--bg-inset)] overflow-hidden shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)] mb-3">
                <motion.div
                  className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-3">
                <span className="truncate max-w-[80%]">{activeJob.message}</span>
                {activeJob.total > 0 && (
                  <span>
                    {activeJob.current} / {activeJob.total} pages
                  </span>
                )}
              </div>

              {/* Live Terminal Log Box */}
              <div className="rounded-xl bg-[#111827] text-gray-200 p-3 shadow-inner font-mono text-[11px] overflow-hidden">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 text-gray-400 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Python Engine Stdout</span>
                  </div>
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="hover:text-white transition-colors"
                  >
                    {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {showLogs && (
                  <div className="max-h-44 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
                    {activeJob.logs.map((log, i) => (
                      <div key={i} className="leading-relaxed text-gray-300">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </NeumorphicCard>

      {/* Dataset Explorer: Recent Pages Gallery */}
      <NeumorphicCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Dataset Gallery & Inspector
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Showing recent 300 DPI rendered pages from <code className="text-[var(--accent-primary)]">dataset/manifest.csv</code>
            </p>
          </div>

          <span className="text-xs text-[var(--text-muted)] font-mono">
            {recentPages.length} recent item{recentPages.length === 1 ? '' : 's'}
          </span>
        </div>

        {recentPages.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-[var(--bg-inset)] shadow-[inset_2px_2px_4px_var(--shadow-inset-dark),inset_-2px_-2px_4px_var(--shadow-inset-light)]">
            <Database className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-[var(--text-primary)]">No OCR dataset pages yet</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Select a date, language, and newspaper above, then click &ldquo;Collect OCR Dataset&rdquo; to start.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {recentPages.slice(0, 15).map((page) => {
              const previewUrl = `/api/dataset/preview?path=${encodeURIComponent(page.image_path)}`;
              return (
                <div
                  key={page.id}
                  onClick={() => setSelectedPreview(page)}
                  className="group relative cursor-pointer rounded-xl overflow-hidden bg-[var(--bg-inset)] border border-[var(--shadow-dark)]/10 shadow-[3px_3px_6px_var(--shadow-dark),-3px_-3px_6px_var(--shadow-light)] hover:shadow-[5px_5px_10px_var(--shadow-dark),-5px_-5px_10px_var(--shadow-light)] hover:-translate-y-0.5 transition-all"
                >
                  <div className="aspect-[3/4] w-full bg-[#1e232a] relative overflow-hidden flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt={`${page.newspaper} Page ${page.page_number}`}
                      className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="p-2 rounded-full bg-[var(--bg-elevated)]/90 text-[var(--accent-primary)] shadow-md">
                        <Eye className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 text-[11px]">
                    <div className="font-semibold text-[var(--text-primary)] truncate">
                      {page.newspaper}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                      <span>Pg {page.page_number}</span>
                      <span className="capitalize">{page.language}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </NeumorphicCard>

      {/* Lightbox Modal for 300 DPI Inspection */}
      <AnimatePresence>
        {selectedPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl w-full max-h-[90vh] bg-[var(--bg-elevated)] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-[var(--shadow-dark)]/20"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--shadow-dark)]/15">
                <div>
                  <h4 className="text-base font-bold text-[var(--text-primary)]">
                    {selectedPreview.newspaper} ({selectedPreview.edition}) - Page {selectedPreview.page_number}
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    {selectedPreview.date} • {selectedPreview.language.toUpperCase()} • 300 DPI OCR Target
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/dataset/preview?path=${encodeURIComponent(selectedPreview.image_path)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-[var(--bg-inset)] text-[var(--text-primary)] hover:text-[var(--accent-primary)] transition-colors"
                    title="Open Full Resolution in New Tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <button
                    onClick={() => setSelectedPreview(null)}
                    className="p-2 rounded-lg bg-[var(--bg-inset)] text-[var(--text-primary)] hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Image Container */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0d1117]">
                <img
                  src={`/api/dataset/preview?path=${encodeURIComponent(selectedPreview.image_path)}`}
                  alt={`Page ${selectedPreview.page_number}`}
                  className="max-h-[72vh] object-contain rounded-lg shadow-lg border border-gray-800"
                />
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--shadow-dark)]/10 text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono truncate max-w-md">
                  File: {selectedPreview.image_path}
                </span>
                <span className="font-mono">
                  ID: #{selectedPreview.id}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
