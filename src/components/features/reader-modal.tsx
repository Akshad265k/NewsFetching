'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Download, 
  BookOpen, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { NeumorphicButton } from '@/components/ui/neumorphic-button';
import { cn } from '@/lib/utils/cn';

interface ReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  newspaperName: string;
  editionName: string;
  dateStr: string;
  onDownload?: () => void;
  readerData: {
    type: string;
    totalPages: number;
    pages: string[];
  } | null;
  isLoading?: boolean;
  error?: string | null;
}

export function ReaderModal({
  isOpen,
  onClose,
  newspaperName,
  editionName,
  dateStr,
  onDownload,
  readerData,
  isLoading = false,
  error = null,
}: ReaderModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalPages = readerData?.totalPages || readerData?.pages?.length || 0;
  const currentUrl = readerData?.pages?.[currentPage - 1] || '';

  // Reset state when opened or edition changes
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setZoomLevel(1);
      setImageError(false);
      setImageLoading(true);
    }
  }, [isOpen, newspaperName, editionName]);

  // Handle page navigation
  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
      setImageError(false);
      setImageLoading(true);
    }
  }, [currentPage]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(p => p + 1);
      setImageError(false);
      setImageLoading(true);
    }
  }, [currentPage, totalPages]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        prevPage();
      } else if (e.key === 'ArrowRight') {
        nextPage();
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel(z => Math.min(z + 0.25, 2.5));
      } else if (e.key === '-') {
        setZoomLevel(z => Math.max(z - 0.25, 0.75));
      } else if (e.key === '0') {
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose, prevPage, nextPage]);

  // Fullscreen handler
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  if (!isOpen) return null;

  // Build image display URL (direct or proxy fallback)
  const displaySrc = imageError
    ? `/api/reader/proxy?url=${encodeURIComponent(currentUrl)}`
    : currentUrl;

  const isPdf = readerData?.type === 'pdfc' || (currentUrl && currentUrl.toLowerCase().endsWith('.pdf'));

  return (
    <AnimatePresence>
      <div 
        ref={containerRef}
        className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg-base)]/95 backdrop-blur-md overflow-hidden select-none"
      >
        {/* Top Header Bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-[var(--shadow-dark)]/15 glass-effect flex items-center justify-between z-10 shrink-0">
          {/* Title & Metadata */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              'bg-[var(--bg-elevated)]',
              'shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]'
            )}>
              <BookOpen className="w-5 h-5 text-[var(--accent-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate font-[var(--font-heading)]">
                {newspaperName}
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {editionName} • {dateStr}
              </p>
            </div>
          </div>

          {/* Center: Page Controls */}
          {totalPages > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <NeumorphicButton
                variant="ghost"
                size="sm"
                onClick={prevPage}
                disabled={currentPage <= 1}
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </NeumorphicButton>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--bg-inset)] text-xs font-semibold text-[var(--text-primary)]">
                <span>Page</span>
                <select
                  value={currentPage}
                  onChange={(e) => {
                    setCurrentPage(Number(e.target.value));
                    setImageError(false);
                    setImageLoading(true);
                  }}
                  className="bg-transparent font-bold text-[var(--accent-primary)] cursor-pointer outline-none"
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num} className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                      {num}
                    </option>
                  ))}
                </select>
                <span className="text-[var(--text-muted)]">/ {totalPages}</span>
              </div>

              <NeumorphicButton
                variant="ghost"
                size="sm"
                onClick={nextPage}
                disabled={currentPage >= totalPages}
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </NeumorphicButton>
            </div>
          )}

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Zoom Controls (Images only) */}
            {!isPdf && totalPages > 0 && (
              <div className="hidden sm:flex items-center gap-1 border-r border-[var(--shadow-dark)]/15 pr-2 mr-1">
                <NeumorphicButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoomLevel(z => Math.max(z - 0.25, 0.75))}
                  disabled={zoomLevel <= 0.75}
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </NeumorphicButton>
                
                <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>

                <NeumorphicButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoomLevel(z => Math.min(z + 0.25, 2.5))}
                  disabled={zoomLevel >= 2.5}
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </NeumorphicButton>

                {zoomLevel !== 1 && (
                  <NeumorphicButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setZoomLevel(1)}
                    aria-label="Reset Zoom"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </NeumorphicButton>
                )}
              </div>
            )}

            {/* Fullscreen Toggle */}
            <NeumorphicButton
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </NeumorphicButton>

            {/* Download Button */}
            {onDownload && (
              <NeumorphicButton
                variant="primary"
                size="sm"
                onClick={onDownload}
                className="hidden sm:flex"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </NeumorphicButton>
            )}

            {/* Close Button */}
            <NeumorphicButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close Reader"
            >
              <X className="w-5 h-5 text-[var(--text-primary)]" />
            </NeumorphicButton>
          </div>
        </header>

        {/* Viewport Area */}
        <div className="relative flex-1 overflow-auto flex items-center justify-center p-2 sm:p-6">
          {/* Loading State */}
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex flex-col items-center gap-3 text-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Resolving newspaper pages dynamically...
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Fetching edition manifest from TradingRef archive
              </p>
            </motion.div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="flex flex-col items-center gap-3 text-center max-w-md p-6 rounded-2xl bg-[var(--bg-elevated)] shadow-[4px_4px_12px_var(--shadow-dark)]"
            >
              <AlertCircle className="w-10 h-10 text-red-500" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">Unable to open reader</h3>
              <p className="text-xs text-[var(--text-secondary)]">{error}</p>
              {onDownload && (
                <NeumorphicButton variant="primary" size="sm" onClick={onDownload} className="mt-2">
                  <Download className="w-4 h-4" />
                  Try Downloading PDF Instead
                </NeumorphicButton>
              )}
            </motion.div>
          )}

          {/* Content Display: PDF or Image */}
          {!isLoading && !error && totalPages > 0 && (
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              {isPdf ? (
                <iframe
                  src={currentUrl}
                  title={`${newspaperName} - Page ${currentPage}`}
                  className="w-[90vw] h-[82vh] rounded-xl border border-[var(--shadow-dark)]/15 shadow-2xl bg-white"
                />
              ) : (
                <div className="relative flex items-center justify-center">
                  {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-inset)]/50 rounded-xl">
                      <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
                    </div>
                  )}

                  <motion.img
                    key={`${currentPage}-${displaySrc}`}
                    src={displaySrc}
                    alt={`${newspaperName} - Page ${currentPage}`}
                    style={{
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.15s ease-out',
                    }}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      if (!imageError) {
                        setImageError(true);
                      } else {
                        setImageLoading(false);
                      }
                    }}
                    className={cn(
                      'max-h-[82vh] w-auto max-w-full rounded-lg object-contain',
                      'shadow-[0_10px_30px_rgba(0,0,0,0.35)]',
                      imageLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'
                    )}
                  />
                </div>
              )}
            </div>
          )}

          {/* Floating Left/Right Arrows on Desktop */}
          {!isLoading && !error && totalPages > 1 && (
            <>
              <button
                type="button"
                onClick={prevPage}
                disabled={currentPage <= 1}
                aria-label="Previous Page"
                className={cn(
                  'fixed left-4 top-1/2 -translate-y-1/2 z-20',
                  'w-12 h-12 rounded-full hidden lg:flex items-center justify-center',
                  'bg-[var(--bg-elevated)]/90 backdrop-blur border border-white/10 text-[var(--text-primary)]',
                  'shadow-[4px_4px_10px_var(--shadow-dark),-4px_-4px_10px_var(--shadow-light)]',
                  'transition-all hover:scale-105 active:scale-95',
                  currentPage <= 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-80 hover:opacity-100 cursor-pointer'
                )}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={nextPage}
                disabled={currentPage >= totalPages}
                aria-label="Next Page"
                className={cn(
                  'fixed right-4 top-1/2 -translate-y-1/2 z-20',
                  'w-12 h-12 rounded-full hidden lg:flex items-center justify-center',
                  'bg-[var(--bg-elevated)]/90 backdrop-blur border border-white/10 text-[var(--text-primary)]',
                  'shadow-[4px_4px_10px_var(--shadow-dark),-4px_-4px_10px_var(--shadow-light)]',
                  'transition-all hover:scale-105 active:scale-95',
                  currentPage >= totalPages ? 'opacity-30 cursor-not-allowed' : 'opacity-80 hover:opacity-100 cursor-pointer'
                )}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Bottom Thumbnail Strip / Mobile Pagination */}
        {!isLoading && !error && totalPages > 1 && (
          <footer className="h-14 px-4 border-t border-[var(--shadow-dark)]/15 glass-effect flex items-center justify-between shrink-0 z-10">
            {/* Mobile Prev / Next */}
            <div className="flex md:hidden items-center justify-between w-full">
              <NeumorphicButton
                variant="ghost"
                size="sm"
                onClick={prevPage}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span>Prev</span>
              </NeumorphicButton>

              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Page {currentPage} of {totalPages}
              </span>

              <NeumorphicButton
                variant="ghost"
                size="sm"
                onClick={nextPage}
                disabled={currentPage >= totalPages}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </NeumorphicButton>
            </div>

            {/* Desktop Quick Page Jump Buttons */}
            <div className="hidden md:flex items-center gap-1.5 overflow-x-auto py-1 max-w-3xl mx-auto scrollbar-none">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => {
                    setCurrentPage(pageNum);
                    setImageError(false);
                    setImageLoading(true);
                  }}
                  className={cn(
                    'w-7 h-7 rounded-md text-xs font-semibold shrink-0 transition-all cursor-pointer',
                    currentPage === pageNum
                      ? 'bg-[var(--accent-primary)] text-white shadow-md scale-105'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/80'
                  )}
                >
                  {pageNum}
                </button>
              ))}
            </div>
          </footer>
        )}
      </div>
    </AnimatePresence>
  );
}
