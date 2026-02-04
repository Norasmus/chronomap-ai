
// Google Takeout JSON structures
export interface Location {
  latitudeE7?: number;
  longitudeE7?: number;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  address?: string;
  name?: string;
}

export interface RawLocation {
  timestampMs?: string;
  timestamp?: string;
  latitudeE7?: number;
  longitudeE7?: number;
  accuracy?: number;
  activity?: any[];
}

export interface Duration {
  startTimestamp?: string; // ISO string
  endTimestamp?: string;   // ISO string
  startTime?: string;      // Alternative format
  endTime?: string;        // Alternative format
}

export interface PlaceVisit {
  location: Location;
  duration: Duration;
  placeConfidence?: string;
  visitConfidence?: number;
  locationConfidence?: number;
  placeVisitType?: string;
  placeVisitImportance?: string;
}

export interface ActivitySegment {
  startLocation: Location;
  endLocation: Location;
  duration: Duration;
  distance?: number;
  activityType?: string;
  confidence?: string;
  activities?: { activityType: string; probability: number }[];
}

export interface TimelineObject {
  placeVisit?: PlaceVisit;
  activitySegment?: ActivitySegment;
  visit?: PlaceVisit;       // Alternative key
  activity?: ActivitySegment; // Alternative key
  // Raw location point fields
  timestampMs?: string;
  latitudeE7?: number;
  longitudeE7?: number;
}

export interface TimelineData {
  timelineObjects?: TimelineObject[];
  semanticSegments?: any[];
  locations?: RawLocation[];
}

// App internal types
export interface ProcessedEvent {
  id: string;
  type: 'VISIT' | 'MOVE' | 'POINT';
  title: string;
  subtitle: string;
  startTime: Date;
  endTime: Date;
  lat: number;
  lng: number;
  raw: any;
  // Fields for filtering/stats
  distanceMeters?: number;
  city?: string;
  activityType?: string;
  // Google Maps specific
  placeId?: string;
  placeTypes?: string[];
  // Semantic type (HOME, WORK, UNKNOWN, etc.)
  semanticType?: string;
}

export interface DashboardStats {
  totalDistanceKm: number;
  totalVisits: number;
  uniquePlaces: number;
  topCities: { name: string; count: number }[];
  activityBreakdown: { name: string; value: number }[];
  typeBreakdown: { name: string; count: number }[];
  dateRange: { start: Date; end: Date };
  // New field for AI context
  placeVisitCounts: Record<string, number>;
  // Home/Work stats
  homeStats?: { address: string; hours: number; visits: number };
  workStats?: { address: string; hours: number; visits: number };
}
