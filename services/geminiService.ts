
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { DashboardStats, ProcessedEvent } from "../types";

const getAiClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateTimelineInsights = async (stats: DashboardStats) => {
  const ai = getAiClient();
  
  const prompt = `
    Analyze the following travel history summary and provide 3 interesting, distinct, and personalized insights.
    Focus on travel patterns, implied lifestyle, or magnitude of travel.
    
    Data:
    - Total Distance: ${stats.totalDistanceKm} km
    - Total Visits: ${stats.totalVisits}
    - Unique Places: ${stats.uniquePlaces}
    - Top Cities/Areas: ${stats.topCities.map(c => c.name).join(', ')}
    - Date Range: ${stats.dateRange.start.toDateString()} to ${stats.dateRange.end.toDateString()}
    - Transport Modes: ${stats.activityBreakdown.map(a => `${a.name} (${a.value})`).join(', ')}

    Return the response as a JSON array of strings. 
    Example: ["You travel extensively on weekends...", "Your preferred mode of transport is..."]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        }
      }
    });
    
    // Safely extract text
    const candidate = response.candidates?.[0];
    let text = "";
    if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
            if (part.text) text += part.text;
        }
    }
    
    return JSON.parse(text || "[]") as string[];
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return ["Could not generate insights at this time.", "Check your API Key.", "Ensure your timeline data is valid."];
  }
};

const setDateFilterTool: FunctionDeclaration = {
    name: 'setDateFilter',
    description: 'Update the dashboard date filter range. Use this when the user asks to see data for a specific time period (e.g., "last week", "January 2024"). Dates must be YYYY-MM-DD.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            start: {
                type: Type.STRING,
                description: 'The start date of the filter in YYYY-MM-DD format.'
            },
            end: {
                type: Type.STRING,
                description: 'The end date of the filter in YYYY-MM-DD format.'
            }
        },
        required: ['start', 'end']
    }
};

const setPlaceFilterTool: FunctionDeclaration = {
    name: 'setPlaceFilter',
    description: 'Filter the dashboard to show visits to a specific place. Use this when the user asks to see visits to a specific location (e.g., "Show me visits to Gym", "Search for Starbucks").',
    parameters: {
        type: Type.OBJECT,
        properties: {
            place: {
                type: Type.STRING,
                description: 'The name or keyword of the place to search for.'
            },
            allTime: {
                type: Type.BOOLEAN,
                description: 'Whether to search the entire history (true) or restrict to the current date filter (false). Default to false unless user says "all time", "ever", or "history".'
            }
        },
        required: ['place']
    }
};

interface ChatResponse {
    text: string;
    filterUpdate?: { start: string; end: string };
    placeFilterUpdate?: { query: string; allTime: boolean };
}

export const chatWithTimeline = async (
  query: string, 
  stats: DashboardStats, 
  filteredEvents: ProcessedEvent[],
  disableTools: boolean = false
): Promise<ChatResponse> => {
    const ai = getAiClient();

    // Generate a chronological log of visits for the selected date range
    const visitLog = filteredEvents
        .filter(e => e.type === 'VISIT')
        .slice(0, 2000)
        .map(e => {
            const dateStr = e.startTime.toLocaleDateString();
            const timeStr = e.startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return `- ${dateStr} ${timeStr}: ${e.title} (${e.city || 'Unknown City'})`;
        })
        .join('\n');

    const tools = disableTools ? undefined : [{ functionDeclarations: [setDateFilterTool, setPlaceFilterTool] }];

    const context = `
      You are an intelligent travel assistant analyzing a user's location history file.
      
      Current Date context: Today is ${new Date().toDateString()}.
      
      User Stats (Current View):
      - Total Distance: ${stats.totalDistanceKm} km
      - Top Cities: ${stats.topCities.map(c => c.name).join(', ')}
      - Period: ${stats.dateRange.start.toLocaleDateString()} - ${stats.dateRange.end.toLocaleDateString()}
      - Total Visited Places in view: ${filteredEvents.filter(e => e.type === 'VISIT').length}
      
      Detailed Visit Log (Chronological):
      ${visitLog}
      
      User Query: "${query}"
      
      Instructions:
      1. Answer the user based on the stats and the Detailed Visit Log.
      ${!disableTools ? `
      2. If the user asks to change the time range (e.g., "Show me last month", "Filter for 2023"), CALL the 'setDateFilter' tool.
      3. If the user asks to find a specific place (e.g., "Show me visits to Costco", "Have I been to Paris?"), CALL the 'setPlaceFilter' tool.
      4. If calling a tool, keep your text response brief (e.g., "Sure, filtering for...").` : 
      `2. The data has already been filtered based on the user's request. Provide a direct answer summarizing the visible data in the Visit Log. Do not mention that you are filtering again.`}
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: context,
            config: {
                tools: tools
            }
        });

        const candidate = response.candidates?.[0];
        let text = "";
        let filterUpdate = undefined;
        let placeFilterUpdate = undefined;

        // Manually parse parts to avoid getters throwing warnings on function calls
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.text) {
                    text += part.text;
                }
                if (part.functionCall) {
                    const args = part.functionCall.args as any;
                    
                    if (part.functionCall.name === 'setDateFilter') {
                        if (args.start && args.end) {
                            filterUpdate = { start: args.start, end: args.end };
                            if (!text) text = `Filtering data from ${args.start} to ${args.end}...`;
                        }
                    } else if (part.functionCall.name === 'setPlaceFilter') {
                        if (args.place) {
                            placeFilterUpdate = { query: args.place, allTime: !!args.allTime };
                            if (!text) text = `Searching for "${args.place}"...`;
                        }
                    }
                }
            }
        }

        return { text, filterUpdate, placeFilterUpdate };

    } catch (error) {
        console.error("Chat Error:", error);
        return { text: "Sorry, I encountered an error communicating with the AI." };
    }
};
