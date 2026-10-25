import type { IdentityBadgeKind } from './identity-badges'

export type MatchStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'CHECK_IN'
  | 'LIVE'
  | 'FINISHED'
  | 'CONFIRMED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'ABANDONED'

export type SearchCategory = 'ALL' | 'PLAYER' | 'TEAM' | 'MATCH' | 'POST'

export interface TeamSummary {
  id: string
  teamCode: string
  name: string
  shortName: string
  collegeName: string | null
  primaryColor: string | null
  secondaryColor: string | null
  crestUrl: string | null
  /** Stored 2.80:1 team background (captain upload); null → the pre-cropped default. */
  coverUrl?: string | null
  groupName?: string | null
}
export interface MatchSummary {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt: string | null
  homeTeam: TeamSummary | null
  awayTeam: TeamSummary | null
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
  statusReason: string | null
  venue: { id: string; name: string } | null
  stageName?: string | null
  stageType?: string | null
  groupName?: string | null
  roundName?: string | null
  homePlaceholder?: string | null
  awayPlaceholder?: string | null
}

export interface PostAuthor {
  id: string
  displayName: string
  verificationLevel: string
  avatarUrl: string | null
  messageable: boolean
  roles?: string[]
  official?: boolean
  displayedBadgeKind?: string | null
}

export interface PublicPersonIdentity extends PostAuthor {
  roles: string[]
  official: boolean
}

export interface PublicPersonResponse extends PublicPersonIdentity {
  coverUrl?: string | null
  showPlayerIdentity?: boolean
  bio: string | null
  organizationName: string | null
  player: PlayerDetailResponse | null
  posts: PostSummary[]
  tournamentId: string
  tournamentName: string
}

export interface PostTag {
  kind: 'TOPIC' | 'TEAM' | 'PLAYER'
  label: string
  targetId?: string
}

export interface PostTagSuggestion extends PostTag {
  description?: string
}

export interface PostSummary {
  publicationState?: 'PUBLISHED' | 'PENDING_REVIEW'
  id: string
  type: 'OFFICIAL' | 'COMMUNITY'
  title: string | null
  body: string
  imageUrl: string | null
  imageUrls?: string[]
  tags?: PostTag[]
  tournamentId?: string
  publishedAt: string
  author: PostAuthor
  team: TeamSummary | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
  favoritedByMe?: boolean
  updatedAt?: string
  quotedPostId?: string | null
  quotedPost?: PostSummary | null
  deleted?: boolean
}

export interface PostComment {
  imageUrls?: string[]
  repostedPost?: PostSummary | null
  id: string
  body: string
  parentCommentId: string | null
  createdAt: string
  author: PostAuthor
  updatedAt?: string
  likeCount?: number
  likedByMe?: boolean
}

export interface PostDetail extends PostSummary {
  comments: PostComment[]
}

export interface AuthRole {
  role: string
  scopeType: string
  scopeId: string
}

export interface AuthUser {
  coverUrl?: string | null
  showPlayerIdentity?: boolean
  emailVerifiedAt?: string | null
  id: string
  organizationId: string
  username: string
  displayName: string
  realName: string | null
  studentId: string | null
  email: string | null
  bio: string | null
  avatarUrl: string | null
  verificationLevel: string
  roles: AuthRole[]
  linkedPlayer: {
    id: string
    displayName: string
    position: string | null
    avatarUrl: string | null
  } | null
}

export interface AdminIdentity {
  id: string
  username: string
  displayName: string
  realName: string | null
  studentId: string | null
  email: string | null
  verificationLevel: string
  roles: string[]
}

export interface AuthSession {
  accessToken: string
  expiresAt: string
  user: AuthUser
}

export interface RegisterInput {
  username: string
  displayName: string
  realName: string
  studentId: string
  email: string
  password: string
}

export interface HomeResponse {
  tournament: {
    id: string
    name: string
    seasonName: string
    status: string
    teamCount: number
    matchCount: number
  }
  announcements: PostSummary[]
  platformAnnouncements?: PostSummary[]
  focusMatches: MatchSummary[]
  teams: TeamSummary[]
  posts: PostSummary[]
  viewer: AuthUser | null
}

export interface SeasonOption {
  tournamentId: string
  tournamentName: string
  seasonId: string
  seasonName: string
  year: string
  status: string
}

export interface StandingRow {
  rank: number
  teamId: string
  teamName: string
  shortName: string
  primaryColor: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  isLive?: boolean
}

export interface PlayerStats {
  id: string
  displayName: string
  appearances: number
  starts: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  team: TeamSummary | null
}

export interface CompetitionDataResponse {
  tournament: {
    id: string
    name: string
    seasonName: string
    status: string
  }
  seasons: SeasonOption[]
  schedule: MatchSummary[]
  groups: Array<{
    id: string
    name: string
    standings: StandingRow[]
  }>
  bracket: Array<{
    id: string
    name: string
    number: number
    matches: MatchSummary[]
  }>
  leaders: {
    scorers: PlayerStats[]
    assists: PlayerStats[]
  }
  updatedAt: string
}

export interface TeamDashboardResponse {
  rosterSource?: 'OFFICIAL_SNAPSHOT' | 'TEAM_MEMBERSHIP' | 'MIXED'
  team: TeamSummary & {
    description: string | null
    motto: string | null
    foundedYear: number | null
    coachName: string | null
    captainName: string | null
    groupName: string | null
  }
  stats: {
    played: number
    won: number
    drawn: number
    lost: number
    goalsFor: number
    goalsAgainst: number
    points: number
    goalDifference: number
  }
  posts: PostSummary[]
  recentMatches: MatchSummary[]
  upcomingMatches: MatchSummary[]
  roster: Array<{
    rosterSource?: 'OFFICIAL_SNAPSHOT' | 'TEAM_MEMBERSHIP'
    id: string
    displayName: string
    jerseyName: string | null
    shirtNumber: string | null
    position: string | null
    secondaryPosition: string | null
    academicYear: string | null
    heightCm: number | null
    profileColor: string | null
    avatarUrl: string | null
    appearances: number
    goals: number
    assists: number
  }>
}

export interface PlayerDetailResponse {
  coverUrl?: string | null
  rosterSource?: 'OFFICIAL_SNAPSHOT' | 'TEAM_MEMBERSHIP'
  id: string
  person?: PublicPersonIdentity | null
  posts?: PostSummary[]
  displayName: string
  jerseyName: string | null
  shirtNumber: string | null
  position: string | null
  secondaryPosition: string | null
  dominantFoot: string | null
  heightCm: number | null
  academicYear: string | null
  major: string | null
  hometown: string | null
  bio: string | null
  profileColor: string | null
  avatarUrl: string | null
  portraitUrl: string | null
  isDemo: boolean
  abilities: {
    shooting: number | null
    speed: number | null
    dribbling: number | null
    passing: number | null
    defending: number | null
  }
  team: TeamSummary | null
  tournamentName: string | null
  stats: PlayerStats
  recentMatches: Array<MatchSummary & { starter: boolean; minutesPlayed: number }>
}

export interface MatchExperienceResponse extends MatchSummary {
  periodMinutes?: number
  summary: string | null
  /** 快报: official posts linked to this match; empty when none. */
  flashReports?: PostSummary[]
  attendance: number | null
  events: Array<{
    id: string
    type: string
    minute: number
    stoppageMinute: number | null
    description: string | null
    team: TeamSummary
    player: { id: string; displayName: string } | null
    relatedPlayer: { id: string; displayName: string } | null
  }>
  lineups: Array<{
    team: TeamSummary
    formation?: string | null
    lineupSource?:
      | 'CONFIRMED_APPEARANCES'
      | 'CONFIRMED_MATCH_LINEUP'
      | 'TEAM_DEFAULT'
      | 'TEAM_ROSTER'
      | 'UNAVAILABLE'
    appearanceRecorded?: boolean
    confirmedVersion?: number | null
    confirmedAt?: string | null
    players: Array<{
      id: string
      displayName: string
      shirtNumber: string | null
      position: string | null
      avatarUrl?: string | null
      starter: boolean
      minutesPlayed: number | null
      pitchPosition?: { x: number; y: number } | null
      profileColor?: string | null
    }>
  }>
  reviews: {
    averageRating: number | null
    ratingCount: number
    ratingDistribution?: Array<{ rating: number; count: number }>
    viewerReview: {
      rating: number
      body: string | null
    } | null
    comments: Array<{
      id: string
      rating: number
      body: string
      createdAt: string
      author: PostAuthor
    }>
  }
}

export interface TeamPreferencesResponse {
  primaryTeam: TeamSummary | null
  followedTeams: TeamSummary[]
  availableTeams: TeamSummary[]
}

export interface SearchResponse {
  query: string
  players: Array<{
    id: string
    displayName: string
    position: string | null
    academicYear: string | null
    profileColor: string | null
    avatarUrl: string | null
    team: TeamSummary | null
  }>
  teams: TeamSummary[]
  matches: MatchSummary[]
  posts: PostSummary[]
}

export interface LikeResponse {
  liked: boolean
  likeCount: number
}

export interface PlayerFollowItem {
  id: string
  displayName: string
  position: string | null
  avatarUrl: string | null
  profileColor: string | null
  team: TeamSummary | null
}

export interface PlayerFollowsResponse {
  items: PlayerFollowItem[]
}

export interface TeamRelationshipResponse {
  isCaptain: boolean
  membershipStatus: string | null
  application: {
    id: string
    status: string
    requestedPosition: string | null
    message: string | null
    decisionNote: string | null
    updatedAt: string
  } | null
}

export interface CaptainWorkspaceResponse {
  team: TeamSummary & {
    description: string | null
    motto: string | null
    foundedYear: number | null
    updatedAt: string
  }
  members: Array<{
    id: string
    userId: string | null
    playerId: string | null
    displayName: string
    avatarUrl: string | null
    position: string | null
    isCaptain: boolean
    updatedAt: string
  }>
  applications: Array<{
    id: string
    applicant: { id: string; displayName: string; avatarUrl: string | null }
    player: { id: string; displayName: string; avatarUrl: string | null } | null
    requestedPosition: string | null
    message: string | null
    status: string
    decisionNote: string | null
    createdAt: string
  }>
}

export interface NotificationResponse {
  unreadCount: number
  items: Array<{
    id: string
    type: string
    messageCategory?: 'mentions' | null
    title: string
    body: string | null
    linkPath: string | null
    readAt: string | null
    createdAt: string
    actor: { id: string; displayName: string; avatarUrl: string | null } | null
  }>
}

export type ReportTargetType =
  | 'POST'
  | 'COMMENT'
  | 'MATCH_REVIEW'
  | 'DIRECT_MESSAGE'
  | 'USER'
  | 'FEEDBACK'

export interface ReportItem {
  id: string
  targetType: ReportTargetType
  targetId: string | null
  reason: string
  details: string | null
  status: string
  resolution: string | null
  actionTaken: string | null
  createdAt: string
  updatedAt: string
  targetPreview?: {
    title: string
    body: string | null
    linkPath: string | null
  } | null
  reporter?: { id: string; displayName: string; avatarUrl: string | null }
  handledBy?: { id: string; displayName: string } | null
}

export interface ReportListResponse {
  items: ReportItem[]
}

export interface MessageUser {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface ConversationListResponse {
  canSend?: boolean
  items: Array<{
    id: string
    counterpart: MessageUser
    lastMessageAt: string | null
    latestMessage: { id: string; body: string; isMine: boolean; createdAt: string } | null
    unreadCount: number
  }>
}

export interface BadgePreferenceResponse {
  availableKinds: IdentityBadgeKind[]
  preferredKind: string | null
  displayedKind: string | null
  version: number
}

export interface MessageListResponse {
  conversation: { id: string; counterpart: MessageUser }
  items: Array<{
    id: string
    clientMessageId: string
    body: string
    isMine: boolean
    readAt: string | null
    createdAt: string
  }>
}
