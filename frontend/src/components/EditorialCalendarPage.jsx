import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Calendar, Trash2, Edit, ChevronLeft, ChevronRight, Megaphone, BarChart3, Target, Wallet, TrendingUp } from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PLATFORMS = [
  { value: 'all', label: 'Toutes', color: 'text-primary' },
  { value: 'facebook', label: 'Facebook', color: 'text-blue-500' },
  { value: 'instagram', label: 'Instagram', color: 'text-pink-500' },
  { value: 'tiktok', label: 'TikTok', color: 'text-cyan-400' },
  { value: 'youtube', label: 'YouTube', color: 'text-red-500' },
];
const EVENT_TYPES = [
  { value: 'commercial', label: 'Commercial', color: 'bg-blue-500/10 text-blue-500' },
  { value: 'promo', label: 'Promotion', color: 'bg-primary/10 text-primary' },
  { value: 'lancement', label: 'Lancement', color: 'bg-green-500/10 text-green-500' },
  { value: 'salon', label: 'Salon', color: 'bg-purple-500/10 text-purple-500' },
  { value: 'autre', label: 'Autre', color: 'bg-secondary text-muted-foreground' },
];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export function EditorialCalendarPage() {
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({ date: '', title: '', type: 'commercial', platform: 'all', content: '', status: 'draft' });
  const [newCampaign, setNewCampaign] = useState({ name: '', platform: 'facebook', start_date: '', end_date: '', budget_planned: '', budget_spent: '', status: 'planned', results: { reach: 0, clicks: 0, conversions: 0 } });

  useEffect(() => { fetchData(); }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2,'0')}`;
      const [evRes, campRes] = await Promise.all([
        axios.get(`${API_URL}/api/editorial/events?month=${month}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/campaigns`, { withCredentials: true })
      ]);
      setEvents(evRes.data);
      setCampaigns(campRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.date) { toast.error('Titre et date requis'); return; }
    try {
      if (editingEvent) {
        await axios.put(`${API_URL}/api/editorial/events/${editingEvent.id}`, newEvent, { withCredentials: true });
        toast.success('Événement mis à jour');
      } else {
        await axios.post(`${API_URL}/api/editorial/events`, newEvent, { withCredentials: true });
        toast.success('Événement créé');
      }
      setShowNewEvent(false); setEditingEvent(null);
      setNewEvent({ date: '', title: '', type: 'commercial', platform: 'all', content: '', status: 'draft' });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteEvent = async (id) => {
    try { await axios.delete(`${API_URL}/api/editorial/events/${id}`, { withCredentials: true }); toast.success('Supprimé'); fetchData(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const saveCampaign = async () => {
    if (!newCampaign.name) { toast.error('Nom requis'); return; }
    try {
      await axios.post(`${API_URL}/api/campaigns`, { ...newCampaign, budget_planned: parseFloat(newCampaign.budget_planned)||0, budget_spent: parseFloat(newCampaign.budget_spent)||0 }, { withCredentials: true });
      toast.success('Campagne créée');
      setShowNewCampaign(false);
      setNewCampaign({ name: '', platform: 'facebook', start_date: '', end_date: '', budget_planned: '', budget_spent: '', status: 'planned', results: { reach: 0, clicks: 0, conversions: 0 } });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const updateCampaign = async (id, data) => {
    try { await axios.put(`${API_URL}/api/campaigns/${id}`, data, { withCredentials: true }); toast.success('Campagne mise à jour'); fetchData(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteCampaign = async (id) => {
    try { await axios.delete(`${API_URL}/api/campaigns/${id}`, { withCredentials: true }); toast.success('Supprimée'); fetchData(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1));
  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n||0);
  const getTypeInfo = (t) => EVENT_TYPES.find(e => e.value === t) || EVENT_TYPES[4];
  const getPlatLabel = (v) => PLATFORMS.find(p => p.value === v)?.label || v;

  // Calendar grid
  const year = currentMonth.getFullYear(); const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month+1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const calDays = [];
  for (let i = 0; i < startOffset; i++) calDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d);

  const getEventsForDay = (day) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.date === dateStr);
  };

  // Campaign chart data
  const chartData = campaigns.map(c => ({ name: c.name.slice(0,20), Prévu: c.budget_planned||0, Dépensé: c.budget_spent||0 }));

  const totalPlanned = campaigns.reduce((s,c) => s+(c.budget_planned||0), 0);
  const totalSpent = campaigns.reduce((s,c) => s+(c.budget_spent||0), 0);
  const totalReach = campaigns.reduce((s,c) => s+(c.results?.reach||0), 0);
  const totalClicks = campaigns.reduce((s,c) => s+(c.results?.clicks||0), 0);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="editorial-calendar-page">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">Marketing</h1><p className="text-muted-foreground mt-1">Calendrier éditorial, campagnes et budgets</p></div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="calendar"><Calendar className="w-4 h-4 mr-1" />Calendrier</TabsTrigger>
          <TabsTrigger value="campaigns"><Megaphone className="w-4 h-4 mr-1" />Campagnes</TabsTrigger>
          <TabsTrigger value="budget"><Wallet className="w-4 h-4 mr-1" />Budgets</TabsTrigger>
        </TabsList>

        {/* CALENDAR TAB */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
              <h2 className="text-xl font-bold">{MONTHS[month]} {year}</h2>
              <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
            </div>
            <Dialog open={showNewEvent} onOpenChange={(o) => { setShowNewEvent(o); if(!o) setEditingEvent(null); }}>
              <DialogTrigger asChild><Button className="btn-primary" data-testid="new-editorial-event"><Plus className="w-5 h-5 mr-2" />Nouveau post</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingEvent ? 'Modifier' : 'Créer'} un événement éditorial</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Date *</Label><Input type="date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="bg-secondary" /></div>
                    <div className="space-y-2"><Label>Type</Label><Select value={newEvent.type} onValueChange={v => setNewEvent({...newEvent, type: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <div className="space-y-2"><Label>Titre *</Label><Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} className="bg-secondary" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Plateforme</Label><Select value={newEvent.platform} onValueChange={v => setNewEvent({...newEvent, platform: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Statut</Label><Select value={newEvent.status} onValueChange={v => setNewEvent({...newEvent, status: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Brouillon</SelectItem><SelectItem value="published">Publié</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="space-y-2"><Label>Contenu</Label><Textarea value={newEvent.content} onChange={e => setNewEvent({...newEvent, content: e.target.value})} className="bg-secondary min-h-24" placeholder="Contenu du post..." /></div>
                  <Button onClick={saveEvent} className="w-full btn-primary">{editingEvent ? 'Mettre à jour' : 'Créer'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-1">
                {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}
                {calDays.map((day, i) => {
                  const dayEvents = day ? getEventsForDay(day) : [];
                  const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                  return (
                    <div key={i} className={`min-h-24 p-1 rounded-lg border ${day ? 'border-border' : 'border-transparent'} ${isToday ? 'bg-primary/5 border-primary/30' : ''}`}>
                      {day && <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</p>}
                      {dayEvents.map(ev => {
                        const typeInfo = getTypeInfo(ev.type);
                        return (
                          <div key={ev.id} className={`text-xs p-1 rounded mb-0.5 cursor-pointer truncate ${typeInfo.color}`} onClick={() => { setEditingEvent(ev); setNewEvent({date:ev.date,title:ev.title,type:ev.type,platform:ev.platform,content:ev.content||'',status:ev.status||'draft'}); setShowNewEvent(true); }} title={ev.title}>
                            {ev.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Event list for current month */}
          <Card className="border-border"><CardHeader><CardTitle className="text-lg">Événements du mois</CardTitle></CardHeader>
            <CardContent>
              {events.length === 0 ? <p className="text-muted-foreground text-center py-4">Aucun événement ce mois</p> : (
                <div className="space-y-2">{events.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-muted-foreground">{ev.date?.slice(8)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getTypeInfo(ev.type).color}`}>{getTypeInfo(ev.type).label}</span>
                      <span className="font-medium">{ev.title}</span>
                      <span className="text-xs text-muted-foreground">{getPlatLabel(ev.platform)}</span>
                      {ev.status === 'published' && <Badge className="bg-green-500/10 text-green-500">Publié</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteEvent(ev.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAMPAIGNS TAB */}
        <TabsContent value="campaigns" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
              <DialogTrigger asChild><Button className="btn-primary"><Plus className="w-5 h-5 mr-2" />Nouvelle campagne</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Créer une campagne</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>Nom *</Label><Input value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} className="bg-secondary" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Plateforme</Label><Select value={newCampaign.platform} onValueChange={v => setNewCampaign({...newCampaign, platform: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{PLATFORMS.filter(p=>p.value!=='all').map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Statut</Label><Select value={newCampaign.status} onValueChange={v => setNewCampaign({...newCampaign, status: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned">Planifiée</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Terminée</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Date début</Label><Input type="date" value={newCampaign.start_date} onChange={e => setNewCampaign({...newCampaign, start_date: e.target.value})} className="bg-secondary" /></div>
                    <div className="space-y-2"><Label>Date fin</Label><Input type="date" value={newCampaign.end_date} onChange={e => setNewCampaign({...newCampaign, end_date: e.target.value})} className="bg-secondary" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Budget prévu (€)</Label><Input type="number" value={newCampaign.budget_planned} onChange={e => setNewCampaign({...newCampaign, budget_planned: e.target.value})} className="bg-secondary" /></div>
                    <div className="space-y-2"><Label>Budget dépensé (€)</Label><Input type="number" value={newCampaign.budget_spent} onChange={e => setNewCampaign({...newCampaign, budget_spent: e.target.value})} className="bg-secondary" /></div>
                  </div>
                  <Button onClick={saveCampaign} className="w-full btn-primary">Créer la campagne</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="stat-card"><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-primary">{campaigns.length}</p><p className="text-sm text-muted-foreground">Campagnes</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{fmt(totalPlanned)}</p><p className="text-sm text-muted-foreground">Budget prévu</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-amber-500">{fmt(totalSpent)}</p><p className="text-sm text-muted-foreground">Dépensé</p></CardContent></Card>
            <Card className="stat-card"><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-green-500">{totalReach.toLocaleString()}</p><p className="text-sm text-muted-foreground">Portée totale</p></CardContent></Card>
          </div>

          {/* Campaign cards */}
          {campaigns.map(c => (
            <Card key={c.id} className="border-border hover:border-primary/20 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg">{c.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${c.platform==='facebook'?'bg-blue-500/10 text-blue-500':c.platform==='instagram'?'bg-pink-500/10 text-pink-500':c.platform==='tiktok'?'bg-cyan-400/10 text-cyan-400':'bg-red-500/10 text-red-500'}`}>{getPlatLabel(c.platform)}</span>
                      <Badge className={c.status==='active'?'bg-green-500/10 text-green-500':c.status==='completed'?'bg-secondary text-muted-foreground':'bg-amber-500/10 text-amber-500'}>{c.status==='active'?'Active':c.status==='completed'?'Terminée':'Planifiée'}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{c.start_date} → {c.end_date}</p>
                    <div className="grid grid-cols-5 gap-4 mt-4">
                      <div><p className="text-xs text-muted-foreground">Budget prévu</p><p className="font-bold">{fmt(c.budget_planned)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Dépensé</p><p className="font-bold text-amber-500">{fmt(c.budget_spent)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Portée</p><p className="font-bold">{(c.results?.reach||0).toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Clics</p><p className="font-bold">{(c.results?.clicks||0).toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Conversions</p><p className="font-bold text-green-500">{c.results?.conversions||0}</p></div>
                    </div>
                    {/* Progress bar */}
                    {c.budget_planned > 0 && (
                      <div className="mt-3"><div className="w-full bg-secondary rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{width: `${Math.min(100, ((c.budget_spent||0)/(c.budget_planned))*100)}%`}} /></div>
                      <p className="text-xs text-muted-foreground mt-1">{((c.budget_spent||0)/c.budget_planned*100).toFixed(0)}% du budget</p></div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCampaign(c.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* BUDGET TAB */}
        <TabsContent value="budget" className="space-y-6 mt-4">
          <Card className="border-border"><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Budget prévu vs réel</CardTitle></CardHeader>
            <CardContent>{chartData.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucune campagne</p> : (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#27272A" /><XAxis dataKey="name" stroke="#71717A" tick={{fill:'#71717A',fontSize:12}} /><YAxis stroke="#71717A" tick={{fill:'#71717A'}} tickFormatter={v=>`${v}€`} /><Tooltip contentStyle={{backgroundColor:'#161618',border:'1px solid #27272A',borderRadius:'8px'}} /><Legend /><Bar dataKey="Prévu" fill="#FFBD11" radius={[4,4,0,0]} /><Bar dataKey="Dépensé" fill="#EF4444" radius={[4,4,0,0]} /></BarChart>
              </ResponsiveContainer></div>
            )}</CardContent>
          </Card>

          {/* Annual budget overview */}
          <Card className="border-border"><CardHeader><CardTitle>Vue annuelle {year}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                {MONTHS.map((m, i) => {
                  const monthCamps = campaigns.filter(c => {
                    const start = new Date(c.start_date);
                    return start.getMonth() === i && start.getFullYear() === year;
                  });
                  const monthBudget = monthCamps.reduce((s,c) => s+(c.budget_planned||0), 0);
                  const monthSpent = monthCamps.reduce((s,c) => s+(c.budget_spent||0), 0);
                  return (
                    <div key={i} className={`p-2 rounded-lg text-center ${i === new Date().getMonth() ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50'}`}>
                      <p className="text-xs font-medium">{m.slice(0,3)}</p>
                      <p className="text-sm font-bold mt-1">{monthBudget > 0 ? fmt(monthBudget) : '-'}</p>
                      {monthSpent > 0 && <p className="text-xs text-amber-500">{fmt(monthSpent)}</p>}
                      <p className="text-xs text-muted-foreground">{monthCamps.length} camp.</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EditorialCalendarPage;
