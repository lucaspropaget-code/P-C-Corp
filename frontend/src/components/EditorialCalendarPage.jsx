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
import { Switch } from './ui/switch';
import { Plus, Calendar, Trash2, ChevronLeft, ChevronRight, Megaphone, BarChart3, Wallet, X, Edit } from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const NETWORKS = [
  { key: 'facebook', label: 'Facebook', color: '#3B82F6' },
  { key: 'instagram', label: 'Instagram', color: '#EC4899' },
  { key: 'tiktok', label: 'TikTok', color: '#22D3EE' },
  { key: 'youtube', label: 'YouTube', color: '#EF4444' },
];
const CONTENT_TYPES = ['photo','video','carousel','story','reel'];
const OBJECTIVES = [
  { value: 'notoriete', label: 'Notoriété' },
  { value: 'trafic', label: 'Trafic' },
  { value: 'ventes', label: 'Ventes' },
  { value: 'fidelisation', label: 'Fidélisation' },
];
const STATUS_LIST = [
  { value: 'planned', label: 'Planifiée', color: 'bg-amber-500/10 text-amber-500' },
  { value: 'active', label: 'Active', color: 'bg-green-500/10 text-green-500' },
  { value: 'paused', label: 'En pause', color: 'bg-secondary text-muted-foreground' },
  { value: 'completed', label: 'Terminée', color: 'bg-blue-500/10 text-blue-500' },
];
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const EVENT_TYPES = [
  { value: 'commercial', label: 'Commercial', color: 'bg-blue-500/10 text-blue-500' },
  { value: 'promo', label: 'Promotion', color: 'bg-primary/10 text-primary' },
  { value: 'lancement', label: 'Lancement', color: 'bg-green-500/10 text-green-500' },
  { value: 'salon', label: 'Salon', color: 'bg-purple-500/10 text-purple-500' },
  { value: 'autre', label: 'Autre', color: 'bg-secondary text-muted-foreground' },
];
const PLATFORMS_EDIT = [
  { value: 'all', label: 'Toutes' },{ value: 'facebook', label: 'Facebook' },{ value: 'instagram', label: 'Instagram' },{ value: 'tiktok', label: 'TikTok' },{ value: 'youtube', label: 'YouTube' },
];

const emptyNetwork = () => ({ enabled: false, budget_planned: 0, budget_spent: 0, content_type: 'photo', results: { reach: 0, clicks: 0, impressions: 0 } });

export function EditorialCalendarPage() {
  const [events, setEvents] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({ date: '', title: '', type: 'commercial', platform: 'all', content: '', status: 'draft' });
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '', status: 'planned', objective: 'notoriete', start_date: '', end_date: '', notes: '', color: '#FFBD11',
    networks: { facebook: emptyNetwork(), instagram: emptyNetwork(), tiktok: emptyNetwork(), youtube: emptyNetwork() }
  });

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
      if (editingEvent) { await axios.put(`${API_URL}/api/editorial/events/${editingEvent.id}`, newEvent, { withCredentials: true }); }
      else { await axios.post(`${API_URL}/api/editorial/events`, newEvent, { withCredentials: true }); }
      toast.success(editingEvent ? 'Mis à jour' : 'Créé');
      setShowNewEvent(false); setEditingEvent(null);
      setNewEvent({ date: '', title: '', type: 'commercial', platform: 'all', content: '', status: 'draft' });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteEvent = async (id, e) => {
    e?.stopPropagation();
    try { await axios.delete(`${API_URL}/api/editorial/events/${id}`, { withCredentials: true }); fetchData(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const saveCampaign = async () => {
    if (!newCampaign.name) { toast.error('Nom requis'); return; }
    try {
      if (selectedCampaign) {
        await axios.put(`${API_URL}/api/campaigns/${selectedCampaign.id}`, newCampaign, { withCredentials: true });
        toast.success('Campagne mise à jour');
        setSelectedCampaign(null);
      } else {
        await axios.post(`${API_URL}/api/campaigns`, newCampaign, { withCredentials: true });
        toast.success('Campagne créée');
      }
      setShowNewCampaign(false);
      setNewCampaign({ name: '', status: 'planned', objective: 'notoriete', start_date: '', end_date: '', notes: '', color: '#FFBD11', networks: { facebook: emptyNetwork(), instagram: emptyNetwork(), tiktok: emptyNetwork(), youtube: emptyNetwork() } });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const openCampaignDetail = (c) => {
    setSelectedCampaign(c);
    setNewCampaign({
      name: c.name, status: c.status, objective: c.objective||'notoriete', start_date: c.start_date||'', end_date: c.end_date||'', notes: c.notes||'', color: c.color||'#FFBD11',
      networks: { facebook: c.networks?.facebook || emptyNetwork(), instagram: c.networks?.instagram || emptyNetwork(), tiktok: c.networks?.tiktok || emptyNetwork(), youtube: c.networks?.youtube || emptyNetwork() }
    });
    setShowNewCampaign(true);
  };

  const deleteCampaign = async (id) => {
    try { await axios.delete(`${API_URL}/api/campaigns/${id}`, { withCredentials: true }); toast.success('Supprimée'); fetchData(); setShowNewCampaign(false); setSelectedCampaign(null); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const updateNetworkField = (network, field, value) => {
    setNewCampaign(prev => ({
      ...prev, networks: { ...prev.networks, [network]: { ...prev.networks[network], [field]: value } }
    }));
  };
  const updateNetworkResult = (network, field, value) => {
    setNewCampaign(prev => ({
      ...prev, networks: { ...prev.networks, [network]: { ...prev.networks[network], results: { ...prev.networks[network].results, [field]: parseInt(value)||0 } } }
    }));
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1));
  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n||0);
  const getTypeInfo = (t) => EVENT_TYPES.find(e => e.value === t) || EVENT_TYPES[4];

  const year = currentMonth.getFullYear(); const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month+1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const calDays = []; for (let i = 0; i < startOffset; i++) calDays.push(null); for (let d = 1; d <= daysInMonth; d++) calDays.push(d);

  const getEventsForDay = (day) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.date === dateStr);
  };

  // Campaigns that span the current day
  const getCampaignsForDay = (day) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return campaigns.filter(c => c.start_date <= dateStr && c.end_date >= dateStr);
  };

  // Totals
  const getTotals = (c) => {
    const nets = c.networks || {};
    let bp=0, bs=0, reach=0, clicks=0, imp=0;
    Object.values(nets).forEach(n => { if(n.enabled) { bp+=n.budget_planned||0; bs+=n.budget_spent||0; reach+=n.results?.reach||0; clicks+=n.results?.clicks||0; imp+=n.results?.impressions||0; } });
    return { bp, bs, reach, clicks, imp };
  };

  const allTotals = campaigns.reduce((acc,c) => { const t = getTotals(c); return { bp: acc.bp+t.bp, bs: acc.bs+t.bs, reach: acc.reach+t.reach, clicks: acc.clicks+t.clicks }; }, {bp:0,bs:0,reach:0,clicks:0});

  // Chart data
  const chartData = campaigns.map(c => { const t = getTotals(c); return { name: c.name.slice(0,18), Prévu: t.bp, Dépensé: t.bs }; });

  // Per-network comparison
  const networkChart = NETWORKS.map(net => {
    let bp=0, bs=0;
    campaigns.forEach(c => { const n = c.networks?.[net.key]; if(n?.enabled) { bp+=n.budget_planned||0; bs+=n.budget_spent||0; } });
    return { name: net.label, Prévu: bp, Dépensé: bs };
  }).filter(d => d.Prévu > 0 || d.Dépensé > 0);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="editorial-calendar-page">
      <div className="flex justify-between items-center"><div><h1 className="text-3xl font-bold">Marketing</h1><p className="text-muted-foreground mt-1">Calendrier éditorial, campagnes et budgets</p></div></div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary"><TabsTrigger value="calendar"><Calendar className="w-4 h-4 mr-1" />Calendrier</TabsTrigger><TabsTrigger value="campaigns"><Megaphone className="w-4 h-4 mr-1" />Campagnes</TabsTrigger><TabsTrigger value="budget"><Wallet className="w-4 h-4 mr-1" />Budgets</TabsTrigger></TabsList>

        {/* CALENDAR */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4"><Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button><h2 className="text-xl font-bold">{MONTHS[month]} {year}</h2><Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button></div>
            <Dialog open={showNewEvent && !selectedCampaign} onOpenChange={(o) => { if(!selectedCampaign) { setShowNewEvent(o); if(!o) setEditingEvent(null); } }}>
              <DialogTrigger asChild><Button className="btn-primary"><Plus className="w-5 h-5 mr-2" />Nouveau post</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingEvent ? 'Modifier' : 'Créer'} un événement</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Date *</Label><Input type="date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="bg-secondary" /></div>
                    <div className="space-y-2"><Label>Type</Label><Select value={newEvent.type} onValueChange={v => setNewEvent({...newEvent, type: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <div className="space-y-2"><Label>Titre *</Label><Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} className="bg-secondary" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Plateforme</Label><Select value={newEvent.platform} onValueChange={v => setNewEvent({...newEvent, platform: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{PLATFORMS_EDIT.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Statut</Label><Select value={newEvent.status} onValueChange={v => setNewEvent({...newEvent, status: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Brouillon</SelectItem><SelectItem value="published">Publié</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="space-y-2"><Label>Contenu</Label><Textarea value={newEvent.content} onChange={e => setNewEvent({...newEvent, content: e.target.value})} className="bg-secondary min-h-20" /></div>
                  <Button onClick={saveEvent} className="w-full btn-primary">{editingEvent ? 'Mettre à jour' : 'Créer'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-border"><CardContent className="p-3">
            <div className="grid grid-cols-7 gap-1">
              {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
              {calDays.map((day, i) => {
                const dayEvents = day ? getEventsForDay(day) : [];
                const dayCampaigns = day ? getCampaignsForDay(day) : [];
                const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                return (
                  <div key={i} className={`min-h-20 p-1 rounded-lg border ${day ? 'border-border' : 'border-transparent'} ${isToday ? 'bg-primary/5 border-primary/30' : ''}`}>
                    {day && <p className={`text-xs font-medium mb-0.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</p>}
                    {dayCampaigns.map(c => {
                      const isStart = c.start_date === `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      return <div key={`c-${c.id}`} className="text-xs px-1 py-0.5 rounded cursor-pointer mb-0.5 truncate font-medium" style={{backgroundColor: (c.color||'#FFBD11')+'30', color: c.color||'#FFBD11', borderLeft: isStart ? `3px solid ${c.color||'#FFBD11'}` : 'none'}} onClick={() => openCampaignDetail(c)}>{isStart ? c.name : ''}</div>;
                    })}
                    {dayEvents.map(ev => (
                      <div key={ev.id} className={`text-xs p-0.5 rounded cursor-pointer truncate ${getTypeInfo(ev.type).color}`} onClick={() => { setEditingEvent(ev); setNewEvent({date:ev.date,title:ev.title,type:ev.type,platform:ev.platform,content:ev.content||'',status:ev.status||'draft'}); setShowNewEvent(true); }}>{ev.title}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* CAMPAIGNS */}
        <TabsContent value="campaigns" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <div className="grid grid-cols-4 gap-4 flex-1 mr-4">
              <Card className="stat-card"><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-primary">{campaigns.length}</p><p className="text-xs text-muted-foreground">Campagnes</p></CardContent></Card>
              <Card className="stat-card"><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{fmt(allTotals.bp)}</p><p className="text-xs text-muted-foreground">Budget prévu</p></CardContent></Card>
              <Card className="stat-card"><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-500">{fmt(allTotals.bs)}</p><p className="text-xs text-muted-foreground">Dépensé</p></CardContent></Card>
              <Card className="stat-card"><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-green-500">{allTotals.reach.toLocaleString()}</p><p className="text-xs text-muted-foreground">Portée</p></CardContent></Card>
            </div>
            <Button className="btn-primary" onClick={() => { setSelectedCampaign(null); setNewCampaign({name:'',status:'planned',objective:'notoriete',start_date:'',end_date:'',notes:'',color:'#FFBD11',networks:{facebook:emptyNetwork(),instagram:emptyNetwork(),tiktok:emptyNetwork(),youtube:emptyNetwork()}}); setShowNewCampaign(true); }}><Plus className="w-5 h-5 mr-2" />Nouvelle campagne</Button>
          </div>

          {campaigns.map(c => {
            const t = getTotals(c);
            const statusInfo = STATUS_LIST.find(s => s.value === c.status) || STATUS_LIST[0];
            const activeNets = NETWORKS.filter(n => c.networks?.[n.key]?.enabled);
            return (
              <Card key={c.id} className="border-border hover:border-primary/20 transition-all cursor-pointer" onClick={() => openCampaignDetail(c)}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: c.color||'#FFBD11'}} />
                        <h3 className="font-bold text-lg">{c.name}</h3>
                        <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                        <Badge variant="secondary">{OBJECTIVES.find(o=>o.value===c.objective)?.label||c.objective}</Badge>
                        {activeNets.map(n => <span key={n.key} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{backgroundColor: n.color+'20', color: n.color}}>{n.label}</span>)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{c.start_date} → {c.end_date}</p>
                      <div className="grid grid-cols-4 gap-6">
                        <div><p className="text-xs text-muted-foreground">Budget prévu</p><p className="font-bold">{fmt(t.bp)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Dépensé</p><p className="font-bold text-amber-500">{fmt(t.bs)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Portée</p><p className="font-bold">{t.reach.toLocaleString()}</p></div>
                        <div><p className="text-xs text-muted-foreground">Clics</p><p className="font-bold">{t.clicks.toLocaleString()}</p></div>
                      </div>
                      {t.bp > 0 && <div className="mt-3"><div className="w-full bg-secondary rounded-full h-2"><div className="h-2 rounded-full" style={{width:`${Math.min(100,t.bs/t.bp*100)}%`, backgroundColor: c.color||'#FFBD11'}} /></div><p className="text-xs text-muted-foreground mt-1">{(t.bs/t.bp*100).toFixed(0)}% du budget</p></div>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* BUDGET */}
        <TabsContent value="budget" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border"><CardHeader><CardTitle className="text-lg">Budget prévu vs réel par campagne</CardTitle></CardHeader><CardContent>{chartData.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucune campagne</p> : <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#27272A" /><XAxis dataKey="name" stroke="#71717A" tick={{fill:'#71717A',fontSize:11}} /><YAxis stroke="#71717A" tick={{fill:'#71717A'}} tickFormatter={v=>`${v}€`} /><Tooltip contentStyle={{backgroundColor:'#161618',border:'1px solid #27272A',borderRadius:'8px'}} /><Legend /><Bar dataKey="Prévu" fill="#FFBD11" radius={[4,4,0,0]} /><Bar dataKey="Dépensé" fill="#EF4444" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>}</CardContent></Card>
            <Card className="border-border"><CardHeader><CardTitle className="text-lg">Coût par réseau</CardTitle></CardHeader><CardContent>{networkChart.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucune donnée</p> : <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={networkChart}><CartesianGrid strokeDasharray="3 3" stroke="#27272A" /><XAxis dataKey="name" stroke="#71717A" tick={{fill:'#71717A'}} /><YAxis stroke="#71717A" tick={{fill:'#71717A'}} tickFormatter={v=>`${v}€`} /><Tooltip contentStyle={{backgroundColor:'#161618',border:'1px solid #27272A',borderRadius:'8px'}} /><Legend /><Bar dataKey="Prévu" fill="#FFBD11" radius={[4,4,0,0]} /><Bar dataKey="Dépensé" fill="#EF4444" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>}</CardContent></Card>
          </div>
          <Card className="border-border"><CardHeader><CardTitle>Vue annuelle {year}</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">{MONTHS.map((m, i) => {
              const mc = campaigns.filter(c => { const s = new Date(c.start_date); return s.getMonth() === i && s.getFullYear() === year; });
              const mb = mc.reduce((s,c) => s+getTotals(c).bp, 0);
              const ms = mc.reduce((s,c) => s+getTotals(c).bs, 0);
              return <div key={i} className={`p-2 rounded-lg text-center ${i===new Date().getMonth()?'bg-primary/10 border border-primary/30':'bg-secondary/50'}`}><p className="text-xs font-medium">{m.slice(0,3)}</p><p className="text-sm font-bold mt-1">{mb>0?fmt(mb):'-'}</p>{ms>0&&<p className="text-xs text-amber-500">{fmt(ms)}</p>}<p className="text-xs text-muted-foreground">{mc.length}c</p></div>;
            })}</div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Campaign Detail Dialog */}
      <Dialog open={showNewCampaign} onOpenChange={(o) => { setShowNewCampaign(o); if(!o) setSelectedCampaign(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedCampaign ? 'Fiche campagne' : 'Nouvelle campagne'}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            {/* General info */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase">Infos générales</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nom *</Label><Input value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} className="bg-secondary" /></div>
                <div className="space-y-2"><Label>Couleur</Label><div className="flex gap-2 items-center"><Input type="color" value={newCampaign.color} onChange={e => setNewCampaign({...newCampaign, color: e.target.value})} className="bg-secondary w-14 h-10 p-1 cursor-pointer" /><span className="text-sm text-muted-foreground">{newCampaign.color}</span></div></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Statut</Label><Select value={newCampaign.status} onValueChange={v => setNewCampaign({...newCampaign, status: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{STATUS_LIST.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Objectif</Label><Select value={newCampaign.objective} onValueChange={v => setNewCampaign({...newCampaign, objective: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date début</Label><Input type="date" value={newCampaign.start_date} onChange={e => setNewCampaign({...newCampaign, start_date: e.target.value})} className="bg-secondary" /></div>
                <div className="space-y-2"><Label>Date fin</Label><Input type="date" value={newCampaign.end_date} onChange={e => setNewCampaign({...newCampaign, end_date: e.target.value})} className="bg-secondary" /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={newCampaign.notes} onChange={e => setNewCampaign({...newCampaign, notes: e.target.value})} className="bg-secondary min-h-16" placeholder="Brief, objectifs détaillés..." /></div>
            </div>

            {/* Per-network config */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase">Configuration par réseau</h4>
              {NETWORKS.map(net => {
                const netData = newCampaign.networks[net.key] || emptyNetwork();
                return (
                  <Card key={net.key} className={`border-border ${netData.enabled ? 'border-l-2' : 'opacity-60'}`} style={netData.enabled ? {borderLeftColor: net.color} : {}}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold" style={{color: net.color}}>{net.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{netData.enabled ? 'Activé' : 'Désactivé'}</span>
                          <Switch checked={netData.enabled} onCheckedChange={(v) => updateNetworkField(net.key, 'enabled', v)} />
                        </div>
                      </div>
                      {netData.enabled && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1"><Label className="text-xs">Budget prévu (€)</Label><Input type="number" value={netData.budget_planned} onChange={e => updateNetworkField(net.key, 'budget_planned', parseFloat(e.target.value)||0)} className="bg-secondary" /></div>
                            <div className="space-y-1"><Label className="text-xs">Budget dépensé (€)</Label><Input type="number" value={netData.budget_spent} onChange={e => updateNetworkField(net.key, 'budget_spent', parseFloat(e.target.value)||0)} className="bg-secondary" /></div>
                            <div className="space-y-1"><Label className="text-xs">Type contenu</Label><Select value={netData.content_type} onValueChange={v => updateNetworkField(net.key, 'content_type', v)}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{CONTENT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1"><Label className="text-xs">Portée</Label><Input type="number" value={netData.results?.reach||0} onChange={e => updateNetworkResult(net.key, 'reach', e.target.value)} className="bg-secondary" /></div>
                            <div className="space-y-1"><Label className="text-xs">Clics</Label><Input type="number" value={netData.results?.clicks||0} onChange={e => updateNetworkResult(net.key, 'clicks', e.target.value)} className="bg-secondary" /></div>
                            <div className="space-y-1"><Label className="text-xs">Impressions</Label><Input type="number" value={netData.results?.impressions||0} onChange={e => updateNetworkResult(net.key, 'impressions', e.target.value)} className="bg-secondary" /></div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button onClick={saveCampaign} className="flex-1 btn-primary">{selectedCampaign ? 'Mettre à jour' : 'Créer la campagne'}</Button>
              {selectedCampaign && <Button variant="destructive" onClick={() => deleteCampaign(selectedCampaign.id)}><Trash2 className="w-4 h-4" /></Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EditorialCalendarPage;
