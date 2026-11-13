/**
 * Formats a byte count for UI display (Б/КБ/МБ).
 * One definition for update download progress and storage stats.
 */
export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / 1_048_576).toFixed(1)} МБ`;
};
