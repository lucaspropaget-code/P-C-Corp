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
import { Plus, Calendar, Trash2, ChevronLeft, ChevronRight, MapPin, Clock, Cloud, CloudOff, Settings } from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const EVENT_TYPES = [
  { value: 'salon', label: 'Salon', color: 'bg-purple-500/10 text-purple-500' },
  { value: 'reunion', label: 'Réunion', color: 'bg-blue-500/10 text-blue-500' },
  { value: 'promo', label: 'Promotion', color: 'bg-primary/10 text-primary' },
  { value: 'marketing', label: 'Marketing', color: 'bg-pink-500/10 text-pink-500' },
  { value: 'rappel', label: 'Rappel', color: 'bg-amber-500/10 text-amber-500' },
  { value: 'autre', label: 'Autre', color: 'bg-secondary text-muted-foreground' },
];

export function AgendaPage() {
  const [events, setEvents] = useState([]);
  const [gcalConfig, setGcalConfig] = useState({ calendar_id: '', connected: false });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showGcalConfig, setShowGcalConfig] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({ date: '', time: '09:00', title: '', type: 'reunion', description: '', location: '' });

  useEffect(() => { fetchData(); }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2,'0')}`;
      const [evRes, gcalRes] = await Promise.all([
        axios.get(`${API_URL}/api/agenda/events?month=${month}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/settings/google-calendar`, { withCredentials: true })
      ]);
      setEvents(evRes.data);
      setGcalConfig(gcalRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.date) { toast.error('Titre et date requis'); return; }
    try {
      if (editingEvent) {
        await axios.put(`${API_URL}/api/agenda/events/${editingEvent.id}`, newEvent, { withCredentials: true });
        toast.success('Événement mis à jour');
      } else {
        await axios.post(`${API_URL}/api/agenda/events`, newEvent, { withCredentials: true });
        toast.success('Événement créé');
      }
      setShowNewEvent(false); setEditingEvent(null);
      setNewEvent({ date: '', time: '09:00', title: '', type: 'reunion', description: '', location: '' });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteEvent = async (id) => {
    try { await axios.delete(`${API_URL}/api/agenda/events/${id}`, { withCredentials: true }); toast.success('Supprimé'); fetchData(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const syncToGcal = async (id) => {
    try {
      const res = await axios.post(`${API_URL}/api/agenda/events/${id}/sync-gcal`, {}, { withCredentials: true });
      toast.success(res.data.message);
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const saveGcalConfig = async () => {
    try {
      await axios.post(`${API_URL}/api/settings/google-calendar`, gcalConfig, { withCredentials: true });
      toast.success('Configuration sauvegardée');
      setShowGcalConfig(false);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 1));
  const getTypeInfo = (t) => EVENT_TYPES.find(e => e.value === t) || EVENT_TYPES[5];

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

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="agenda-page">
      <div className="flex justify-between items-center">
        <div><h1 className="text-3xl font-bold">Agenda</h1><p className="text-muted-foreground mt-1">Salons, événements et rappels</p></div>
        <div className="flex gap-2">
          <Dialog open={showGcalConfig} onOpenChange={setShowGcalConfig}>
            <DialogTrigger asChild><Button variant="secondary" className="rounded-full"><Settings className="w-4 h-4 mr-2" />Google Agenda</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Connexion Google Agenda</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground mb-2">La synchro vers Google Agenda est unidirectionnelle : vos événements sont poussés vers Google, mais les événements Google ne descendent pas ici.</p>
                  <p className="text-xs text-amber-500">Mode simulation actif — la connexion OAuth sera configurée plus tard via Google Cloud Console.</p>
                </div>
                <div className="space-y-2"><Label>ID Calendrier Google</Label><Input value={gcalConfig.calendar_id} onChange={e => setGcalConfig({...gcalConfig, calendar_id: e.target.value})} className="bg-secondary" placeholder="assault58.com_xxxxx@group.calendar.google.com" /></div>
                <Button onClick={saveGcalConfig} className="w-full btn-primary">Enregistrer</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showNewEvent} onOpenChange={(o) => { setShowNewEvent(o); if(!o) setEditingEvent(null); }}>
            <DialogTrigger asChild><Button className="btn-primary" data-testid="new-agenda-event"><Plus className="w-5 h-5 mr-2" />Nouvel événement</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingEvent ? 'Modifier' : 'Créer'} un événement</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Titre *</Label><Input value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} className="bg-secondary" /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Date *</Label><Input type="date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="bg-secondary" /></div>
                  <div className="space-y-2"><Label>Heure</Label><Input type="time" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} className="bg-secondary" /></div>
                  <div className="space-y-2"><Label>Type</Label><Select value={newEvent.type} onValueChange={v => setNewEvent({...newEvent, type: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Lieu</Label><Input value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} className="bg-secondary" placeholder="Bureau, salon, etc." /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} className="bg-secondary" /></div>
                <Button onClick={saveEvent} className="w-full btn-primary">{editingEvent ? 'Mettre à jour' : 'Créer'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary"><TabsTrigger value="calendar">Calendrier</TabsTrigger><TabsTrigger value="list">Liste</TabsTrigger></TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="w-5 h-5" /></Button>
              <CardTitle>{MONTHS[month]} {year}</CardTitle>
              <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="w-5 h-5" /></Button>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-1">
                {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>)}
                {calDays.map((day, i) => {
                  const dayEvents = day ? getEventsForDay(day) : [];
                  const isToday = day && new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                  return (
                    <div key={i} className={`min-h-20 p-1 rounded-lg border ${day ? 'border-border' : 'border-transparent'} ${isToday ? 'bg-primary/5 border-primary/30' : ''}`}>
                      {day && <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</p>}
                      {dayEvents.map(ev => (
                        <div key={ev.id} className={`text-xs p-1 rounded mb-0.5 cursor-pointer truncate ${getTypeInfo(ev.type).color}`} onClick={() => { setEditingEvent(ev); setNewEvent({date:ev.date,time:ev.time||'09:00',title:ev.title,type:ev.type,description:ev.description||'',location:ev.location||''}); setShowNewEvent(true); }}>
                          {ev.time && <span className="font-mono mr-1">{ev.time}</span>}{ev.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4 space-y-3">
          {events.length === 0 ? <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">Aucun événement ce mois</CardContent></Card> :
            events.map(ev => (
              <Card key={ev.id} className="border-border hover:border-primary/20 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm bg-secondary px-2 py-1 rounded">{ev.date} {ev.time||''}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${getTypeInfo(ev.type).color}`}>{getTypeInfo(ev.type).label}</span>
                        <h3 className="font-bold">{ev.title}</h3>
                        {ev.synced_to_gcal && <Badge className="bg-green-500/10 text-green-500"><Cloud className="w-3 h-3 mr-1" />Synchronisé</Badge>}
                      </div>
                      {ev.location && <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</p>}
                      {ev.description && <p className="text-sm mt-1">{ev.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      {!ev.synced_to_gcal && <Button variant="ghost" size="sm" onClick={() => syncToGcal(ev.id)} title="Sync Google Agenda"><Cloud className="w-4 h-4 text-blue-500" /></Button>}
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteEvent(ev.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AgendaPage;
