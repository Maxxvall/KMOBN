/**
 * Formats a byte count for UI display (Б/КБ/МБ).
 * One definition for update download progress and storage stats.
 */
export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1_048_576).toFixed(1)} МБ`;
};

/**
 * Formats an active-usage duration for UI display (hours/minutes, no declension).
 */
export const formatDuration = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / 60_000);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} ч ${minutes % 60} мин` : `${minutes} мин`;
};

/**
 * Cleans a string for use in a PDF file name: forbidden characters become
 * underscores (runs collapse), whitespace collapses, edges are trimmed.
 * The empty-result fallback stays with the caller («Без_названия», «Раскрой»).
 */
export const sanitizeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
