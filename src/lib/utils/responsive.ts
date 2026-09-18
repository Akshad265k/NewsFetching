/**
 * Responsive Design Utilities
 * Mobile-first approach with fluid typography and spacing
 */

/**
 * Fluid font size utility
 * Scales smoothly between min and max sizes based on viewport
 * 
 * @example
 * const fontSize = fluidSize(14, 18, 320, 1200);
 * // Returns: clamp(0.875rem, 0.8rem + 0.33vw, 1.125rem)
 */
export function fluidSize(
  minSize: number,
  maxSize: number,
  minVw = 320,
  maxVw = 1200
): string {
  const minSizeRem = minSize / 16;
  const maxSizeRem = maxSize / 16;
  const slope = (maxSize - minSize) / (maxVw - minVw);
  const yAxisIntersection = -minVw * slope + minSize;
  
  return `clamp(${minSizeRem}rem, ${yAxisIntersection / 16}rem + ${slope * 100}vw, ${maxSizeRem}rem)`;
}

/**
 * Responsive breakpoint values matching Tailwind config
 */
export const breakpoints = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Check if viewport matches a breakpoint (client-side only)
 * 
 * @example
 * const isMobile = useMediaQuery('(max-width: 640px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);
  
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Set initial value
    setMatches(window.matchMedia(query).matches);
    
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    
    // Modern browsers
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    // Legacy browsers
    else {
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [query]);
  
  return matches;
}

/**
 * Get responsive container padding
 * Scales from 16px on mobile to 24px on desktop
 */
export function getContainerPadding(): string {
  return 'clamp(1rem, 4vw, 1.5rem)';
}

/**
 * Get responsive grid gap
 * Scales from 12px on mobile to 24px on desktop
 */
export function getGridGap(): string {
  return 'clamp(0.75rem, 2vw, 1.5rem)';
}

/**
 * Responsive class name helpers
 */
export const responsive = {
  // Container widths
  container: 'w-full max-w-[100%] px-4 md:px-6 lg:max-w-[960px] xl:max-w-[1200px] mx-auto',
  
  // Grid layouts
  gridAuto: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6',
  grid2Col: 'grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6',
  grid3Col: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6',
  grid4Col: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4',
  
  // Flexbox layouts
  flexRow: 'flex flex-col sm:flex-row gap-4',
  flexRowReverse: 'flex flex-col-reverse sm:flex-row gap-4',
  flexCenter: 'flex flex-col sm:flex-row items-center justify-center gap-4',
  flexBetween: 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
  
  // Typography
  headingXl: 'text-3xl sm:text-4xl lg:text-5xl font-bold',
  headingLg: 'text-2xl sm:text-3xl lg:text-4xl font-bold',
  headingMd: 'text-xl sm:text-2xl lg:text-3xl font-semibold',
  headingSm: 'text-lg sm:text-xl lg:text-2xl font-semibold',
  body: 'text-sm sm:text-base',
  bodyLg: 'text-base sm:text-lg',
  
  // Spacing
  sectionPadding: 'py-12 md:py-16 lg:py-24',
  cardPadding: 'p-4 md:p-6 lg:p-8',
  
  // Images
  responsiveImg: 'w-full h-auto object-cover',
  avatarSm: 'w-8 h-8 sm:w-10 sm:h-10',
  avatarMd: 'w-10 h-10 sm:w-12 sm:h-12',
  avatarLg: 'w-12 h-12 sm:w-16 sm:h-16',
  
  // Buttons
  buttonBase: 'px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base min-h-[44px]',
  buttonSm: 'px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm min-h-[40px]',
  buttonLg: 'px-6 py-3 sm:px-8 sm:py-4 text-base sm:text-lg min-h-[48px]',
  
  // Modals/Dialogs
  modal: 'w-[95vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl',
  modalPadding: 'p-4 sm:p-6 md:p-8',
  
  // Navigation
  navHeight: 'h-14 sm:h-16',
  navPadding: 'px-4 sm:px-6 lg:px-8',
} as const;

/**
 * Touch-friendly sizing utilities
 * Ensures interactive elements meet WCAG 2.1 Level AAA (44x44px)
 */
export const touch = {
  minTarget: 'min-w-[44px] min-h-[44px]',
  targetSm: 'w-10 h-10 sm:w-12 sm:h-12',
  targetMd: 'w-12 h-12 sm:w-14 sm:h-14',
  targetLg: 'w-14 h-14 sm:w-16 sm:h-16',
} as const;

/**
 * Prevent layout shift with aspect ratio boxes
 * 
 * @example
 * <div className={aspectRatio('16/9')}>
 *   <img src="..." className="absolute inset-0 w-full h-full object-cover" />
 * </div>
 */
export function aspectRatio(ratio: string): string {
  return `relative before:block before:pt-[${ratio}]`;
}

/**
 * Safe area insets for iOS devices (notch/island)
 */
export const safeArea = {
  top: 'pt-[env(safe-area-inset-top)]',
  bottom: 'pb-[env(safe-area-inset-bottom)]',
  left: 'pl-[env(safe-area-inset-left)]',
  right: 'pr-[env(safe-area-inset-right)]',
  x: 'px-[env(safe-area-inset-left)] px-[env(safe-area-inset-right)]',
  y: 'py-[env(safe-area-inset-top)] py-[env(safe-area-inset-bottom)]',
  all: 'p-[env(safe-area-inset-top)] p-[env(safe-area-inset-right)] p-[env(safe-area-inset-bottom)] p-[env(safe-area-inset-left)]',
} as const;

// Need to import React for the hook
import React from 'react';
