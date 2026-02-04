import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend 
} from 'recharts';
import { DashboardStats } from '../types';
import { MapPin, Navigation, Calendar, Globe, Activity, Tag, Star, Home, Briefcase } from 'lucide-react';

interface StatsViewProps {
  stats: DashboardStats;
}

const StatsView: React.FC<StatsViewProps> = ({ stats }) => {
  const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];
  
  // Convert placeVisitCounts to sorted array for top places chart
  const topPlaces = Object.entries(stats.placeVisitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Navigation className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase">Total Distance</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.totalDistanceKm.toLocaleString()} <span className="text-sm text-slate-500">km</span>
          </div>
        </div>
        
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <MapPin className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase">Visits</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.totalVisits.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Globe className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase">Unique Places</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.uniquePlaces.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 mb-2 text-slate-400">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase">Days Logged</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {Math.ceil((stats.dateRange.end.getTime() - stats.dateRange.start.getTime()) / (1000 * 3600 * 24))}
          </div>
        </div>
      </div>

      {/* Home & Work Stats */}
      {(stats.homeStats || stats.workStats) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.homeStats && (
            <div className="bg-gradient-to-br from-emerald-900/50 to-slate-800 p-5 rounded-xl border border-emerald-700/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                  <Home className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Home</h4>
                  <p className="text-xs text-slate-400 truncate max-w-[250px]" title={stats.homeStats.address}>
                    {stats.homeStats.address || 'Address not available'}
                  </p>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{stats.homeStats.hours.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">hours</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.homeStats.visits.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">visits</div>
                </div>
              </div>
            </div>
          )}
          
          {stats.workStats && (
            <div className="bg-gradient-to-br from-blue-900/50 to-slate-800 p-5 rounded-xl border border-blue-700/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Work</h4>
                  <p className="text-xs text-slate-400 truncate max-w-[250px]" title={stats.workStats.address}>
                    {stats.workStats.address || 'Address not available'}
                  </p>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stats.workStats.hours.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">hours</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.workStats.visits.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">visits</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Cities Chart */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            Top Cities
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.topCities} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]}>
                    {stats.topCities.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Places Chart */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Top Places Visited
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topPlaces} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="count" fill="#eab308" radius={[0, 4, 4, 0]}>
                    {topPlaces.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Visits by Type Chart */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-cyan-400" />
            Visits by Type
          </h3>
          <div className="flex-1 w-full">
            {stats.typeBreakdown && stats.typeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.typeBreakdown} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                    cursor={{ fill: '#334155', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                      {stats.typeBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Run "Enrich All" to see place types
              </div>
            )}
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
             <Activity className="w-4 h-4 text-pink-400" />
             Activity Breakdown
          </h3>
          <div className="flex-1 w-full">
             <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                    <Pie
                        data={stats.activityBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {stats.activityBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                    />
                    <Legend iconType="circle" />
                </PieChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;