/**
 * Feature flags for the Estate Operations Grid UI.
 *
 * All flags default to false to preserve existing behavior.
 * Enable flags individually per phase during development.
 *
 * @see PRD Section 26.2: Feature flag strategy
 */

/** Master flag — enables all estate UI routes */
export const UI_ESTATE_GRID =
  import.meta.env.VITE_UI_ESTATE_GRID === 'true';

/** Attendance Matrix route (/attendance) */
export const UI_ESTATE_GRID_MATRIX =
  import.meta.env.VITE_UI_ESTATE_GRID_MATRIX === 'true';

/** Machine Data Explorer route (/machines) */
export const UI_ESTATE_GRID_MACHINES =
  import.meta.env.VITE_UI_ESTATE_GRID_MACHINES === 'true';

/** Parsed Data & Employee Search routes (/parsed, /employees) */
export const UI_ESTATE_GRID_SEARCH =
  import.meta.env.VITE_UI_ESTATE_GRID_SEARCH === 'true';

/** Mapping Review route (/mapping) */
export const UI_ESTATE_GRID_MAPPING =
  import.meta.env.VITE_UI_ESTATE_GRID_MAPPING === 'true';
