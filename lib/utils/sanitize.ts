/**
 * Sanitization utilities for PostgREST queries.
 * Prevents injection via special characters in .or(), .ilike(), etc.
 */

/**
 * Escapes special characters for PostgREST ILIKE patterns.
 * PostgREST treats % _ \ as wildcards/escape in ILIKE.
 * 
 * @param input - User input to sanitize
 * @returns Escaped string safe for use in .ilike() patterns
 * 
 * @example
 * sanitizePostgrestILike("test%_\\") // "test\\%\\_\\\\"
 */
export function sanitizePostgrestILike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Builds a safe .or() filter for nombre.ilike searches.
 * Each word generates one condition: prefix match (word%).
 * All user input is sanitized before inclusion.
 * 
 * @param words - Array of search words (already split and filtered)
 * @returns Comma-separated string safe for PostgREST .or()
 * 
 * @example
 * sanitizeOrFilter(["juan", "perez"]) 
 * // "nombre.ilike.juan%,nombre.ilike.perez%"
 */
export function sanitizeOrFilter(words: string[]): string {
  const conditions: string[] = [];
  
  for (const w of words) {
    if (w.length < 2) continue;
    
    const safe = sanitizePostgrestILike(w);
    conditions.push(`nombre.ilike.${safe}%`);
  }
  
  return conditions.join(",");
}

/**
 * Sanitizes a single value for use in PostgREST equality filters (.eq(), .neq()).
 * Prevents injection of PostgREST operators like .in, .or, .not, etc.
 * 
 * @param input - User input
 * @returns Sanitized string
 */
export function sanitizePostgrestValue(input: string): string {
  // Remove any PostgREST operator prefixes
  return input.replace(/^(\.|,|;|\(|\))/, '');
}