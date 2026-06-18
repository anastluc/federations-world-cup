import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  getFederationForCountry, 
  FEDERATION_DETAILS
} from './data/federations';
import type { 
  FederationAcronym, 
  FederationDetails 
} from './data/federations';

// Interfaces based on API response structure
interface APIMatch {
  id: string;
  home_team_name_en: string;
  away_team_name_en: string;
  home_score: string;
  away_score: string;
  finished: string; // "TRUE" or "FALSE"
  time_elapsed: string; // "finished", "notstarted", or minutes e.g. "45"
  group: string;
  matchday: string;
  type: string; // "group", "r32", etc.
  local_date: string;
  stadium_id: string;
}

interface CountryStanding {
  country: string;
  federation: FederationAcronym;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number; // goals for
  ga: number; // goals against
  gd: number; // goal difference
  pts: number;
}

interface GroupStanding {
  groupName: string;
  teams: CountryStanding[];
}

interface FedStanding {
  acronym: FederationAcronym;
  details: FederationDetails;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  teamCount: number;
  winRate: number;
}

// Helper to parse "MM/DD/YYYY HH:MM" date string into numeric timestamp
const parseMatchDate = (dateStr: string): number => {
  if (!dateStr) return 0;
  const [datePart, timePart] = dateStr.split(' ');
  if (!datePart || !timePart) return 0;
  const [month, day, year] = datePart.split('/').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

// Deterministic mock odds generator based on match ID, score, and finished status
const getMockOdds = (
  matchId: string, 
  homeTeam: string, 
  awayTeam: string, 
  homeScoreStr: string, 
  awayScoreStr: string, 
  finished: string
) => {
  let hash = 0;
  const str = `${matchId}-${homeTeam}-${awayTeam}`;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r1 = Math.abs(Math.sin(hash + 1));
  const r2 = Math.abs(Math.sin(hash + 2));

  const isFinished = finished === 'TRUE';
  const homeScore = parseInt(homeScoreStr, 10);
  const awayScore = parseInt(awayScoreStr, 10);

  let homeOdds = 2.2;
  let drawOdds = 3.2;
  let awayOdds = 2.2;

  if (isFinished && !isNaN(homeScore) && !isNaN(awayScore)) {
    const diff = homeScore - awayScore;
    if (diff > 0) {
      // Home team won (e.g. Germany vs Curacao 7-1)
      if (diff >= 4) {
        homeOdds = 1.01 + r1 * 0.05;
        drawOdds = 8.0 + r2 * 10.0;
        awayOdds = 15.0 + r2 * 45.0;
      } else if (diff >= 2) {
        homeOdds = 1.15 + r1 * 0.2;
        drawOdds = 4.0 + r2 * 3.0;
        awayOdds = 4.5 + r2 * 8.0;
      } else {
        homeOdds = 1.4 + r1 * 0.4;
        drawOdds = 3.2 + r2 * 1.5;
        awayOdds = 2.8 + r2 * 3.0;
      }
    } else if (diff < 0) {
      // Away team won
      const absDiff = Math.abs(diff);
      if (absDiff >= 4) {
        awayOdds = 1.01 + r1 * 0.05;
        drawOdds = 8.0 + r2 * 10.0;
        homeOdds = 15.0 + r2 * 45.0;
      } else if (absDiff >= 2) {
        awayOdds = 1.15 + r1 * 0.2;
        drawOdds = 4.0 + r2 * 3.0;
        homeOdds = 4.5 + r2 * 8.0;
      } else {
        awayOdds = 1.4 + r1 * 0.4;
        drawOdds = 3.2 + r2 * 1.5;
        homeOdds = 2.8 + r2 * 3.0;
      }
    } else {
      // Draw
      drawOdds = 2.5 + r1 * 0.8;
      homeOdds = 2.0 + r2 * 1.0;
      awayOdds = 2.0 + (1 - r2) * 1.0;
    }
  } else {
    // Scheduled or no score
    const favType = Math.floor(r1 * 3); // 0: home, 1: away, 2: balanced
    if (favType === 0) {
      homeOdds = 1.3 + r2 * 0.5;
      drawOdds = 3.4 + r2 * 1.5;
      awayOdds = 3.5 + r2 * 4.0;
    } else if (favType === 1) {
      awayOdds = 1.3 + r2 * 0.5;
      drawOdds = 3.4 + r2 * 1.5;
      homeOdds = 3.5 + r2 * 4.0;
    } else {
      homeOdds = 2.1 + r2 * 1.2;
      drawOdds = 2.8 + r2 * 0.8;
      awayOdds = 2.1 + (1 - r2) * 1.2;
    }
  }

  return {
    home: homeOdds.toFixed(2),
    draw: drawOdds.toFixed(2),
    away: awayOdds.toFixed(2)
  };
};

const API_URL = 'https://worldcup26.ir/get/games';
const CACHE_FALLBACK_URL = '/data/games.json';

export default function App() {
  const [matches, setMatches] = useState<APIMatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Sync Status
  const [dataSource, setDataSource] = useState<'live' | 'cache' | 'none'>('none');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshCountdown, setRefreshCountdown] = useState<number>(300);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Time formatter helper
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Filter States
  const [activeTab, setActiveTab] = useState<'federation' | 'groups'>('federation');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFedFilter, setSelectedFedFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'FINISHED' | 'SCHEDULED'>('ALL');

  // Selected Federation for Detail Matches
  const [selectedFederation, setSelectedFederation] = useState<FederationAcronym | null>(null);
  const [detailsSortField, setDetailsSortField] = useState<'date' | 'primaryOdds' | 'drawOdds' | 'opponentOdds'>('date');
  const [detailsSortOrder, setDetailsSortOrder] = useState<'asc' | 'desc'>('asc');


  // Fetch Logic
  const fetchScores = useCallback(async () => {
    setSyncing(true);
    try {
      // Fetch from API
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      const data = await response.json();
      
      if (data && data.games) {
        setMatches(data.games);
        setDataSource('live');
        setLastSynced(new Date());
        setError(null);
      } else {
        throw new Error('Invalid structure from live API');
      }
    } catch (apiErr) {
      console.warn('Live API fetch failed, falling back to local cached games.json', apiErr);
      
      // Fallback to local games.json
      try {
        const localResponse = await fetch(CACHE_FALLBACK_URL);
        if (!localResponse.ok) throw new Error('Local fallback file missing');
        const localData = await localResponse.json();
        
        if (localData && localData.games) {
          setMatches(localData.games);
          setDataSource('cache');
          setLastSynced(new Date());
          setError(null);
        } else {
          throw new Error('Invalid structure from cached fallback JSON');
        }
      } catch (cacheErr) {
        console.error('All data sources failed', cacheErr);
        setError('Unable to fetch matches from live server or local fallback. Please try again.');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
      setRefreshCountdown(300);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // Handle Polling Interval
  useEffect(() => {
    if (!autoRefresh || loading) return;

    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchScores();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, loading, fetchScores]);

  // Filter Group Stage Matches and sort them chronologically
  const groupStageMatches = useMemo(() => {
    return [...matches]
      .filter(m => m.type === 'group')
      .sort((a, b) => parseMatchDate(a.local_date) - parseMatchDate(b.local_date));
  }, [matches]);

  // Filter and sort matches for the selected federation
  const selectedFederationMatches = useMemo(() => {
    if (!selectedFederation) return [];
    
    // Filter matches where either team is in the selected federation
    const filtered = groupStageMatches.filter(m => {
      const homeFed = getFederationForCountry(m.home_team_name_en);
      const awayFed = getFederationForCountry(m.away_team_name_en);
      return homeFed === selectedFederation || awayFed === selectedFederation;
    });

    // Map to include ordered teams and mock odds
    const mapped = filtered.map(m => {
      const homeFed = getFederationForCountry(m.home_team_name_en);
      const awayFed = getFederationForCountry(m.away_team_name_en);
      const isHomeSelected = homeFed === selectedFederation;
      const isAwaySelected = awayFed === selectedFederation;
      
      const mockOdds = getMockOdds(m.id, m.home_team_name_en, m.away_team_name_en, m.home_score, m.away_score, m.finished);
      
      let primaryTeam = '';
      let primaryFed: FederationAcronym = selectedFederation;
      let primaryScore = '';
      let primaryOdds = 0;
      
      let opponentTeam = '';
      let opponentFed: FederationAcronym = 'UEFA';
      let opponentScore = '';
      let opponentOdds = 0;
      
      if (isHomeSelected && isAwaySelected) {
        // Both are in the selected federation
        primaryTeam = m.home_team_name_en;
        primaryFed = homeFed;
        primaryScore = m.home_score;
        primaryOdds = parseFloat(mockOdds.home);
        
        opponentTeam = m.away_team_name_en;
        opponentFed = awayFed;
        opponentScore = m.away_score;
        opponentOdds = parseFloat(mockOdds.away);
      } else if (isHomeSelected) {
        primaryTeam = m.home_team_name_en;
        primaryFed = homeFed;
        primaryScore = m.home_score;
        primaryOdds = parseFloat(mockOdds.home);
        
        opponentTeam = m.away_team_name_en;
        opponentFed = awayFed;
        opponentScore = m.away_score;
        opponentOdds = parseFloat(mockOdds.away);
      } else {
        primaryTeam = m.away_team_name_en;
        primaryFed = awayFed;
        primaryScore = m.away_score;
        primaryOdds = parseFloat(mockOdds.away);
        
        opponentTeam = m.home_team_name_en;
        opponentFed = homeFed;
        opponentScore = m.home_score;
        opponentOdds = parseFloat(mockOdds.home);
      }
      
      // Determine date parts for display
      // Format of m.local_date: "06/12/2026 18:00" -> We want: Date as e.g. "12 Jun", Year as "2026"
      let dateDisplay = '';
      let yearDisplay = '2026';
      if (m.local_date) {
        const [datePart] = m.local_date.split(' ');
        if (datePart) {
          const [month, day, year] = datePart.split('/').map(Number);
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          dateDisplay = `${day} ${months[month - 1]}`;
          yearDisplay = String(year);
        }
      }
      
      return {
        originalMatch: m,
        dateDisplay,
        yearDisplay,
        primaryTeam,
        primaryFed,
        primaryScore,
        primaryOdds,
        opponentTeam,
        opponentFed,
        opponentScore,
        opponentOdds,
        drawOdds: parseFloat(mockOdds.draw)
      };
    });

    // Sort the mapped list
    return mapped.sort((a, b) => {
      let comparison = 0;
      if (detailsSortField === 'date') {
        comparison = parseMatchDate(a.originalMatch.local_date) - parseMatchDate(b.originalMatch.local_date);
      } else if (detailsSortField === 'primaryOdds') {
        comparison = a.primaryOdds - b.primaryOdds;
      } else if (detailsSortField === 'drawOdds') {
        comparison = a.drawOdds - b.drawOdds;
      } else if (detailsSortField === 'opponentOdds') {
        comparison = a.opponentOdds - b.opponentOdds;
      }
      
      return detailsSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [groupStageMatches, selectedFederation, detailsSortField, detailsSortOrder]);

  const handleDetailsSort = (field: 'date' | 'primaryOdds' | 'drawOdds' | 'opponentOdds') => {
    if (detailsSortField === field) {
      setDetailsSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDetailsSortField(field);
      setDetailsSortOrder('asc');
    }
  };

  // Calculate Standings

  const { federationStandings, groupStandings } = useMemo(() => {
    const countryStats: Record<string, CountryStanding> = {};

    // Helper to initialize country
    const initCountry = (country: string): CountryStanding => {
      if (!countryStats[country]) {
        countryStats[country] = {
          country,
          federation: getFederationForCountry(country),
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          pts: 0
        };
      }
      return countryStats[country];
    };

    // Calculate country records from matches
    groupStageMatches.forEach(m => {
      const home = m.home_team_name_en;
      const away = m.away_team_name_en;
      
      // Only process valid teams
      if (!home || !away) return;
      
      const isFinished = m.finished === 'TRUE' || m.time_elapsed === 'finished';
      
      initCountry(home);
      initCountry(away);

      // Intra-federation matches are not considered in the standings
      const homeFed = getFederationForCountry(home);
      const awayFed = getFederationForCountry(away);
      if (homeFed === awayFed) return;

      if (isFinished) {
        const homeScore = parseInt(m.home_score) || 0;
        const awayScore = parseInt(m.away_score) || 0;

        countryStats[home].played += 1;
        countryStats[away].played += 1;

        countryStats[home].gf += homeScore;
        countryStats[home].ga += awayScore;
        countryStats[home].gd += (homeScore - awayScore);

        countryStats[away].gf += awayScore;
        countryStats[away].ga += homeScore;
        countryStats[away].gd += (awayScore - homeScore);

        if (homeScore > awayScore) {
          countryStats[home].won += 1;
          countryStats[home].pts += 3;
          countryStats[away].lost += 1;
        } else if (homeScore < awayScore) {
          countryStats[away].won += 1;
          countryStats[away].pts += 3;
          countryStats[home].lost += 1;
        } else {
          countryStats[home].drawn += 1;
          countryStats[home].pts += 1;
          countryStats[away].drawn += 1;
          countryStats[away].pts += 1;
        }
      }
    });

    // Group countries by group name
    const groupsMap: Record<string, CountryStanding[]> = {};
    groupStageMatches.forEach(m => {
      const groupName = m.group;
      const home = m.home_team_name_en;
      const away = m.away_team_name_en;
      
      if (!groupName || !home || !away) return;
      
      if (!groupsMap[groupName]) {
        groupsMap[groupName] = [];
      }
      
      const homeStat = countryStats[home];
      const awayStat = countryStats[away];

      if (homeStat && !groupsMap[groupName].some(t => t.country === home)) {
        groupsMap[groupName].push(homeStat);
      }
      if (awayStat && !groupsMap[groupName].some(t => t.country === away)) {
        groupsMap[groupName].push(awayStat);
      }
    });

    // Format and sort Group Standings
    const groupStandingsList: GroupStanding[] = Object.keys(groupsMap)
      .sort()
      .map(groupName => {
        const sortedTeams = [...groupsMap[groupName]].sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          return b.gf - a.gf;
        });
        return { groupName, teams: sortedTeams };
      });

    // Aggregate Federation Standings
    const fedStats: Record<FederationAcronym, FedStanding> = {
      UEFA: { acronym: 'UEFA', details: FEDERATION_DETAILS.UEFA, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 },
      CONCACAF: { acronym: 'CONCACAF', details: FEDERATION_DETAILS.CONCACAF, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 },
      CONMEBOL: { acronym: 'CONMEBOL', details: FEDERATION_DETAILS.CONMEBOL, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 },
      CAF: { acronym: 'CAF', details: FEDERATION_DETAILS.CAF, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 },
      AFC: { acronym: 'AFC', details: FEDERATION_DETAILS.AFC, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 },
      OFC: { acronym: 'OFC', details: FEDERATION_DETAILS.OFC, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, teamCount: 0, winRate: 0 }
    };

    // Accumulate each country's records into their respective federation
    Object.values(countryStats).forEach(c => {
      const fed = c.federation;
      if (fedStats[fed]) {
        fedStats[fed].played += c.played;
        fedStats[fed].won += c.won;
        fedStats[fed].drawn += c.drawn;
        fedStats[fed].lost += c.lost;
        fedStats[fed].gf += c.gf;
        fedStats[fed].ga += c.ga;
        fedStats[fed].gd += c.gd;
        fedStats[fed].pts += c.pts;
        fedStats[fed].teamCount += 1;
      }
    });

    // Calculate win rates & finalize fed list
    const federationStandingsList = Object.values(fedStats).map(f => {
      const winRate = f.played > 0 ? (f.won / f.played) * 100 : 0;
      return { ...f, winRate };
    }).sort((a, b) => {
      // Primary sorting by Points/Match or Win Rate, standard: average points per game (PTS / Matches)
      const aAvgPts = a.played > 0 ? a.pts / a.played : 0;
      const bAvgPts = b.played > 0 ? b.pts / b.played : 0;
      if (bAvgPts !== aAvgPts) return bAvgPts - aAvgPts;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.gd - a.gd;
    });

    return { 
      federationStandings: federationStandingsList, 
      groupStandings: groupStandingsList 
    };
  }, [groupStageMatches]);

  // Filter Matches for Display
  const filteredMatches = useMemo(() => {
    return groupStageMatches.filter(m => {
      const home = m.home_team_name_en || '';
      const away = m.away_team_name_en || '';
      const homeFed = getFederationForCountry(home);
      const awayFed = getFederationForCountry(away);
      const isFinished = m.finished === 'TRUE' || m.time_elapsed === 'finished';

      // 1. Text Search Query
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = query === '' || 
        home.toLowerCase().includes(query) || 
        away.toLowerCase().includes(query) ||
        homeFed.toLowerCase().includes(query) ||
        awayFed.toLowerCase().includes(query) ||
        m.group.toLowerCase().includes(query);

      // 2. Federation Filter
      const matchesFed = selectedFedFilter === 'ALL' ||
        homeFed === selectedFedFilter ||
        awayFed === selectedFedFilter;

      // 3. Status Filter
      let matchesStatus = true;
      if (selectedStatusFilter === 'FINISHED') matchesStatus = isFinished;
      if (selectedStatusFilter === 'SCHEDULED') matchesStatus = !isFinished;

      return matchesSearch && matchesFed && matchesStatus;
    });
  }, [groupStageMatches, searchQuery, selectedFedFilter, selectedStatusFilter]);

  // Find the last finished match in the filteredMatches list
  const lastFinishedMatchId = useMemo(() => {
    for (let i = filteredMatches.length - 1; i >= 0; i--) {
      const m = filteredMatches[i];
      if (m.finished === 'TRUE' || m.time_elapsed === 'finished') {
        return m.id;
      }
    }
    return null;
  }, [filteredMatches]);

  const matchesContainerRef = useRef<HTMLDivElement | null>(null);
  const activeMatchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeMatchRef.current && matchesContainerRef.current && !loading) {
      const parent = matchesContainerRef.current;
      const child = activeMatchRef.current;
      const timer = setTimeout(() => {
        const targetScrollTop = child.offsetTop - (parent.clientHeight / 2) + (child.clientHeight / 2);
        parent.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [lastFinishedMatchId, loading]);

  return (
    <div className="container">
      {/* Header Panel */}
      <header className="glass-panel" style={{ padding: '1.25rem 1.75rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.25rem', fontFamily: 'var(--font-display)' }}>
            World Cup 2026
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '800px' }}>
            Consolidated continental federation standings and matches tracker. Follow UEFA, CONCACAF, CONMEBOL, CAF, AFC, and OFC performance in real time.
          </p>
        </div>
        <a 
          href="https://github.com/anastluc/federations-world-cup"
          target="_blank"
          rel="noopener noreferrer"
          title="View on GitHub"
          className="tab-btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '0.8rem',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            height: 'fit-content'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          GitHub
        </a>
      </header>

      {/* Main Grid: Standings Leaderboard and Live Match Tracker */}
      <main className="grid-container">
        
        {/* Left Column: Standings Dashboard */}
        <section className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🏆 Standings
            </h2>

            {/* View Toggle tabs */}
            <div className="tab-container">
              <button 
                id="tab-federation-btn"
                className={`tab-btn ${activeTab === 'federation' ? 'active' : ''}`}
                onClick={() => setActiveTab('federation')}
              >
                Federations
              </button>
              <button 
                id="tab-groups-btn"
                className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
                onClick={() => setActiveTab('groups')}
              >
                World Cup Groups
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
              <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid rgba(0,0,0,0.08)', borderTopColor: 'var(--info)', borderRadius: '50%' }}></div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Crunching World Cup metrics...</p>
            </div>
          ) : error && matches.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--error)' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>⚠️ {error}</p>
              <button onClick={() => fetchScores()} className="tab-btn active">Retry Connection</button>
            </div>
          ) : activeTab === 'federation' ? (
            /* FEDERATION LEADERBOARD */
            <div style={{ overflowX: 'auto' }}>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Rank</th>
                    <th>Federation</th>
                    <th className="text-center">Teams</th>
                    <th className="text-center border-r-light">Pld</th>
                    <th className="text-center">W</th>
                    <th className="text-center">D</th>
                    <th className="text-center border-r-light">L</th>
                    <th className="text-center">GF</th>
                    <th className="text-center">GA</th>
                    <th className="text-center border-r-light">GD</th>
                    <th className="text-center font-bold border-r-light" style={{ color: 'var(--text-primary)' }}>Pts</th>
                    <th className="text-right">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {federationStandings.map((fed, index) => {
                    const color = fed.details.color;
                    const isSelected = selectedFederation === fed.acronym;
                    return (
                      <tr 
                        key={fed.acronym} 
                        onClick={() => setSelectedFederation(isSelected ? null : fed.acronym)}
                        title="Click to view matches & odds"
                        style={{ 
                          borderLeft: `3px solid ${color}`,
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'rgba(0, 0, 0, 0.04)' : undefined
                        }}
                      >
                        <td className="font-bold text-center" style={{ fontSize: '1rem' }}>{index + 1}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className={`fed-badge ${fed.acronym}`}>{fed.acronym}</span>
                              <span style={{ fontWeight: 600 }}>{fed.details.region}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                              {fed.details.name}
                            </span>
                          </div>
                        </td>
                        <td className="text-center">{fed.teamCount}</td>
                        <td className="text-center border-r-light">{fed.played}</td>
                        <td className="text-center" style={{ color: 'var(--success)', fontWeight: 500 }}>{fed.won}</td>
                        <td className="text-center" style={{ color: 'var(--text-secondary)' }}>{fed.drawn}</td>
                        <td className="text-center border-r-light" style={{ color: 'var(--error)' }}>{fed.lost}</td>
                        <td className="text-center">{fed.gf}</td>
                        <td className="text-center">{fed.ga}</td>
                        <td className="text-center font-bold border-r-light" style={{ color: fed.gd > 0 ? 'var(--success)' : fed.gd < 0 ? 'var(--error)' : 'inherit' }}>
                          {fed.gd > 0 ? `+${fed.gd}` : fed.gd}
                        </td>
                        <td className="text-center font-bold border-r-light" style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                          {fed.pts}
                        </td>
                        <td className="text-right font-bold" style={{ color: color }}>
                          {fed.winRate.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.01)', borderRadius: '8px', border: '1px dashed var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <strong>Calculation Method:</strong> Standing metrics aggregate all individual country matches in the group stage. Matches between teams of the same federation count twice (adding a win and a loss, or two draws) towards the overall federation activity to maintain consistent points totals. Sorting is by Avg Points/Game (Pts/Pld), Win %, Goal Difference, then Goals For.
              </div>

              {/* Selected Federation Matches & Odds Detail Section */}
              {selectedFederation && (
                <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ⚽ <span className={`fed-badge ${selectedFederation}`}>{selectedFederation}</span> Matches &amp; Deterministic Odds
                    </span>
                    <button 
                      onClick={() => setSelectedFederation(null)} 
                      className="tab-btn" 
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px' }}
                    >
                      Close ×
                    </button>
                  </h3>
                  
                  {selectedFederationMatches.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem', fontSize: '0.9rem' }}>
                      No matches found for {selectedFederation}.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}>
                            <th onClick={() => handleDetailsSort('date')} style={{ padding: '0.6rem 0.5rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}>
                              DATE {detailsSortField === 'date' ? (detailsSortOrder === 'asc' ? '▼' : '▲') : '⇅'}
                            </th>
                            <th style={{ padding: '0.6rem 0.5rem' }}>YR</th>
                            <th style={{ padding: '0.6rem 0.5rem' }}>{selectedFederation} TEAM</th>
                            <th style={{ padding: '0.6rem 0.2rem', width: '20px', textAlign: 'center' }}></th>
                            <th style={{ padding: '0.6rem 0.5rem' }}>OTHER TEAM</th>
                            <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>SCORE</th>
                            <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>RESULT</th>
                            <th onClick={() => handleDetailsSort('primaryOdds')} style={{ padding: '0.6rem 0.5rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}>
                              1 {detailsSortField === 'primaryOdds' ? (detailsSortOrder === 'asc' ? '▼' : '▲') : '⇅'}
                            </th>
                            <th onClick={() => handleDetailsSort('drawOdds')} style={{ padding: '0.6rem 0.5rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}>
                              X {detailsSortField === 'drawOdds' ? (detailsSortOrder === 'asc' ? '▼' : '▲') : '⇅'}
                            </th>
                            <th onClick={() => handleDetailsSort('opponentOdds')} style={{ padding: '0.6rem 0.5rem', textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } as React.CSSProperties}>
                              2 {detailsSortField === 'opponentOdds' ? (detailsSortOrder === 'asc' ? '▼' : '▲') : '⇅'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedFederationMatches.map(({ originalMatch, dateDisplay, yearDisplay, primaryTeam, primaryFed, primaryScore, primaryOdds, opponentTeam, opponentFed, opponentScore, opponentOdds, drawOdds }) => {
                            const isFinished = originalMatch.finished === 'TRUE';
                            const isLive = originalMatch.finished === 'FALSE' && originalMatch.time_elapsed !== 'notstarted';
                            const isDraw = isFinished && parseInt(primaryScore, 10) === parseInt(opponentScore, 10);
                            const isPrimaryWin = isFinished && parseInt(primaryScore, 10) > parseInt(opponentScore, 10);
                            
                            let resultText = 'Scheduled';
                            let resultColor = 'var(--text-tertiary)';
                            
                            const isIntraFed = primaryFed === opponentFed;

                            if (isFinished) {
                              if (isIntraFed) {
                                resultText = 'Not Considered';
                                resultColor = 'var(--text-tertiary)';
                              } else if (isDraw) {
                                resultText = 'Draw';
                                resultColor = 'var(--warning)';
                              } else if (isPrimaryWin) {
                                resultText = `${primaryFed} Win`;
                                resultColor = `var(--color-${primaryFed.toLowerCase()})`;
                              } else {
                                resultText = `${opponentFed} Win`;
                                resultColor = `var(--color-${opponentFed.toLowerCase()})`;
                              }
                            } else if (isLive) {
                              resultText = isIntraFed ? 'LIVE (NC)' : 'LIVE';
                              resultColor = 'var(--error)';
                            } else if (isIntraFed) {
                              resultText = 'Not Considered';
                            }
                            
                            return (
                              <tr key={originalMatch.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{dateDisplay}</td>
                                <td style={{ padding: '0.6rem 0.5rem' }}>{yearDisplay}</td>
                                <td style={{ padding: '0.6rem 0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontWeight: 600 }}>{primaryTeam}</span>
                                    <span className={`fed-badge ${primaryFed}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>{primaryFed}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '0.6rem 0.2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>vs</td>
                                <td style={{ padding: '0.6rem 0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span>{opponentTeam}</span>
                                    <span className={`fed-badge ${opponentFed}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>{opponentFed}</span>
                                  </div>
                                </td>
                                <td className="font-bold text-center" style={{ padding: '0.6rem 0.5rem' }}>
                                  {isFinished || isLive ? `${primaryScore}-${opponentScore}` : '-'}
                                </td>
                                <td className="font-bold text-center" style={{ padding: '0.6rem 0.5rem', color: resultColor }}>
                                  {resultText}
                                </td>
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{primaryOdds.toFixed(2)}</td>
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{drawOdds.toFixed(2)}</td>
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{opponentOdds.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* WORLD CUP GROUP STANDINGS */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', maxHeight: '700px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {groupStandings.map(group => (
                <div key={group.groupName} className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.01)' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Group {group.groupName}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>Standings</span>
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '0.4rem 0.4rem', width: '25px' }}>#</th>
                        <th style={{ padding: '0.4rem 0.4rem' }}>Team</th>
                        <th className="border-r-light" style={{ padding: '0.4rem 0.4rem', textAlign: 'center' }}>Pld</th>
                        <th className="border-r-light" style={{ padding: '0.4rem 0.4rem', textAlign: 'center' }}>GD</th>
                        <th className="border-r-light" style={{ padding: '0.4rem 0.4rem', textAlign: 'right', fontWeight: 'bold' }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.teams.map((t, i) => (
                        <tr key={t.country} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600, color: i < 2 ? 'var(--success)' : i === 2 ? 'var(--warning)' : 'inherit' }}>{i + 1}</td>
                          <td style={{ padding: '0.5rem 0.4rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{t.country}</span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{t.federation}</span>
                            </div>
                          </td>
                          <td className="border-r-light" style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>{t.played}</td>
                          <td className="border-r-light" style={{ padding: '0.5rem 0.4rem', textAlign: 'center', color: t.gd > 0 ? 'var(--success)' : t.gd < 0 ? 'var(--error)' : 'inherit' }}>
                            {t.gd > 0 ? `+${t.gd}` : t.gd}
                          </td>
                          <td className="border-r-light" style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 'bold', fontSize: '0.9rem' }}>{t.pts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Matches Feed */}
        <section className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚽ Matches Feed
          </h2>

          {/* Filters Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <input 
                id="search-input"
                type="text" 
                placeholder="Search team, federation, or group..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.02)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '0.6rem 1rem 0.6rem 2.2rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
              />
              <svg style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {/* Federation filter */}
              <select
                id="fed-filter-select"
                value={selectedFedFilter}
                onChange={(e) => setSelectedFedFilter(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Federations</option>
                <option value="UEFA">UEFA (Europe)</option>
                <option value="CONCACAF">CONCACAF (N. America)</option>
                <option value="CONMEBOL">CONMEBOL (S. America)</option>
                <option value="CAF">CAF (Africa)</option>
                <option value="AFC">AFC (Asia)</option>
                <option value="OFC">OFC (Oceania)</option>
              </select>

              {/* Status filter */}
              <select
                id="status-filter-select"
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Match States</option>
                <option value="FINISHED">Finished Only</option>
                <option value="SCHEDULED">Scheduled Only</option>
              </select>
            </div>
          </div>

          {/* Matches List Container */}
          <div style={{ flex: '1 1 0%', minHeight: '0px', overflowY: 'auto', paddingRight: '0.5rem', position: 'relative' }} ref={matchesContainerRef}>
            {filteredMatches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                <p style={{ fontSize: '0.9rem' }}>No matching group stage games found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredMatches.map(m => {
                  const home = m.home_team_name_en;
                  const away = m.away_team_name_en;
                  const homeFed = getFederationForCountry(home);
                  const awayFed = getFederationForCountry(away);
                  const isFinished = m.finished === 'TRUE' || m.time_elapsed === 'finished';
                  const isLive = !isFinished && m.time_elapsed !== 'notstarted';

                  const homeScore = parseInt(m.home_score) || 0;
                  const awayScore = parseInt(m.away_score) || 0;

                  // Determine winner federation for finished matches
                  let winnerFed: string | null = null;
                  let loserFed: string | null = null;
                  let isDraw = false;

                  if (isFinished) {
                    if (homeScore > awayScore) {
                      winnerFed = homeFed;
                      loserFed = awayFed;
                    } else if (homeScore < awayScore) {
                      winnerFed = awayFed;
                      loserFed = homeFed;
                    } else {
                      isDraw = true;
                    }
                  }

                  return (
                    <div 
                      key={m.id} 
                      ref={m.id === lastFinishedMatchId ? activeMatchRef : null}
                      className="glass-panel" 
                      style={{ 
                        padding: '1rem', 
                        background: isLive ? 'rgba(37, 99, 235, 0.04)' : '#fcfcfc', 
                        borderColor: isLive ? 'rgba(37, 99, 235, 0.15)' : 'var(--glass-border)',
                        position: 'relative'
                      }}
                    >
                      {/* Match metadata line */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Group {m.group}</span>
                          <span>•</span>
                          <span>Matchday {m.matchday}</span>
                          {homeFed === awayFed && (
                            <>
                              <span>•</span>
                              <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.65rem', padding: '0.05rem 0.3rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                Not considered
                              </span>
                            </>
                          )}
                        </div>
                        {isLive ? (
                          <span style={{ color: 'var(--error)', fontWeight: 700, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <span className="animate-pulse-soft" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--error)', display: 'inline-block' }}></span>
                            LIVE {m.time_elapsed}'
                          </span>
                        ) : isFinished ? (
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Finished</span>
                        ) : (
                          <span>{m.local_date}</span>
                        )}
                      </div>

                      {/* Main Scores Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        {/* Home team */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isFinished && homeScore > awayScore ? 'var(--text-primary)' : isFinished ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                            {home}
                          </span>
                          <span className={`fed-badge ${homeFed}`} style={{ marginTop: '0.2rem', fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                            {homeFed}
                          </span>
                        </div>

                        {/* Score display */}
                        <div style={{ background: '#f9f9f9', padding: '0.4rem 0.8rem', borderRadius: '6px', minWidth: '60px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.1em', color: isFinished ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {isFinished || isLive ? `${homeScore} - ${awayScore}` : 'vs'}
                          </span>
                        </div>

                        {/* Away team */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isFinished && awayScore > homeScore ? 'var(--text-primary)' : isFinished ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                            {away}
                          </span>
                          <span className={`fed-badge ${awayFed}`} style={{ marginTop: '0.2rem', fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                            {awayFed}
                          </span>
                        </div>
                      </div>

                      {/* Federation Outcome Banner (if finished) */}
                      {isFinished && (
                        <div 
                          style={{ 
                            borderTop: '1px solid var(--border-light)', 
                            marginTop: '0.6rem', 
                            paddingTop: '0.5rem', 
                            display: 'flex', 
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 500
                          }}
                        >
                          {homeFed === awayFed ? (
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontStyle: 'italic' }}>
                              Intra-federation match • Not considered for standings
                            </span>
                          ) : isDraw ? (
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              🤝 Draw: <span className={`fed-badge ${homeFed}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.55rem' }}>{homeFed}</span> Draw &amp; <span className={`fed-badge ${awayFed}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.55rem' }}>{awayFed}</span> Draw
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                              🏆 <span className={`fed-badge ${winnerFed}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.55rem' }}>{winnerFed}</span> Win
                              <span>/</span>
                              ❌ <span className={`fed-badge ${loserFed}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.55rem' }}>{loserFed}</span> Loss
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Sync Routine Panel at the Bottom */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1rem 2rem', background: 'rgba(0,0,0,0.01)', borderRadius: '12px', minWidth: '320px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap', width: '100%', maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 600 }}>Sync Routine</span>
            <span 
              id="source-indicator" 
              style={{ 
                fontSize: '0.7rem', 
                padding: '0.15rem 0.4rem', 
                borderRadius: '4px', 
                fontWeight: 600, 
                background: dataSource === 'live' ? 'rgba(16, 185, 129, 0.15)' : dataSource === 'cache' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: dataSource === 'live' ? 'var(--success)' : dataSource === 'cache' ? 'var(--warning)' : 'var(--error)'
              }}
            >
              {dataSource === 'live' ? '● LIVE API' : dataSource === 'cache' ? '▲ LOCAL CACHE' : '✖ OFFLINE'}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <button
              id="sync-now-button"
              onClick={() => fetchScores()}
              disabled={syncing}
              className="tab-btn active"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.4rem 0.8rem', 
                fontSize: '0.8rem',
                opacity: syncing ? 0.7 : 1,
                cursor: syncing ? 'not-allowed' : 'pointer'
              }}
            >
              <svg className={syncing ? 'animate-spin' : ''} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <input 
                id="auto-update-checkbox"
                type="checkbox" 
                checked={autoRefresh} 
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto ({formatCountdown(refreshCountdown)})
            </label>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Last Synced: {lastSynced ? lastSynced.toLocaleTimeString() : 'Never'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer style={{ marginTop: '3rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <span>FIFA World Cup 2026 Continental Federation Dashboard</span>
        <span>
          <a href="https://github.com/anastluc/federations-world-cup" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid var(--text-tertiary)' }}>GitHub Repository</a> • Aesthetic Minimalist Design
        </span>
      </footer>
    </div>
  );
}
