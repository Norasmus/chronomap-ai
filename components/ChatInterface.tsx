
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, Loader2, Calendar, MapPin } from 'lucide-react';
import { generateTimelineInsights, chatWithTimeline } from '../services/geminiService';
import { DashboardStats, ProcessedEvent } from '../types';

interface ChatInterfaceProps {
    stats: DashboardStats;
    events: ProcessedEvent[];
    allEvents: ProcessedEvent[];  // Full dataset for historical queries
    onDateChange: (start: string, end: string) => void;
    onPlaceFilter: (query: string, allTime: boolean) => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isInsight?: boolean;
    isSystemAction?: boolean;
    actionIcon?: React.ElementType;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ stats, events, allEvents, onDateChange, onPlaceFilter }) => {
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'assistant', content: "Hello! I've analyzed your complete timeline history. Ask me about your travel patterns, visit counts, or ask me to filter the view to a specific date range." }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // State to track if we need to re-ask the AI after a filter update
    const [pendingFollowUpQuery, setPendingFollowUpQuery] = useState<string | null>(null);
    
    // Ref to prevent race conditions or double execution of the follow-up
    const isFetchingFollowUp = useRef(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const eventsRef = useRef(events);
    const allEventsRef = useRef(allEvents);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);
    
    useEffect(() => {
        allEventsRef.current = allEvents;
    }, [allEvents]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Effect to handle follow-up generation after events update
    useEffect(() => {
        // execute only if there is a pending query AND we aren't already fetching it
        if (pendingFollowUpQuery && !isFetchingFollowUp.current) {
             const executeFollowUp = async () => {
                 isFetchingFollowUp.current = true;
                 setIsLoading(true);
                 try {
                     // Pass disableTools=true to prevent loops
                     const response = await chatWithTimeline(pendingFollowUpQuery, stats, events, true);
                     if (response.text) {
                         setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: response.text }]);
                     }
                 } catch (e) {
                     console.error("Follow up error", e);
                     setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "I updated the filter, but couldn't analyze the new data." }]);
                 } finally {
                     setIsLoading(false);
                     setPendingFollowUpQuery(null);
                     isFetchingFollowUp.current = false;
                 }
             };
             
             // Debounce slightly to ensure state propagation
             const timer = setTimeout(executeFollowUp, 150);
             return () => clearTimeout(timer);
        }
    }, [events, pendingFollowUpQuery]); 

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        
        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            // Use ALL events for queries so historical questions can be answered
            const response = await chatWithTimeline(userMsg, stats, allEvents);
            
            let hasToolCall = false;

            // Handle Date Filter Tool Call
            if (response.filterUpdate) {
                hasToolCall = true;
                onDateChange(response.filterUpdate.start, response.filterUpdate.end);
                setMessages(prev => [
                    ...prev, 
                    { 
                        id: (Date.now()).toString() + '_action_date', 
                        role: 'assistant', 
                        content: `Changed date filter: ${response.filterUpdate?.start} to ${response.filterUpdate?.end}`, 
                        isSystemAction: true,
                        actionIcon: Calendar
                    }
                ]);
            }

            // Handle Place Filter Tool Call
            if (response.placeFilterUpdate) {
                hasToolCall = true;
                onPlaceFilter(response.placeFilterUpdate.query, response.placeFilterUpdate.allTime);
                setMessages(prev => [
                    ...prev, 
                    { 
                        id: (Date.now()).toString() + '_action_place', 
                        role: 'assistant', 
                        content: `Filtered for place: "${response.placeFilterUpdate?.query}" ${response.placeFilterUpdate?.allTime ? '(All Time)' : ''}`, 
                        isSystemAction: true,
                        actionIcon: MapPin
                    }
                ]);
            }

            if (response.text) {
                setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text }]);
            }

            if (hasToolCall) {
                // Set pending follow up. 
                // We keep isLoading TRUE so the user sees spinner while App updates state and we re-fetch.
                setPendingFollowUpQuery(userMsg);
            } else {
                setIsLoading(false);
            }

        } catch (e) {
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: "Sorry, I encountered an error. Please try again." }]);
            setIsLoading(false);
        }
    };

    const handleGenerateInsights = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const insights = await generateTimelineInsights(stats);
            const formatted = `Here are some insights based on your history:\n\n${insights.map(i => `- ${i}`).join('\n')}`;
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: formatted, isInsight: true }]);
        } catch (e) {
             setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Could not generate insights at this time." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center shrink-0">
                <h2 className="font-semibold text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-400" />
                    AI Assistant
                </h2>
                <button 
                    onClick={handleGenerateInsights}
                    disabled={isLoading}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                    <Sparkles className="w-3 h-3" />
                    Generate Insights
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((m) => {
                    if (m.isSystemAction) {
                        const Icon = m.actionIcon || Calendar;
                        return (
                            <div key={m.id} className="flex justify-center my-2">
                                <div className="bg-slate-800/50 border border-slate-700 rounded-full px-3 py-1 flex items-center gap-2 text-xs text-slate-400">
                                    <Icon className="w-3 h-3" />
                                    {m.content}
                                </div>
                            </div>
                        )
                    }
                    return (
                        <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                                {m.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-emerald-400" />}
                            </div>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                                m.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                            }`}>
                                {m.content}
                            </div>
                        </div>
                    );
                })}
                {isLoading && (
                    <div className="flex gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="bg-slate-800 rounded-2xl rounded-tl-none px-4 py-3 border border-slate-700">
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-slate-800/30 border-t border-slate-800 shrink-0">
                <div className="flex gap-2 relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Search or ask: 'Show me visits to Costco'..."
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
