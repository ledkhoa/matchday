export const TEAM_ALIASES = {
  // Premier League
  spurs: 'tottenham',
  'tottenham hotspur': 'tottenham',
  wolves: 'wolverhampton',
  'wolverhampton wanderers': 'wolverhampton',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  mufc: 'manchester united',
  'manchester united': 'manchester united',
  'man city': 'manchester city',
  mcfc: 'manchester city',
  'manchester city': 'manchester city',
  newcastle: 'newcastle united',
  'west ham': 'west ham united',
  brighton: 'brighton hove albion',
  forest: 'nottingham forest',
  villa: 'aston villa',
  palace: 'crystal palace',
  leicester: 'leicester city',
  ipswich: 'ipswich town',
  southampton: 'southampton',
  bournemouth: 'afc bournemouth',

  // La Liga & Copa del Rey
  atleti: 'atletico madrid',
  'atletico madrid': 'atletico madrid',
  'atletico de madrid': 'atletico madrid',
  barca: 'barcelona',
  barça: 'barcelona',
  real: 'real madrid',
  'real madrid': 'real madrid',
  'la real': 'real sociedad',
  'real sociedad': 'real sociedad',
  'real betis': 'real betis',
  'real valladolid': 'real valladolid',
  athletic: 'athletic club',
  'athletic bilbao': 'athletic club',
  betis: 'real betis',
  celta: 'celta vigo',
  rayo: 'rayo vallecano',
  alaves: 'deportivo alaves',

  // Bundesliga & DFB-Pokal
  bayern: 'bayern munich',
  'fc bayern': 'bayern munich',
  'bayern munich': 'bayern munich',
  'bayern munchen': 'bayern munich',
  bvb: 'borussia dortmund',
  dortmund: 'borussia dortmund',
  'borussia dortmund': 'borussia dortmund',
  leverkusen: 'bayer leverkusen',
  'bayer leverkusen': 'bayer leverkusen',
  gladbach: 'borussia monchengladbach',
  mgladbach: 'borussia monchengladbach',
  'borussia monchengladbach': 'borussia monchengladbach',
  frankfurt: 'eintracht frankfurt',
  leipzig: 'rb leipzig',
  'rasenballsport leipzig': 'rb leipzig',
  stuttgart: 'vfb stuttgart',
  'vfb stuttgart': 'vfb stuttgart',
  wolfsburg: 'vfl wolfsburg',
  'vfl wolfsburg': 'vfl wolfsburg',
  mainz: 'mainz 05',
  bremen: 'werder bremen',
  'st pauli': 'st pauli',

  // Serie A & Coppa Italia
  inter: 'inter milan',
  internazionale: 'inter milan',
  'inter milan': 'inter milan',
  milan: 'ac milan',
  'ac milan': 'ac milan',
  juve: 'juventus',
  roma: 'as roma',
  lazio: 'lazio',
  verona: 'hellas verona',

  // Ligue 1
  psg: 'paris saint germain',
  'paris sg': 'paris saint germain',
  'paris saint germain': 'paris saint germain',
  om: 'marseille',
  ol: 'lyon',
  asse: 'saint etienne',
  'saint etienne': 'saint etienne',

  // MLS
  lafc: 'los angeles fc',
  'los angeles fc': 'los angeles fc',
  'la galaxy': 'los angeles galaxy',
  galaxy: 'los angeles galaxy',
  'los angeles galaxy': 'los angeles galaxy',
  nycfc: 'new york city fc',
  rbny: 'new york red bulls',
  'ny red bulls': 'new york red bulls',
  'new york red bulls': 'new york red bulls',
  'new york city fc': 'new york city fc',
  sounders: 'seattle sounders',
  timbers: 'portland timbers',
  crew: 'columbus crew',
  dynamo: 'houston dynamo',
  skc: 'sporting kansas city',
  'inter miami': 'inter miami',
  revs: 'new england revolution',
  quakes: 'san jose earthquakes',
} as const satisfies Record<string, string>;

const ALIASES: ReadonlyMap<string, string> = new Map(
  Object.entries(TEAM_ALIASES),
);

export const COLLISION_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['manchester united', 'manchester city']),
  new Set(['ac milan', 'inter milan']),
  new Set([
    'real madrid',
    'atletico madrid',
    'real sociedad',
    'real betis',
    'real valladolid',
  ]),
  new Set(['los angeles fc', 'los angeles galaxy']),
  new Set(['new york city fc', 'new york red bulls']),
  new Set(['bayern munich', 'bayer leverkusen']),
  new Set(['borussia dortmund', 'borussia monchengladbach']),
  new Set(['sheffield united', 'sheffield wednesday']),
  new Set(['nottingham forest', 'forest green rovers']),
];

const SAFE_AFFIXES = new Set([
  'fc',
  'cf',
  'afc',
  'sc',
  'cd',
  'ca',
  'rc',
  'rcd',
  'ud',
  'us',
  'ssc',
  'as',
  'ac',
  'vfb',
  'vfl',
  'sv',
]);

/**
 * Normalizes colloquial abbreviations, accents, casing, and common club prefixes/suffixes.
 */
export function normalizeTeamName(name: string): string {
  if (!name) return '';

  // 1. Diacritics stripping
  let clean = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Lowercase, remove periods and apostrophes, replace remaining punctuation with space
  clean = clean
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check alias dictionary before prefix/suffix stripping
  const alias = ALIASES.get(clean);
  if (alias) {
    return alias;
  }

  // 3. Strip safe club prefix/suffix words if string contains multiple words
  let words = clean.split(' ');
  if (words.length > 1) {
    if (SAFE_AFFIXES.has(words[0])) {
      words = words.slice(1);
    }
    if (words.length > 1 && SAFE_AFFIXES.has(words[words.length - 1])) {
      words = words.slice(0, -1);
    }
    const stripped = words.join(' ');
    const strippedAlias = ALIASES.get(stripped);
    if (strippedAlias) {
      return strippedAlias;
    }
    clean = stripped;
  }

  return clean;
}

/**
 * Checks whether two normalized team stems belong to the same collision group.
 */
export function isCollision(stemA: string, stemB: string): boolean {
  if (stemA === stemB) return false;
  for (const group of COLLISION_GROUPS) {
    if (group.has(stemA) && group.has(stemB)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates standard Jaro string similarity between two strings.
 */
export function jaroDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = Array.from({ length: s1.length }, () => false);
  const s2Matches = Array.from({ length: s2.length }, () => false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) {
        k++;
      }
      if (s1[i] !== s2[k]) {
        transpositions++;
      }
      k++;
    }
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Computes Jaro-Winkler distance with standard prefix boost.
 */
export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaro = jaroDistance(s1, s2);
  if (jaro < 0.7) return jaro;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaro + prefix * p * (1 - jaro);
}

/**
 * Evaluates similarity between two raw team names using alias mapping,
 * anti-collision rules, token containment, and Jaro-Winkler distance.
 */
export function calculateTeamSimilarity(nameA: string, nameB: string): number {
  const stemA = normalizeTeamName(nameA);
  const stemB = normalizeTeamName(nameB);

  // Anti-collision guard
  if (isCollision(stemA, stemB)) {
    return 0.0;
  }

  // Exact normalized equality
  if (stemA === stemB) {
    return 1.0;
  }

  // Token subset matching (for tokens of length >= 3)
  const tokensA = stemA.split(' ').filter((w) => w.length >= 3);
  const tokensB = stemB.split(' ').filter((w) => w.length >= 3);

  if (tokensA.length > 0 && tokensB.length > 0) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    const isSubsetAInB = tokensA.every((t) => setB.has(t));
    const isSubsetBInA = tokensB.every((t) => setA.has(t));

    if (isSubsetAInB || isSubsetBInA) {
      return 0.9;
    }
  }

  return jaroWinkler(stemA, stemB);
}

export interface MatcherCandidate {
  id: string;
  matchDate: string;
  teamHome: string;
  teamAway: string;
  externalId?: number | null;
  competition?: string | null;
}

export interface MatchResult {
  fixture: MatcherCandidate;
  confidence: number;
  inverted: boolean;
}

/**
 * Matches a parsed Reddit post (home, away) against a candidate list of D1 official fixtures.
 * Supports direct and inverted orientation, enforces confidence thresholds,
 * and breaks ties preferring matching calendar dates.
 */
export function matchPostToFixture(
  postHome: string,
  postAway: string,
  candidates: MatcherCandidate[],
  postDate?: string,
): MatchResult | null {
  let bestResult: MatchResult | null = null;

  for (const candidate of candidates) {
    // 1. Direct orientation
    const directHome = calculateTeamSimilarity(postHome, candidate.teamHome);
    const directAway = calculateTeamSimilarity(postAway, candidate.teamAway);
    const directConfidence = (directHome + directAway) / 2;
    const directValid =
      directHome >= 0.75 && directAway >= 0.75 && directConfidence >= 0.82;

    // 2. Inverted orientation (Reddit title reversed or neutral venue)
    const invHome = calculateTeamSimilarity(postHome, candidate.teamAway);
    const invAway = calculateTeamSimilarity(postAway, candidate.teamHome);
    const invConfidence = (invHome + invAway) / 2;
    const invValid =
      invHome >= 0.75 && invAway >= 0.75 && invConfidence >= 0.82;

    let candidateResult: MatchResult | null = null;
    if (directValid && invValid) {
      if (directConfidence >= invConfidence) {
        candidateResult = {
          fixture: candidate,
          confidence: directConfidence,
          inverted: false,
        };
      } else {
        candidateResult = {
          fixture: candidate,
          confidence: invConfidence,
          inverted: true,
        };
      }
    } else if (directValid) {
      candidateResult = {
        fixture: candidate,
        confidence: directConfidence,
        inverted: false,
      };
    } else if (invValid) {
      candidateResult = {
        fixture: candidate,
        confidence: invConfidence,
        inverted: true,
      };
    }

    if (!candidateResult) {
      continue;
    }

    if (!bestResult) {
      bestResult = candidateResult;
    } else if (candidateResult.confidence > bestResult.confidence + 1e-6) {
      bestResult = candidateResult;
    } else if (
      Math.abs(candidateResult.confidence - bestResult.confidence) <= 1e-6
    ) {
      // Tie-breaker: prefer candidate whose matchDate matches postDate
      if (
        postDate &&
        candidateResult.fixture.matchDate === postDate &&
        bestResult.fixture.matchDate !== postDate
      ) {
        bestResult = candidateResult;
      }
    }
  }

  return bestResult;
}
