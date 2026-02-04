
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import { ProcessedEvent } from '../types';

interface MapViewProps {
  events: ProcessedEvent[];
  googleMapsApiKey?: string;
}

// --- Leaflet Implementation (Default) ---
const LeafletMap: React.FC<{ events: ProcessedEvent[] }> = ({ events }) => {
  const center: [number, number] = useMemo(() => {
    if (events.length === 0) return [20, 0];
    const lastEvent = events[events.length - 1];
    return [lastEvent.lat, lastEvent.lng];
  }, [events]);

  const displayEvents = useMemo(() => {
    if (events.length < 500) return events;
    return events.filter((_, i) => i % Math.ceil(events.length / 500) === 0);
  }, [events]);

  const pathOptions = { color: '#6366f1', weight: 2, opacity: 0.6 };
  const polylinePositions = useMemo(() => {
      return displayEvents.map(e => [e.lat, e.lng] as [number, number]);
  }, [displayEvents]);

  return (
    <div className="w-full h-full">
      <MapContainer 
        center={center} 
        zoom={5} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Polyline positions={polylinePositions} pathOptions={pathOptions} />
        {displayEvents.map((ev) => (
          <CircleMarker
            key={ev.id}
            center={[ev.lat, ev.lng]}
            radius={ev.type === 'VISIT' ? 5 : 3}
            pathOptions={{
              color: ev.type === 'VISIT' ? '#ec4899' : '#3b82f6',
              fillColor: ev.type === 'VISIT' ? '#ec4899' : '#3b82f6',
              fillOpacity: 0.7,
              weight: 0
            }}
          >
            <Popup className="leaflet-popup-dark">
              <div className="text-slate-800">
                <strong className="block text-sm">{ev.title}</strong>
                <span className="text-xs">{ev.subtitle}</span>
                <br/>
                <span className="text-xs text-slate-500">{ev.startTime.toLocaleDateString()}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

// --- Google Maps Implementation (Rich Details) ---
declare global {
  interface Window {
    google: any;
  }
}

const GoogleMap: React.FC<{ events: ProcessedEvent[]; apiKey: string }> = ({ events, apiKey }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [googleLib, setGoogleLib] = useState<any>(window.google || null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  // 1. Check for Google Maps Lib availability
  useEffect(() => {
    // Only set if not already set and window.google is available
    if (window.google && !googleLib) {
      setGoogleLib(window.google);
    }
    
    // Polling fallback in case parent loaded script but state update didn't propagate
    // or if this component mounted before script finish
    const interval = setInterval(() => {
        if (window.google && window.google.maps && !googleLib) {
            setGoogleLib(window.google);
            clearInterval(interval);
        }
    }, 500);

    return () => clearInterval(interval);
  }, [googleLib]);

  // 2. Initialize Map
  useEffect(() => {
    // Ensure importLibrary is available before proceeding
    if (!googleLib || !googleLib.maps || !googleLib.maps.importLibrary || !mapRef.current || mapInstance) return;

    const initMap = async () => {
      try {
        const { Map } = await googleLib.maps.importLibrary("maps");
        const map = new Map(mapRef.current, {
            center: { lat: 20, lng: 0 },
            zoom: 4,
            mapId: "TIMELINE_VIEWER_MAP", // Required for AdvancedMarkerElement
            disableDefaultUI: false,
            backgroundColor: '#0f172a',
        });
        setMapInstance(map);
      } catch (e) {
          console.error("Error initializing Google Map", e);
      }
    };

    initMap();
  }, [googleLib]); 

  // 3. Render Markers & Lines
  useEffect(() => {
    if (!mapInstance || !googleLib || !googleLib.maps || !googleLib.maps.importLibrary || events.length === 0) return;

    // Cleanup previous
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    const render = async () => {
      const { AdvancedMarkerElement, PinElement } = await googleLib.maps.importLibrary("marker");
      const { Place } = await googleLib.maps.importLibrary("places");
      const { InfoWindow } = await googleLib.maps.importLibrary("maps");
      const { Polyline } = await googleLib.maps.importLibrary("maps");
      const { LatLngBounds } = await googleLib.maps.importLibrary("core");

      const bounds = new LatLngBounds();
      const pathCoordinates: any[] = [];
      const infoWindow = new InfoWindow();

      // Filter events to avoid performance bottleneck on huge datasets
      const displayEvents = events.length > 500 ? events.filter((_, i) => i % Math.ceil(events.length / 500) === 0) : events;

      displayEvents.forEach((ev) => {
        const position = { lat: ev.lat, lng: ev.lng };
        bounds.extend(position);

        if (ev.type === 'VISIT') {
          // Create Marker
          const pin = new PinElement({
            background: '#ec4899',
            borderColor: '#be185d',
            glyphColor: '#ffffff',
            scale: 0.8
          });

          const marker = new AdvancedMarkerElement({
            map: mapInstance,
            position: position,
            title: ev.title,
            // Pass the PinElement instance directly (it extends HTMLElement)
            content: pin 
          });

          // Use 'gmp-click' event listener as required for Advanced Markers
          marker.addListener('gmp-click', async () => {
            // Content placeholder
            let contentString = `
              <div style="color: #1e293b; max-width: 240px;">
                <h3 style="font-weight: bold; margin-bottom: 4px;">${ev.title}</h3>
                <div style="font-size: 12px; margin-bottom: 8px;">${ev.subtitle}</div>
            `;

            if (ev.placeId) {
                contentString += `<div id="place-loading-${ev.id}">Loading details...</div>`;
            }
            contentString += `</div>`;
            
            infoWindow.setContent(contentString);
            infoWindow.open({ anchor: marker, map: mapInstance });

            // Fetch Rich Details if placeId exists
            if (ev.placeId) {
                try {
                    const place = new Place({ id: ev.placeId });
                    await place.fetchFields({
                        fields: ['displayName', 'formattedAddress', 'photos', 'rating', 'userRatingCount']
                    });
                    
                    let photoUrl = '';
                    if (place.photos && place.photos.length > 0) {
                        photoUrl = place.photos[0].getURI({ maxWidth: 240, maxHeight: 160 });
                    }

                    const richContent = `
                        <div style="color: #1e293b; max-width: 240px; font-family: sans-serif;">
                            <h3 style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${place.displayName || ev.title}</h3>
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">${place.formattedAddress || ev.subtitle}</div>
                            ${place.rating ? `<div style="font-size: 11px; margin-bottom: 6px; color: #d97706;">★ ${place.rating} (${place.userRatingCount})</div>` : ''}
                            ${photoUrl ? `<img src="${photoUrl}" style="width: 100%; height: auto; border-radius: 4px; margin-top: 4px;" alt="Place photo" />` : ''}
                        </div>
                    `;
                    infoWindow.setContent(richContent);
                } catch (err) {
                    console.error("Failed to fetch place details", err);
                    // Fallback content already set
                }
            }
          });

          markersRef.current.push(marker);
        } else {
          pathCoordinates.push(position);
        }
      });

      // Draw Polyline for movement
      if (pathCoordinates.length > 0) {
        const polyline = new Polyline({
          path: pathCoordinates,
          geodesic: true,
          strokeColor: "#6366f1",
          strokeOpacity: 0.8,
          strokeWeight: 3,
        });
        polyline.setMap(mapInstance);
        polylinesRef.current.push(polyline);
      }

      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds);
      }
    };

    render();
  }, [mapInstance, googleLib, events]);


  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

// --- Main Component ---
const MapView: React.FC<MapViewProps> = ({ events, googleMapsApiKey }) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl border border-slate-700 relative z-0">
      {googleMapsApiKey ? (
        <GoogleMap events={events} apiKey={googleMapsApiKey} />
      ) : (
        <LeafletMap events={events} />
      )}
    </div>
  );
};

export default MapView;
