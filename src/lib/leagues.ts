export interface SupportedLeague {
  id: number;
  name: string;
  country: string;
}

/**
 * The 15 official football competitions tracked by MatchDay.
 */
export const SUPPORTED_LEAGUES_LIST: readonly SupportedLeague[] = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 40, name: 'Championship', country: 'England' },
  { id: 45, name: 'FA Cup', country: 'England' },
  { id: 48, name: 'League Cup', country: 'England' },
  { id: 2, name: 'UEFA Champions League', country: 'Europe' },
  { id: 3, name: 'UEFA Europa League', country: 'Europe' },
  { id: 848, name: 'UEFA Conference League', country: 'Europe' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 143, name: 'Copa del Rey', country: 'Spain' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 81, name: 'DFB-Pokal', country: 'Germany' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 137, name: 'Coppa Italia', country: 'Italy' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 253, name: 'Major League Soccer', country: 'USA' },
] as const;

export const SUPPORTED_LEAGUE_NAMES: readonly string[] =
  SUPPORTED_LEAGUES_LIST.map((l) => l.name);

/**
 * Checks if a competition name is one of our officially supported competitions.
 */
export function isSupportedLeague(
  name: string | null | undefined,
): name is string {
  if (!name) return false;
  return (
    SUPPORTED_LEAGUE_NAMES.includes(name) ||
    name === 'EFL Championship' ||
    name === 'Championship' ||
    name === 'EFL Cup' ||
    name === 'League Cup'
  );
}
