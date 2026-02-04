import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend 
} from 'recharts';
import { DashboardStats } from '../types';
import { MapPin, Navigation, Calendar, Globe, Activity } from 'lucide-react';

interface StatsViewProps {
  stats: DashboardStats;
}

const StatsView: React.FC<StatsViewProps> = ({ stats }) => {
  const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-96">
        {/* Top Cities Chart */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            Top Destinations
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.topCities} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#94a3b8', fontSize: 12 }} />
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