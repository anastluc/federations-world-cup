export type FederationAcronym = 'UEFA' | 'CONCACAF' | 'CONMEBOL' | 'CAF' | 'AFC' | 'OFC';

export interface FederationDetails {
  name: string;
  acronym: FederationAcronym;
  color: string; // Hex or CSS variable name
  secondaryColor: string;
  region: string;
}

export const FEDERATION_DETAILS: Record<FederationAcronym, FederationDetails> = {
  UEFA: {
    name: 'Union of European Football Associations',
    acronym: 'UEFA',
    color: '#3b82f6', // bright blue
    secondaryColor: '#1d4ed8',
    region: 'Europe'
  },
  CONCACAF: {
    name: 'Confederation of North, Central America and Caribbean Association Football',
    acronym: 'CONCACAF',
    color: '#a855f7', // purple
    secondaryColor: '#7e22ce',
    region: 'North, Central America & Caribbean'
  },
  CONMEBOL: {
    name: 'Confederación Sudamericana de Fútbol',
    acronym: 'CONMEBOL',
    color: '#10b981', // emerald green
    secondaryColor: '#047857',
    region: 'South America'
  },
  CAF: {
    name: 'Confédération Africaine de Football',
    acronym: 'CAF',
    color: '#f59e0b', // amber/orange
    secondaryColor: '#b45309',
    region: 'Africa'
  },
  AFC: {
    name: 'Asian Football Confederation',
    acronym: 'AFC',
    color: '#ef4444', // red
    secondaryColor: '#b91c1c',
    region: 'Asia & Australia'
  },
  OFC: {
    name: 'Oceania Football Confederation',
    acronym: 'OFC',
    color: '#06b6d4', // cyan
    secondaryColor: '#0e7490',
    region: 'Oceania'
  }
};

export const COUNTRY_TO_FEDERATION: Record<string, FederationAcronym> = {
  // UEFA (16 teams)
  'Austria': 'UEFA',
  'Belgium': 'UEFA',
  'Bosnia and Herzegovina': 'UEFA',
  'Croatia': 'UEFA',
  'Czech Republic': 'UEFA',
  'England': 'UEFA',
  'France': 'UEFA',
  'Germany': 'UEFA',
  'Netherlands': 'UEFA',
  'Norway': 'UEFA',
  'Portugal': 'UEFA',
  'Scotland': 'UEFA',
  'Spain': 'UEFA',
  'Sweden': 'UEFA',
  'Switzerland': 'UEFA',
  'Turkey': 'UEFA',

  // CONMEBOL (6 teams)
  'Argentina': 'CONMEBOL',
  'Brazil': 'CONMEBOL',
  'Colombia': 'CONMEBOL',
  'Ecuador': 'CONMEBOL',
  'Paraguay': 'CONMEBOL',
  'Uruguay': 'CONMEBOL',

  // CONCACAF (6 teams)
  'Canada': 'CONCACAF',
  'Curaçao': 'CONCACAF',
  'Haiti': 'CONCACAF',
  'Mexico': 'CONCACAF',
  'Panama': 'CONCACAF',
  'United States': 'CONCACAF',

  // CAF (10 teams)
  'Algeria': 'CAF',
  'Cape Verde': 'CAF',
  'Democratic Republic of the Congo': 'CAF',
  'Egypt': 'CAF',
  'Ghana': 'CAF',
  'Ivory Coast': 'CAF',
  'Morocco': 'CAF',
  'Senegal': 'CAF',
  'South Africa': 'CAF',
  'Tunisia': 'CAF',

  // AFC (9 teams)
  'Australia': 'AFC',
  'Iran': 'AFC',
  'Iraq': 'AFC',
  'Japan': 'AFC',
  'Jordan': 'AFC',
  'Qatar': 'AFC',
  'Saudi Arabia': 'AFC',
  'South Korea': 'AFC',
  'Uzbekistan': 'AFC',

  // OFC (1 team)
  'New Zealand': 'OFC'
};

export function getFederationForCountry(countryName: string): FederationAcronym {
  if (!countryName || typeof countryName !== 'string') return 'UEFA';
  // Handle edge cases if team names differ slightly
  const cleanName = countryName.trim();
  if (cleanName === 'DR Congo') return 'CAF';
  if (cleanName === 'Czechia') return 'UEFA';
  if (cleanName === 'USA') return 'CONCACAF';
  if (cleanName === 'South Korea' || cleanName === 'Korea Republic' || cleanName === 'Republic of Korea') return 'AFC';
  if (cleanName === 'Türkiye') return 'UEFA';
  
  return COUNTRY_TO_FEDERATION[cleanName] || 'UEFA'; // Fallback to UEFA if unknown
}
