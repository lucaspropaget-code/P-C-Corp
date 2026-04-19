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
import { Plus, Search, Edit, Trash2, User, Mail, Phone, MapPin, Star, MessageSquare, Map as MapIcon } from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_OPTIONS = [
  { value: 'particulier', label: 'Particulier', color: '#3B82F6' },
  { value: 'professionnel', label: 'Professionnel', color: '#F59E0B' },
  { value: 'gendarmerie', label: 'Gendarmerie', color: '#6366F1' },
  { value: 'police', label: 'Police', color: '#0EA5E9' },
  { value: 'ecole_police', label: 'École de police', color: '#8B5CF6' },
  { value: 'federation_chasse', label: 'Fédération de chasse', color: '#22C55E' },
  { value: 'autre', label: 'Autre', color: '#71717A' },
];

const STATUS_BADGE = {
  particulier: 'bg-blue-500/10 text-blue-500',
  professionnel: 'bg-amber-500/10 text-amber-500',
  gendarmerie: 'bg-indigo-500/10 text-indigo-500',
  police: 'bg-sky-500/10 text-sky-500',
  ecole_police: 'bg-violet-500/10 text-violet-500',
  federation_chasse: 'bg-green-500/10 text-green-500',
  autre: 'bg-secondary text-muted-foreground',
};

function createColoredIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14]
  });
}

export function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [mapCustomers, setMapCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('list');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerNotes, setCustomerNotes] = useState([]);
  const [newNote, setNewNote] = useState({ type: 'note', content: '' });
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', notes: '', status: 'particulier', latitude: '', longitude: '' });

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      const [custRes, mapRes] = await Promise.all([
        axios.get(`${API_URL}/api/customers`, { withCredentials: true }),
        axios.get(`${API_URL}/api/customers/map`, { withCredentials: true })
      ]);
      setCustomers(custRes.data);
      setMapCustomers(mapRes.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const openCustomerDetail = async (customerId) => {
    try {
      const [custRes, notesRes] = await Promise.all([
        axios.get(`${API_URL}/api/customers/${customerId}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/customers/${customerId}/notes`, { withCredentials: true })
      ]);
      setSelectedCustomer(custRes.data);
      setCustomerNotes(notesRes.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const addNote = async () => {
    if (!newNote.content.trim() || !selectedCustomer) return;
    try {
      await axios.post(`${API_URL}/api/customers/${selectedCustomer.id}/notes`, newNote, { withCredentials: true });
      toast.success('Note ajoutée');
      setNewNote({ type: 'note', content: '' });
      const notesRes = await axios.get(`${API_URL}/api/customers/${selectedCustomer.id}/notes`, { withCredentials: true });
      setCustomerNotes(notesRes.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const createOrUpdateCustomer = async () => {
    if (!newCustomer.name) { toast.error('Le nom est obligatoire'); return; }
    try {
      const payload = { ...newCustomer, latitude: newCustomer.latitude ? parseFloat(newCustomer.latitude) : null, longitude: newCustomer.longitude ? parseFloat(newCustomer.longitude) : null };
      if (editingCustomer) {
        await axios.put(`${API_URL}/api/customers/${editingCustomer.id}`, payload, { withCredentials: true });
        toast.success('Client mis à jour');
      } else {
        await axios.post(`${API_URL}/api/customers`, payload, { withCredentials: true });
        toast.success('Client créé');
      }
      setShowNewCustomer(false); setEditingCustomer(null);
      setNewCustomer({ name: '', email: '', phone: '', address: '', notes: '', status: 'particulier', latitude: '', longitude: '' });
      fetchCustomers();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteCustomer = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Supprimer ce client ?')) return;
    try { await axios.delete(`${API_URL}/api/customers/${id}`, { withCredentials: true }); toast.success('Supprimé'); fetchCustomers(); }
    catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const openEdit = (c, e) => {
    e?.stopPropagation();
    setEditingCustomer(c);
    setNewCustomer({ name: c.name, email: c.email||'', phone: c.phone||'', address: c.address||'', notes: c.notes||'', status: c.status||'particulier', latitude: c.latitude?.toString()||'', longitude: c.longitude?.toString()||'' });
    setShowNewCustomer(true);
  };

  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n||0);
  const getStatusInfo = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[6];
  const isFidele = (orders) => (orders?.length || 0) >= 3;
  const filteredCustomers = customers.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()) || c.status?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="customers-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-3xl font-bold">Clients</h1><p className="text-muted-foreground mt-1">{customers.length} clients</p></div>
        <Dialog open={showNewCustomer} onOpenChange={(o) => { setShowNewCustomer(o); if(!o){ setEditingCustomer(null); setNewCustomer({name:'',email:'',phone:'',address:'',notes:'',status:'particulier',latitude:'',longitude:''}); } }}>
          <DialogTrigger asChild><Button className="btn-primary" data-testid="new-customer-button"><Plus className="w-5 h-5 mr-2" />Nouveau client</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingCustomer ? 'Modifier' : 'Ajouter'} un client</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nom *</Label><Input value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="bg-secondary" data-testid="customer-name" /></div>
                <div className="space-y-2"><Label>Statut</Label><Select value={newCustomer.status} onValueChange={v => setNewCustomer({...newCustomer, status: v})}><SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} className="bg-secondary" /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="bg-secondary" /></div>
              </div>
              <div className="space-y-2"><Label>Adresse</Label><Textarea value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} className="bg-secondary" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="0.0001" value={newCustomer.latitude} onChange={e => setNewCustomer({...newCustomer, latitude: e.target.value})} className="bg-secondary" placeholder="48.8566" /></div>
                <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="0.0001" value={newCustomer.longitude} onChange={e => setNewCustomer({...newCustomer, longitude: e.target.value})} className="bg-secondary" placeholder="2.3522" /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={newCustomer.notes} onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})} className="bg-secondary" /></div>
              <Button onClick={createOrUpdateCustomer} className="w-full btn-primary">{editingCustomer ? 'Mettre à jour' : 'Créer'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary"><TabsTrigger value="list">Liste clients</TabsTrigger><TabsTrigger value="map"><MapIcon className="w-4 h-4 mr-1" />Carte</TabsTrigger></TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
          <Card className="border-border"><CardContent className="pt-6"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="Rechercher par nom, email ou statut..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary" /></div></CardContent></Card>
          <div className="space-y-2">
            {loading ? <div className="py-12 text-center animate-pulse text-muted-foreground">Chargement...</div> : filteredCustomers.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucun client</div> :
              filteredCustomers.map(c => (
                <Card key={c.id} className="border-border hover:border-primary/30 transition-all cursor-pointer" onClick={() => openCustomerDetail(c.id)} data-testid={`client-row-${c.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{backgroundColor: getStatusInfo(c.status).color + '20'}}><User className="w-5 h-5" style={{color: getStatusInfo(c.status).color}} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><p className="font-semibold truncate">{c.name}</p><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[c.status]||''}`}>{getStatusInfo(c.status).label}</span></div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-0.5">
                            {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                            {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                            {c.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{c.address}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className="text-sm text-muted-foreground">{c.total_orders||0} cmd</span>
                        <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => deleteCustomer(c.id, e)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-4 space-y-4">
          {/* Legend */}
          <Card className="border-border"><CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Légende :</span>
              {STATUS_OPTIONS.map(s => (
                <div key={s.value} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: s.color}} />
                  <span className="text-xs">{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
          <Card className="border-border"><CardContent className="p-0 overflow-hidden rounded-2xl" style={{height:'520px'}}>
            <MapContainer center={[46.6, 2.5]} zoom={6} style={{height:'100%',width:'100%'}}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
              {mapCustomers.filter(c => c.latitude && c.longitude).map(c => (
                <Marker key={c.id} position={[c.latitude, c.longitude]} icon={createColoredIcon(getStatusInfo(c.status).color)}>
                  <Popup><div className="text-sm min-w-48"><strong>{c.name}</strong><br/><span style={{color: getStatusInfo(c.status).color}}>{getStatusInfo(c.status).label}</span><br/>{c.address && <><MapPin className="w-3 h-3 inline" /> {c.address}<br/></>}{c.email && <><Mail className="w-3 h-3 inline" /> {c.email}<br/></>}{c.phone && <><Phone className="w-3 h-3 inline" /> {c.phone}<br/></>}<em>{c.total_orders} commande(s)</em></div></Popup>
                </Marker>
              ))}
            </MapContainer>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Customer Detail Dialog - Opens on row click */}
      <Dialog open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedCustomer(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedCustomer && (<>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{backgroundColor: getStatusInfo(selectedCustomer.status).color + '20'}}><User className="w-5 h-5" style={{color: getStatusInfo(selectedCustomer.status).color}} /></div>
                {selectedCustomer.name}
                <span className={`px-2 py-1 rounded-full text-xs ${STATUS_BADGE[selectedCustomer.status]||''}`}>{getStatusInfo(selectedCustomer.status).label}</span>
                {isFidele(selectedCustomer.orders) && <Badge className="bg-primary/10 text-primary border-primary/30"><Star className="w-3 h-3 mr-1" />Client fidèle</Badge>}
              </DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="info">
              <TabsList className="bg-secondary w-full"><TabsTrigger value="info" className="flex-1">Informations</TabsTrigger><TabsTrigger value="orders" className="flex-1">Commandes ({selectedCustomer.orders?.length||0})</TabsTrigger><TabsTrigger value="notes" className="flex-1">Notes / Problèmes</TabsTrigger></TabsList>
              <TabsContent value="info" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/50"><p className="text-xs text-muted-foreground">Email</p><p className="font-medium mt-1">{selectedCustomer.email||'-'}</p></div>
                  <div className="p-3 rounded-lg bg-secondary/50"><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium mt-1">{selectedCustomer.phone||'-'}</p></div>
                  <div className="p-3 rounded-lg bg-secondary/50 col-span-2"><p className="text-xs text-muted-foreground">Adresse</p><p className="font-medium mt-1">{selectedCustomer.address||'-'}</p></div>
                  {selectedCustomer.notes && <div className="p-3 rounded-lg bg-secondary/50 col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-1">{selectedCustomer.notes}</p></div>}
                </div>
              </TabsContent>
              <TabsContent value="orders" className="mt-4">
                {!selectedCustomer.orders?.length ? <p className="text-muted-foreground py-6 text-center">Aucune commande</p> : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">{selectedCustomer.orders.map(o => (
                    <div key={o.id} className="flex justify-between p-3 rounded-lg bg-secondary/50"><div><p className="font-mono text-sm">{o.order_number}</p><p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('fr-FR')}</p></div><div className="text-right"><p className="font-medium">{fmt(o.total_amount)}</p><span className={`text-xs ${o.status==='delivered'?'text-green-500':o.status==='shipped'?'text-blue-500':o.status==='cancelled'?'text-red-500':'text-amber-500'}`}>{o.status==='delivered'?'Livrée':o.status==='shipped'?'Expédiée':o.status==='cancelled'?'Annulée':'En attente'}</span></div></div>
                  ))}</div>
                )}
              </TabsContent>
              <TabsContent value="notes" className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <Select value={newNote.type} onValueChange={v => setNewNote({...newNote, type: v})}><SelectTrigger className="w-32 bg-secondary"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="note">Note</SelectItem><SelectItem value="issue">Problème</SelectItem><SelectItem value="resolution">Résolution</SelectItem></SelectContent></Select>
                  <Input value={newNote.content} onChange={e => setNewNote({...newNote, content: e.target.value})} placeholder="Ajouter..." className="flex-1 bg-secondary" onKeyDown={e => e.key==='Enter' && addNote()} />
                  <Button onClick={addNote} className="btn-primary">Ajouter</Button>
                </div>
                {customerNotes.length === 0 ? <p className="text-muted-foreground text-center py-4">Aucune note</p> : customerNotes.map((n,i) => (
                  <div key={i} className={`p-3 rounded-lg border-l-2 ${n.type==='issue'?'border-l-red-500 bg-red-500/5':n.type==='resolution'?'border-l-green-500 bg-green-500/5':'border-l-primary/50 bg-secondary/30'}`}>
                    <div className="flex justify-between"><span className="text-xs font-medium capitalize">{n.type==='issue'?'Problème':n.type==='resolution'?'Résolution':'Note'}</span><span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString('fr-FR')}</span></div>
                    <p className="text-sm mt-1">{n.content}</p><p className="text-xs text-muted-foreground mt-1">Par {n.created_by}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CustomersPage;
