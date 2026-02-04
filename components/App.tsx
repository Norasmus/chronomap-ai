
import React, { useState, useMemo, useEffect, useRef } from 'react';
import FileUpload from './components/FileUpload';
import MapView from './components/MapView';
import StatsView from './components/StatsView';
import ChatInterface from './components/ChatInterface';
import { parseTimelineData, calculateStats, extractCity } from './services/dataProcessor';
import { ProcessedEvent, DashboardStats } from './types';
import { Map as MapIcon, BarChart2, MessageSquare, Loader2, Calendar, X, Settings, Key, RefreshCw, Search } from 'lucide-react';

export default function App() {
  const [data, setData] = useState<{ events: ProcessedEvent[]; stats: DashboardStats } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  
  // Filtering State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [placeFilter, setPlaceFilter] = useState<{name: string, id?: string} | null>(null);
  const [searchAllTime, setSearchAllTime] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState(''); // Temp state for input to avoid triggering load while typing
  const [mapsLoaded, setMapsLoaded] = useState(false);
  
  // Track invalid/expired Place IDs to avoid retrying them
  const failedEnrichmentIds = useRef<Set<string>>(new Set());
  
  // Autocomplete Class Ref (New Places API)
  const autocompleteClassRef = useRef<any>(null);

  // Sync temp key when settings open
  useEffect(() => {
    if (showSettings) {
        setTempApiKey(googleMapsApiKey);
    }
  }, [showSettings, googleMapsApiKey]);

  // Load Google Maps Script Global
  useEffect(() => {
    if (!googleMapsApiKey || window.google?.maps || mapsLoaded) return;

    const script = document.createElement('script');
    // Ensure we use 'places' library and a version that supports the new API
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places,marker&v=beta&loading=async`;
    script.async = true;
    script.onload = () => {
      setTimeout(() => {
          setMapsLoaded(true);
      }, 500);
    };
    script.onerror = () => {
        console.error("Failed to load Google Maps script");
    };
    document.head.appendChild(script);
  }, [googleMapsApiKey, mapsLoaded]);

  // Initialize AutocompleteSuggestion (New API)
  useEffect(() => {
      if (mapsLoaded && window.google?.maps?.places) {
          const initService = async () => {
             try {
                // Use new importLibrary pattern
                const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");
                autocompleteClassRef.current = AutocompleteSuggestion;
             } catch (e) {
                 console.error("Failed to init AutocompleteSuggestion", e);
             }
          };
          initService();
      }
  }, [mapsLoaded]);

  // Initial Data Load
  const handleFileLoaded = (jsonData: any) => {
    setIsProcessing(true);
    failedEnrichmentIds.current.clear();
    
    setTimeout(() => {
      try {
        const result = parseTimelineData(jsonData);
        if (result) {
          setData(result);
          
          const maxDate = result.stats.dateRange.end;
          const minDate = result.stats.dateRange.start;
          
          const defaultEnd = new Date(maxDate);
          const defaultStart = new Date(maxDate);
          defaultStart.setDate(defaultStart.getDate() - 7);
          
          const finalStart = defaultStart < minDate ? minDate : defaultStart;

          setStartDate(finalStart.toISOString().split('T')[0]);
          setEndDate(defaultEnd.toISOString().split('T')[0]);
        } else {
          alert('Could not find any location history in this file. Please ensure it is a valid Timeline export.');
        }
      } catch (err) {
        console.error(err);
        alert('An error occurred while reading the file.');
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  // Data Enrichment Logic
  const enrichData = async () => {
    if (!data || !window.google?.maps || !googleMapsApiKey || isEnriching) return;

    let startFilter = new Date(0); 
    let endFilter = new Date(8640000000000000); 
    
    if (startDate) startFilter = new Date(startDate);
    if (endDate) {
        endFilter = new Date(endDate);
        endFilter.setHours(23, 59, 59, 999);
    }
    
    setIsEnriching(true);
    setEnrichmentProgress(0);

    try {
        const { Place } = await window.google.maps.importLibrary("places");
        
        const unknownPlaces = new Map<string, ProcessedEvent[]>();
        
        data.events.forEach(e => {
            if (e.startTime < startFilter || e.startTime > endFilter) return;

            if (e.type === 'VISIT' && e.placeId && (e.title === 'Visited Place' || e.title === 'Unknown Location')) {
                if (failedEnrichmentIds.current.has(e.placeId)) return;
                const existing = unknownPlaces.get(e.placeId) || [];
                existing.push(e);
                unknownPlaces.set(e.placeId, existing);
            }
        });

        const uniqueIds = Array.from(unknownPlaces.keys());
        const limitedIds = uniqueIds.slice(0, 50);
        
        if (limitedIds.length === 0) {
            console.log("No new eligible places to enrich in current view.");
            setIsEnriching(false);
            return;
        }

        let processed = 0;
        const newEvents = [...data.events];
        let hasUpdates = false;

        for (const placeId of limitedIds) {
            try {
                const place = new Place({ id: placeId });
                await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
                
                const realName = place.displayName;
                const address = place.formattedAddress;
                
                if (realName) {
                    for (let i = 0; i < newEvents.length; i++) {
                        if (newEvents[i].placeId === placeId) {
                            newEvents[i] = {
                                ...newEvents[i],
                                title: realName,
                                subtitle: address || newEvents[i].subtitle,
                                city: extractCity(address) || newEvents[i].city
                            };
                            hasUpdates = true;
                        }
                    }
                }
            } catch (err: any) {
                 const msg = err?.message || '';
                 if (msg.includes('NOT_FOUND') || msg.includes('no longer valid')) {
                     failedEnrichmentIds.current.add(placeId);
                 } else {
                     console.warn(`Failed to enrich place ${placeId}`, err);
                 }
            }
            processed++;
            setEnrichmentProgress(Math.round((processed / limitedIds.length) * 100));
        }

        if (hasUpdates) {
            const newStats = calculateStats(newEvents);
            setData({ events: newEvents, stats: newStats });
        }

    } catch (err) {
        console.error("Enrichment error:", err);
    } finally {
        setIsEnriching(false);
    }
  };

  // Derive filtered data
  const filteredEvents = useMemo(() => {
    if (!data) return [];
    
    let result = data.events;

    // 1. Priority: Place Filter
    if (placeFilter) {
        const lowerTerm = placeFilter.name.toLowerCase();
        result = result.filter(e => {
            // Match by ID if available in both
            if (placeFilter.id && e.placeId && e.placeId === placeFilter.id) return true;
            
            // Text match (Fuzzy)
            const title = e.title?.toLowerCase() || '';
            const addr = e.subtitle?.toLowerCase() || '';
            return title.includes(lowerTerm) || addr.includes(lowerTerm);
        });
    }

    // 2. Date Filter
    const shouldIgnoreDates = placeFilter && searchAllTime;

    if (!shouldIgnoreDates) {
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            result = result.filter(e => e.startTime >= start && e.startTime <= end);
        }
    }

    return result;
  }, [data, startDate, endDate, placeFilter, searchAllTime]);

  const filteredStats = useMemo(() => {
    if (!data) return null;
    return calculateStats(filteredEvents);
  }, [data, filteredEvents]);

  const resetFilters = () => {
    if (data) {
        setStartDate(data.stats.dateRange.start.toISOString().split('T')[0]);
        setEndDate(data.stats.dateRange.end.toISOString().split('T')[0]);
        setPlaceFilter(null);
        setSearchAllTime(false);
        setSearchInputValue('');
        setSuggestions([]);
    }
  };

  const handleDateUpdate = (start: string, end: string) => {
      setStartDate(start);
      setEndDate(end);
  };
  
  const handlePlaceFilterUpdate = (query: string, allTime: boolean) => {
      setPlaceFilter({ name: query });
      setSearchInputValue(query);
      setSearchAllTime(allTime);
  };

  const handleSearchInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchInputValue(val);

      if (!val.trim()) {
          setPlaceFilter(null);
          setSuggestions([]);
          return;
      } 
      
      // Update local filter immediately
      setPlaceFilter({ name: val });
          
      // Fetch suggestions if API available
      if (autocompleteClassRef.current && val.length > 2) {
          try {
             // Use new Places API: AutocompleteSuggestion.fetchAutocompleteSuggestions
             const request = { input: val };
             const { suggestions } = await autocompleteClassRef.current.fetchAutocompleteSuggestions(request);
             // Filter only for actual place predictions
             const places = suggestions.filter((s: any) => !!s.placePrediction);
             setSuggestions(places || []);
          } catch (err) {
              // Fail silently or clear suggestions
              setSuggestions([]);
          }
      } else {
          setSuggestions([]);
      }
  };

  const selectSuggestion = (placeName: string, placeId?: string) => {
      setSearchInputValue(placeName);
      setPlaceFilter({ name: placeName, id: placeId });
      setSuggestions([]);
  };

  if (!data || !filteredStats) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center animate-fade-in">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <p className="text-white text-xl font-medium">Processing your timeline...</p>
            <p className="text-slate-400 text-sm mt-2">This may take a moment for large files</p>
          </div>
        )}
        
        <div className="text-center mb-8 animate-fade-in-up">
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400 mb-4 tracking-tight">ChronoMap AI</h1>
            <p className="text-slate-400 text-lg">Visualize, Search, and Chat with your Location History</p>
        </div>
        
        <div className="w-full max-w-2xl animate-fade-in-up delay-100">
            <FileUpload onFileLoaded={handleFileLoaded} />
        </div>

        <div className="mt-8 flex justify-center">
            <button 
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 text-slate-500 hover:text-indigo-400 transition-colors text-sm"
            >
                <Settings className="w-4 h-4" />
                Configure Google Maps API (Optional)
            </button>
        </div>

        {showSettings && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Key className="w-5 h-5 text-indigo-400" /> API Configuration
                    </h3>
                    <p className="text-slate-400 text-sm mb-4">
                        To enable rich map features (Satellite view, Photos, Place Details), enter your Google Maps API Key.
                        If left blank, the app uses standard maps.
                    </p>
                    <input 
                        type="password" 
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
                    />
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                        <button 
                            onClick={() => {
                                setGoogleMapsApiKey(tempApiKey);
                                setShowSettings(false);
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="mt-12 text-slate-500 text-sm max-w-md text-center">
          <p>Privacy Note: Your data is processed entirely in your browser and is never uploaded to any server.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <header className="h-auto md:h-20 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-3 md:py-0 bg-slate-900/80 backdrop-blur sticky top-0 z-50 gap-4">
        
        {/* Left: Logo & Upload */}
        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <MapIcon className="text-white w-5 h-5" />
             </div>
             <h1 className="font-bold text-xl text-slate-100 tracking-tight hidden lg:block">ChronoMap AI</h1>
           </div>
           
           <div className="flex gap-2">
              <button onClick={() => setData(null)} className="md:hidden text-xs font-medium text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg">
                  New
              </button>
               {googleMapsApiKey && (
                  <button 
                      onClick={enrichData}
                      disabled={isEnriching}
                      className="md:hidden text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                  >
                      {isEnriching ? `${enrichmentProgress}%` : <RefreshCw className="w-4 h-4" />}
                  </button>
               )}
           </div>
        </div>
        
        {/* Center: Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto overflow-x-auto md:overflow-visible py-2">
            
            {/* Search Bar */}
            <div className="relative z-50 flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 min-w-[280px] h-10">
                <Search className="w-4 h-4 text-slate-400 ml-2" />
                
                <input 
                    type="text" 
                    value={searchInputValue}
                    onChange={handleSearchInputChange}
                    placeholder="Search places..." 
                    className="bg-transparent text-xs text-white focus:outline-none w-full placeholder:text-slate-500"
                />

                {placeFilter && (
                    <button 
                        onClick={() => {
                            setPlaceFilter(null);
                            setSearchInputValue('');
                            setSuggestions([]);
                        }} 
                        className="text-slate-500 hover:text-white"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}

                {/* Suggestions Dropdown */}
                {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                        {suggestions.map((s, idx) => {
                            // Extract data from new AutocompleteSuggestion format
                            const pred = s.placePrediction;
                            if (!pred) return null;
                            const mainText = pred.mainText?.text;
                            const secText = pred.secondaryText?.text;
                            const pId = pred.placeId;
                            
                            return (
                                <button
                                    key={pId || idx}
                                    onClick={() => selectSuggestion(mainText, pId)}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-200 border-b border-slate-700/50 last:border-0 flex flex-col"
                                >
                                    <span className="font-medium">{mainText}</span>
                                    <span className="text-[10px] text-slate-500">{secText}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* All-Time Checkbox */}
            <label className={`flex items-center gap-2 text-xs font-medium whitespace-nowrap px-2 transition-opacity ${placeFilter ? 'opacity-100 cursor-pointer text-white' : 'opacity-40 cursor-not-allowed text-slate-500'}`}>
                <input 
                    type="checkbox" 
                    checked={searchAllTime}
                    onChange={(e) => setSearchAllTime(e.target.checked)}
                    disabled={!placeFilter}
                    className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-offset-0 focus:ring-1 focus:ring-indigo-500"
                />
                All-Time
            </label>

            {/* Date Picker */}
            <div className={`flex items-center gap-2 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50 transition-opacity ${searchAllTime && placeFilter ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-24 md:w-auto"
                />
                <span className="text-slate-500">-</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-24 md:w-auto"
                />
            </div>
            
            <button onClick={resetFilters} title="Reset All" className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
            </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between">
            <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 w-full md:w-auto">
                <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                >
                    <BarChart2 className="w-4 h-4" />
                    Overview
                </button>
                <button 
                    onClick={() => setActiveTab('analysis')}
                    className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                >
                    <MessageSquare className="w-4 h-4" />
                    Chat
                </button>
            </div>
            
            <button 
                onClick={() => setShowSettings(true)}
                className="hidden md:block p-2 text-slate-400 hover:text-white transition-colors hover:bg-slate-800 rounded-lg"
                title="Settings"
            >
                <Settings className="w-5 h-5" />
            </button>
            
            {googleMapsApiKey && (
                 <button 
                    onClick={enrichData}
                    disabled={isEnriching}
                    className="hidden md:flex items-center gap-2 text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                    title="Fetch real names for visited places"
                 >
                    <RefreshCw className={`w-4 h-4 ${isEnriching ? 'animate-spin' : ''}`} />
                    {isEnriching ? `Enriching... ${enrichmentProgress}%` : 'Enrich Data'}
                 </button>
            )}

            <button onClick={() => setData(null)} className="hidden md:block text-xs font-medium text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 hover:bg-slate-800 rounded-lg whitespace-nowrap">
                New Upload
            </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Key className="w-5 h-5 text-indigo-400" /> API Configuration
                    </h3>
                    <p className="text-slate-400 text-sm mb-4">
                        To enable rich map features (Satellite view, Photos, Place Details), enter your Google Maps API Key.
                        If left blank, the app uses standard maps.
                    </p>
                    <input 
                        type="password" 
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
                    />
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                        <button 
                            onClick={() => {
                                setGoogleMapsApiKey(tempApiKey);
                                setShowSettings(false);
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
      )}

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-[1920px] mx-auto w-full">
         {activeTab === 'dashboard' ? (
             <div className="flex flex-col gap-6 h-full animate-fade-in">
                 <StatsView stats={filteredStats} />
                 <div className="flex-1 min-h-[500px] border border-slate-700 rounded-xl overflow-hidden relative shadow-2xl bg-slate-900">
                    <MapView events={filteredEvents} googleMapsApiKey={googleMapsApiKey} />
                 </div>
             </div>
         ) : (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)] animate-fade-in">
                 <div className="lg:col-span-2 h-full flex flex-col gap-4">
                     <div className="flex-1 rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative bg-slate-900">
                         <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full border border-slate-700 text-xs text-slate-300">
                             {googleMapsApiKey ? 'Google Maps (Rich)' : 'OpenStreetMap (Standard)'} ({filteredEvents.length} events)
                         </div>
                         <MapView events={filteredEvents} googleMapsApiKey={googleMapsApiKey} />
                     </div>
                 </div>
                 <div className="h-full">
                    <ChatInterface 
                        stats={filteredStats} 
                        events={filteredEvents} 
                        onDateChange={handleDateUpdate} 
                        onPlaceFilter={handlePlaceFilterUpdate}
                    />
                 </div>
             </div>
         )}
      </main>
    </div>
  );
}
