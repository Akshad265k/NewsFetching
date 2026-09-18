'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import type { 
  Language, 
  Newspaper, 
  Edition, 
  ProgressState 
} from '@/types';

interface UseNewspaperState {
  date: Date | null;
  language: string | null;
  newspaper: string | null;
  edition: string | null;
  languages: Language[];
  newspapers: Newspaper[];
  editions: Edition[];
  downloadUrl: string | null;
  downloadReady: boolean;
  error: string | null;
  progress: ProgressState | null;
  loading: {
    languages: boolean;
    newspapers: boolean;
    editions: boolean;
    download: boolean;
  };
}

const stageOrder: Record<ProgressState['stage'], number> = {
  validating: 0,
  fetching: 1,
  downloading: 2,
  decrypting: 3,
  merging: 4,
  complete: 5,
  error: 6,
};

const PROGRESS_UNAVAILABLE_MESSAGE = 'Progress is unavailable on this server instance. Waiting for final response...';

export function useNewspaper() {
  const [state, setState] = useState<UseNewspaperState>({
    date: null,
    language: null,
    newspaper: null,
    edition: null,
    languages: [],
    newspapers: [],
    editions: [],
    downloadUrl: null,
    downloadReady: false,
    error: null,
    progress: null,
    loading: {
      languages: false,
      newspapers: false,
      editions: false,
      download: false,
    },
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const downloadInFlightRef = useRef(false);
  const downloadUrlRef = useRef<string | null>(null);
  const downloadFileIdRef = useRef<string | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
  }, []);

  const setDate = useCallback(async (date: Date | null) => {
    stopPolling();
    setState(prev => ({
      ...prev,
      date,
      language: null,
      newspaper: null,
      edition: null,
      languages: [],
      newspapers: [],
      editions: [],
      downloadUrl: null,
      downloadReady: false,
      error: null,
      progress: null,
      loading: { ...prev.loading, languages: !!date },
    }));

    if (!date) return;

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      const dateStr = format(date, 'yyyyMMdd');
      const response = await fetch(`/api/data/${dateStr}`, {
        signal: abortControllerRef.current.signal,
      });
      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          languages: data.languages,
          loading: { ...prev.loading, languages: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: data.error || 'Failed to load languages',
          loading: { ...prev.loading, languages: false },
        }));
      }
    } catch (error) {
      // Don't show error if request was aborted (user changed selection)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      setState(prev => ({
        ...prev,
        error: 'Network error. Please try again.',
        loading: { ...prev.loading, languages: false },
      }));
    }
  }, [stopPolling]);

  const setLanguage = useCallback(async (languageId: string | null, currentDate: Date | null) => {
    stopPolling();
    setState(prev => ({
      ...prev,
      language: languageId,
      newspaper: null,
      edition: null,
      newspapers: [],
      editions: [],
      downloadUrl: null,
      downloadReady: false,
      error: null,
      progress: null,
      loading: { ...prev.loading, newspapers: !!languageId },
    }));

    if (!languageId || !currentDate) return;

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      const dateStr = format(currentDate, 'yyyyMMdd');
      const response = await fetch(
        `/api/newspapers?date=${dateStr}&language=${languageId}`,
        { signal: abortControllerRef.current.signal }
      );
      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          newspapers: data.newspapers,
          loading: { ...prev.loading, newspapers: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: data.error || 'Failed to load newspapers',
          loading: { ...prev.loading, newspapers: false },
        }));
      }
    } catch (error) {
      // Don't show error if request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      setState(prev => ({
        ...prev,
        error: 'Network error. Please try again.',
        loading: { ...prev.loading, newspapers: false },
      }));
    }
  }, [stopPolling]);

  const setNewspaper = useCallback(async (
    newspaperId: string | null,
    currentDate: Date | null,
    currentLanguage: string | null
  ) => {
    stopPolling();
    setState(prev => ({
      ...prev,
      newspaper: newspaperId,
      edition: null,
      editions: [],
      downloadUrl: null,
      downloadReady: false,
      error: null,
      progress: null,
      loading: { ...prev.loading, editions: !!newspaperId },
    }));

    if (!newspaperId || !currentDate || !currentLanguage) return;

    try {
      const dateStr = format(currentDate, 'yyyyMMdd');
      const response = await fetch(
        `/api/editions?date=${dateStr}&language=${currentLanguage}&newspaper=${newspaperId}`
      );
      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          editions: data.editions,
          loading: { ...prev.loading, editions: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: data.error || 'Failed to load editions',
          loading: { ...prev.loading, editions: false },
        }));
      }
    } catch {
      setState(prev => ({
        ...prev,
        error: 'Network error. Please try again.',
        loading: { ...prev.loading, editions: false },
      }));
    }
  }, [stopPolling]);

  const setEdition = useCallback((editionId: string | null) => {
    stopPolling();
    setState(prev => ({
      ...prev,
      edition: editionId,
      downloadUrl: null,
      downloadReady: false,
      error: null,
      progress: null,
    }));
  }, [stopPolling]);

  const pollProgress = useCallback(async (requestId: string) => {
    if (currentRequestIdRef.current !== requestId) return;

    try {
      const response = await fetch(`/api/pdf?jobId=${requestId}`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (!data.success || currentRequestIdRef.current !== requestId) {
        return;
      }

      const progress = data.progress as ProgressState;
      
      // Update progress state for real-time feedback
      setState(prev => {
        const previousProgress = prev.progress;

        if (
          progress.message === PROGRESS_UNAVAILABLE_MESSAGE &&
          previousProgress &&
          previousProgress.status === 'running'
        ) {
          return prev;
        }

        let mergedProgress: ProgressState = {
          ...progress,
          logs: progress.logs || previousProgress?.logs || [],
        };

        if (previousProgress && previousProgress.status === 'running' && progress.status === 'running') {
          const previousStageRank = stageOrder[previousProgress.stage];
          const incomingStageRank = stageOrder[progress.stage];

          // Ignore out-of-order snapshots from another server instance.
          if (incomingStageRank < previousStageRank) {
            mergedProgress = {
              ...previousProgress,
              logs: progress.logs?.length ? progress.logs : previousProgress.logs,
              updatedAt: progress.updatedAt ?? previousProgress.updatedAt,
            };
          } else {
            const safeCurrent = Math.max(previousProgress.current ?? 0, progress.current ?? 0);
            const safeTotal = Math.max(previousProgress.total ?? 0, progress.total ?? 0);

            mergedProgress = {
              ...progress,
              current: safeTotal > 0 ? safeCurrent : progress.current,
              total: safeTotal > 0 ? safeTotal : progress.total,
              logs: progress.logs?.length ? progress.logs : previousProgress.logs,
            };
          }
        }

        // Only update if there's actual changes to prevent unnecessary re-renders
        const hasChanges = 
          !previousProgress ||
          previousProgress.status !== mergedProgress.status ||
          previousProgress.stage !== mergedProgress.stage ||
          previousProgress.message !== mergedProgress.message ||
          previousProgress.current !== mergedProgress.current ||
          previousProgress.total !== mergedProgress.total ||
          (mergedProgress.logs && mergedProgress.logs.length !== previousProgress.logs?.length);

        if (!hasChanges) {
          return prev;
        }

        return {
          ...prev,
          progress: mergedProgress,
        };
      });

      // Only stop polling and set error if status is error
      // Don't stop on 'complete' - let the POST response handler do that
      if (progress.status === 'error') {
        stopPolling();
        setState(prev => ({
          ...prev,
          error: progress.message || 'Download failed',
          loading: { ...prev.loading, download: false },
        }));
      }
    } catch {
      // Polling error - continue trying
    }
  }, [stopPolling]);

  const startDownload = useCallback(async () => {
    if (!state.date || !state.language || !state.newspaper || !state.edition) {
      return;
    }

    if (downloadInFlightRef.current) {
      return;
    }

    downloadInFlightRef.current = true;

    stopPolling();
    
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, download: true },
      progress: {
        status: 'running',
        stage: 'validating',
        message: 'Initializing download...',
        logs: ['Starting download request'],
      },
      error: null,
      downloadUrl: null,
      downloadReady: false,
    }));
    downloadUrlRef.current = null;
    downloadFileIdRef.current = null;

    // Start polling immediately with faster interval for real-time updates
    void pollProgress(requestId);
    pollIntervalRef.current = setInterval(() => {
      void pollProgress(requestId);
    }, 1000);

    try {
      const dateStr = format(state.date, 'yyyyMMdd');

      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          language: state.language,
          newspaper: state.newspaper,
          edition: state.edition,
          requestId,
        }),
      });

      const data = await response.json();

      if (currentRequestIdRef.current !== requestId) {
        downloadInFlightRef.current = false;
        return;
      }

      // Stop polling since we have the result
      stopPolling();

      if (response.ok && data.success && (data.fileId || data.pdfUrl)) {
        downloadFileIdRef.current = typeof data.fileId === 'string' ? data.fileId : null;
        downloadUrlRef.current = typeof data.pdfUrl === 'string' ? data.pdfUrl : null;
        setState(prev => ({
          ...prev,
          // Keep large payload out of React state to avoid mobile UI freezes.
          downloadUrl: null,
          downloadReady: true,
          progress: {
            status: 'complete',
            stage: 'complete',
            message: `Download ready (${data.pagesAdded || 0} pages)`,
            logs: prev.progress?.logs || [],
            current: data.pagesAdded || 0,
            total: data.pagesAdded || 0,
          },
          loading: { ...prev.loading, download: false },
        }));
      } else {
        const retryAfter = typeof data.retryAfter === 'number'
          ? ` Please retry in ${data.retryAfter} second${data.retryAfter === 1 ? '' : 's'}.`
          : '';

        setState(prev => ({
          ...prev,
          error: (data.error || data.message || 'Failed to generate PDF') + retryAfter,
          progress: {
            status: 'error',
            stage: 'error',
            message: (data.error || data.message || 'Download failed') + retryAfter,
            logs: prev.progress?.logs || [],
          },
          loading: { ...prev.loading, download: false },
        }));
      }
      downloadInFlightRef.current = false;
    } catch {
      stopPolling();
      setState(prev => ({
        ...prev,
        error: 'Network error. Please try again.',
        progress: {
          status: 'error',
          stage: 'error',
          message: 'Network error. Please try again.',
          logs: prev.progress?.logs || [],
        },
        loading: { ...prev.loading, download: false },
      }));
      downloadInFlightRef.current = false;
    }
  }, [state.date, state.language, state.newspaper, state.edition, stopPolling, pollProgress]);

  const triggerDownload = useCallback(async () => {
    const fileId = downloadFileIdRef.current;
    const activeUrl = downloadUrlRef.current || state.downloadUrl;

    if (!fileId && !activeUrl) {
      return;
    }
    
    // Create filename from selections
    const dateStr = state.date ? format(state.date, 'yyyy-MM-dd') : 'newspaper';
    const filename = `${state.newspaper || 'newspaper'}_${dateStr}.pdf`;

    try {
      if (fileId) {
        const link = document.createElement('a');
        link.href = `/api/pdf?fileId=${encodeURIComponent(fileId)}`;
        link.download = filename;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const link = document.createElement('a');
      link.href = activeUrl as string;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setState(prev => ({
        ...prev,
        error: 'Download link expired. Please generate the PDF again.',
      }));
    }
  }, [state.downloadUrl, state.date, state.newspaper]);

  const cancelDownload = useCallback(() => {
    stopPolling();
    downloadInFlightRef.current = false;
    downloadUrlRef.current = null;
    downloadFileIdRef.current = null;
    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, download: false },
      progress: null,
      error: null,
      downloadUrl: null,
      downloadReady: false,
    }));
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    downloadInFlightRef.current = false;
    downloadUrlRef.current = null;
    downloadFileIdRef.current = null;
    setState({
      date: null,
      language: null,
      newspaper: null,
      edition: null,
      languages: [],
      newspapers: [],
      editions: [],
      downloadUrl: null,
      downloadReady: false,
      error: null,
      progress: null,
      loading: {
        languages: false,
        newspapers: false,
        editions: false,
        download: false,
      },
    });
  }, [stopPolling]);

  // Get selected items for display
  const selectedLanguage = state.languages.find(l => l.id === state.language);
  const selectedNewspaper = state.newspapers.find(n => n.id === state.newspaper);
  const selectedEdition = state.editions.find(e => e.id === state.edition);

  // Create wrapper functions that access current state
  const handleSetLanguage = useCallback((languageId: string | null) => {
    setLanguage(languageId, state.date);
  }, [setLanguage, state.date]);

  const handleSetNewspaper = useCallback((newspaperId: string | null) => {
    setNewspaper(newspaperId, state.date, state.language);
  }, [setNewspaper, state.date, state.language]);

  return {
    ...state,
    setDate,
    setLanguage: handleSetLanguage,
    setNewspaper: handleSetNewspaper,
    setEdition,
    startDownload,
    triggerDownload,
    cancelDownload,
    reset,
    canStartDownload: !!(state.date && state.language && state.newspaper && state.edition && !state.loading.download),
    isAnyLoading: Object.values(state.loading).some(Boolean),
    selectedLanguage,
    selectedNewspaper,
    selectedEdition,
  };
}
