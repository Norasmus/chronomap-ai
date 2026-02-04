
import { ProcessedEvent, DashboardStats } from '../types';

/**
 * Parses a string like "34.4102107°, -119.8555576°" into [lat, lng]
 */
const parseLatLngString = (str: any): [number, number] | null => {
    if (typeof str !== 'string') return null;
    const match = str.match(/([-+]?\d*\.?\d+)°,\s*([-+]?\d*\.?\d+)°/);
    if (match) {
        return [parseFloat(match[1]), parseFloat(match[2])];
    }
    return null;
};

const e7ToFloat = (e7: any) => {
    if (typeof e7 === 'number') return e7 / 1e7;
    if (typeof e7 === 'string') return parseFloat(e7) / 1e7;
    return 0;
};

const isLocationLike = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    const keys = ['lat', 'latitude', 'latE7', 'latitudeE7', 'placeVisit', 'activitySegment', 'geometry', 'semanticSegments', 'rawSignals', 'latLng', 'LatLng'];
    return keys.some(k => k in obj);
};

const findDataArray = (data: any): any[] | null => {
    if (!data) return null;
    if (Array.isArray(data)) return data;

    // Prioritize keys found in user samples
    const priorityKeys = ['semanticSegments', 'rawSignals', 'timelineObjects', 'locations', 'features'];
    for (const key of priorityKeys) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
            return data[key];
        }
    }

    // Fallback recursive search
    let bestArray: any[] | null = null;
    let maxLocationCount = 0;
    const search = (node: any, depth = 0) => {
        if (depth > 5 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            const locationCount = node.filter(isLocationLike).length;
            if (locationCount > maxLocationCount) {
                maxLocationCount = locationCount;
                bestArray = node;
            }
            return;
        }
        for (const key in node) { search(node[key], depth + 1); }
    };
    search(data);
    return bestArray;
};

/**
 * Calculates statistics for a given set of events.
 * This is separated to allow re-calculation when filtering.
 */
export const calculateStats = (events: ProcessedEvent[]): DashboardStats => {
    if (events.length === 0) {
        return {
            totalDistanceKm: 0,
            totalVisits: 0,
            uniquePlaces: 0,
            topCities: [],
            activityBreakdown: [],
            dateRange: { start: new Date(), end: new Date() },
            placeVisitCounts: {}
        };
    }

    let totalDistanceMeters = 0;
    const placeCounts = new Map<string, number>(); // City counts
    const visitCountsByName = new Map<string, number>(); // Specific Place Name counts
    const activityCounts = new Map<string, number>();
    const uniquePlaceTitles = new Set<string>();
    
    let minDate = new Date(8640000000000000);
    let maxDate = new Date(-8640000000000000);

    events.forEach(e => {
        // Date Range
        if (e.startTime < minDate) minDate = e.startTime;
        if (e.endTime > maxDate) maxDate = e.endTime;

        // Distance
        if (e.distanceMeters) {
            totalDistanceMeters += e.distanceMeters;
        }

        // Visits & Places
        if (e.type === 'VISIT') {
            uniquePlaceTitles.add(e.title);
            
            // Track visit frequency by name
            visitCountsByName.set(e.title, (visitCountsByName.get(e.title) || 0) + 1);

            // Track city frequency
            if (e.city) {
                placeCounts.set(e.city, (placeCounts.get(e.city) || 0) + 1);
            }
        }

        // Activity Breakdown
        if (e.type === 'MOVE' && e.activityType) {
            activityCounts.set(e.activityType, (activityCounts.get(e.activityType) || 0) + 1);
        } else if (e.type === 'POINT') {
            // Count point clusters as generic tracking if needed, or ignore
        }
    });

    const topCities = Array.from(placeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    const activityBreakdown = Array.from(activityCounts.entries())
        .map(([name, value]) => ({ name, value }));
    
    // Fallback if no specific activities found
    if (activityBreakdown.length === 0 && events.length > 0) {
        activityBreakdown.push({ name: 'Recorded Points', value: events.length });
    }

    const placeVisitCounts = Object.fromEntries(visitCountsByName);

    return {
        totalDistanceKm: Math.round(totalDistanceMeters / 1000),
        totalVisits: events.filter(e => e.type === 'VISIT').length,
        uniquePlaces: uniquePlaceTitles.size,
        topCities,
        activityBreakdown,
        dateRange: { start: minDate, end: maxDate },
        placeVisitCounts
    };
};

export const extractCity = (address?: string): string | undefined => {
    if (!address) return undefined;
    const parts = address.split(',').map(p => p.trim());
    
    // Handle standard Google Places format: "Street, City, Region Zip, Country"
    // Heuristic: If address has enough parts, and second-to-last part contains digits (Zip),
    // it's likely "State Zip". We want the part before that.
    
    if (parts.length >= 3) {
        const regionPart = parts[parts.length - 2];
        // Check for digits in the region part (e.g. "CA 94103")
        if (/\d/.test(regionPart)) {
             return parts[parts.length - 3];
        }
        return regionPart;
    }
    
    if (parts.length === 2) {
        return parts[0];
    }
    
    return parts.length > 0 ? parts[0] : undefined;
};

export const parseTimelineData = (jsonData: any): { events: ProcessedEvent[]; stats: DashboardStats } | null => {
  try {
    const rawItems = findDataArray(jsonData);
    if (!rawItems || rawItems.length === 0) return null;

    const events: ProcessedEvent[] = [];

    rawItems.forEach((obj: any, index: number) => {
      // 1. Semantic Segment (Newer Android Format)
      const startTime = obj.startTime || obj.duration?.startTimestamp;
      const endTime = obj.endTime || obj.duration?.endTimestamp;
      
      if (startTime) {
        const start = new Date(startTime);
        const end = new Date(endTime || startTime);

        // Handle Visit inside semantic segment
        if (obj.visit) {
            const topCandidate = obj.visit.topCandidate;
            const latLngStr = topCandidate?.placeLocation?.latLng;
            const coords = parseLatLngString(latLngStr);

            if (coords && !isNaN(start.getTime())) {
                const name = topCandidate?.name || 'Visited Place';
                const city = extractCity(topCandidate?.placeLocation?.address); 
                const placeId = topCandidate?.placeId;

                events.push({
                    id: `v-${index}`,
                    type: 'VISIT',
                    title: name,
                    subtitle: `Visit duration: ${Math.round((end.getTime() - start.getTime()) / 60000)}m`,
                    startTime: start,
                    endTime: end,
                    lat: coords[0],
                    lng: coords[1],
                    city: city,
                    placeId: placeId,
                    raw: obj
                });
            }
        } 
        // Handle Activity inside semantic segment
        else if (obj.activity) {
            const startCoords = parseLatLngString(obj.activity.start?.latLng);
            const endCoords = parseLatLngString(obj.activity.end?.latLng);
            const type = obj.activity.topCandidate?.type || 'MOVE';
            
            if (endCoords && !isNaN(start.getTime())) {
                events.push({
                    id: `a-${index}`,
                    type: 'MOVE',
                    title: type.replace(/_/g, ' '),
                    subtitle: `${Math.round((obj.activity.distanceMeters || 0) / 1000)} km journey`,
                    startTime: start,
                    endTime: end,
                    lat: endCoords[0],
                    lng: endCoords[1],
                    distanceMeters: obj.activity.distanceMeters,
                    activityType: type.replace(/_/g, ' '),
                    raw: obj
                });
            }
        }
        // Handle timelinePath
        else if (obj.timelinePath && Array.isArray(obj.timelinePath)) {
            obj.timelinePath.forEach((pathPt: any, pIdx: number) => {
                const coords = parseLatLngString(pathPt.point);
                const ptTime = new Date(pathPt.time || startTime);
                if (coords && !isNaN(ptTime.getTime())) {
                    if (pIdx % 5 === 0) { // Decimate
                        events.push({
                            id: `tp-${index}-${pIdx}`,
                            type: 'POINT',
                            title: 'Path Point',
                            subtitle: ptTime.toLocaleTimeString(),
                            startTime: ptTime,
                            endTime: ptTime,
                            lat: coords[0],
                            lng: coords[1],
                            raw: pathPt
                        });
                    }
                }
            });
        }
      } 
      // 2. Raw Signals (Newer Android Format)
      else if (obj.position) {
          const latLngStr = obj.position.LatLng;
          const coords = parseLatLngString(latLngStr);
          const ts = obj.position.timestamp;
          if (coords && ts) {
              const date = new Date(ts);
              if (!isNaN(date.getTime())) {
                if (index % 50 === 0) {
                    events.push({
                        id: `rs-${index}`,
                        type: 'POINT',
                        title: 'Raw Signal',
                        subtitle: date.toLocaleTimeString(),
                        startTime: date,
                        endTime: date,
                        lat: coords[0],
                        lng: coords[1],
                        raw: obj
                    });
                }
              }
          }
      }
      // 3. Traditional Google Takeout Format (latE7, etc)
      else {
          const placeVisit = obj.placeVisit || obj.visit;
          const activitySegment = obj.activitySegment || obj.activity;

          if (placeVisit) {
              const loc = placeVisit.location || {};
              const lat = loc.latitudeE7 ? e7ToFloat(loc.latitudeE7) : (loc.latitude || loc.lat || 0);
              const lng = loc.longitudeE7 ? e7ToFloat(loc.longitudeE7) : (loc.longitude || loc.lng || 0);
              const startStr = placeVisit.duration?.startTimestamp || placeVisit.duration?.startTime;
              if (lat && lng && startStr) {
                  const start = new Date(startStr);
                  const end = new Date(placeVisit.duration?.endTimestamp || startStr);
                  const city = extractCity(loc.address);
                  const placeId = loc.placeId;

                  events.push({
                      id: `legacy-v-${index}`,
                      type: 'VISIT',
                      title: loc.name || 'Visited Place',
                      subtitle: 'Legacy format visit',
                      startTime: start,
                      endTime: end,
                      lat, lng, 
                      city: city,
                      placeId: placeId,
                      raw: obj
                  });
              }
          }
          else if (activitySegment) {
               // Legacy activity segment handling
               const startStr = activitySegment.duration?.startTimestamp || activitySegment.duration?.startTime;
               const endStr = activitySegment.duration?.endTimestamp || activitySegment.duration?.endTime;
               const type = activitySegment.activityType || 'TRAVEL';
               if (startStr) {
                   const start = new Date(startStr);
                   const end = new Date(endStr || startStr);
                   const loc = activitySegment.endLocation || activitySegment.startLocation;
                   const lat = loc?.latitudeE7 ? e7ToFloat(loc.latitudeE7) : (loc?.latitude || 0);
                   const lng = loc?.longitudeE7 ? e7ToFloat(loc.longitudeE7) : (loc?.longitude || 0);
                   
                   if (lat && lng) {
                        events.push({
                            id: `legacy-a-${index}`,
                            type: 'MOVE',
                            title: type,
                            subtitle: `${Math.round((activitySegment.distance || 0) / 1000)} km journey`,
                            startTime: start,
                            endTime: end,
                            lat, lng,
                            distanceMeters: activitySegment.distance,
                            activityType: type,
                            raw: obj
                        });
                   }
               }
          }
      }
    });

    if (events.length === 0) return null;

    // Sort by time
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    const stats = calculateStats(events);

    return { events, stats };
  } catch (error) {
    console.error("Data Parsing Error:", error);
    return null;
  }
};
