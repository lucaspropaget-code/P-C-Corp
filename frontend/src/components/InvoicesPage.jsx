import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from './ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import { Plus, Download, Trash2, Upload, FileText, Receipt, Send, CheckCircle, AlertCircle, FileSpreadsheet, Bell, Clock, Loader2 } from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', unpaid: 'Impayée', to_pay: 'À payer', importee: 'Importée' };
const STATUS_COLORS = { draft: 'bg-secondary text-muted-foreground', sent: 'bg-blue-500/10 text-blue-500', paid: 'bg-green-500/10 text-green-500', unpaid: 'bg-red-500/10 text-red-500', to_pay: 'bg-amber-500/10 text-amber-500', importee: 'bg-purple-500/10 text-purple-500' };
const PURCHASE_CATEGORIES = { stock: 'Achat stock', general: 'Frais généraux', other: 'Autre' };

export function InvoicesPage() {
  const [activeTab, setActiveTab] = useState('sales');
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [pendingReminders, setPendingReminders] = useState([]);
  const [allReminders, setAllReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState({});
  const [showNewSale, setShowNewSale] = useState(false);
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [newSale, setNewSale] = useState({ customer_name: '', customer_email: '', customer_address: '', items: [], tva_rate: 20, notes: '', status: 'draft' });
  const [newItem, setNewItem] = useState({ description: '', quantity: 1, unit_price_ht: '' });
  const [newPurchase, setNewPurchase] = useState({ supplier: '', date: new Date().toISOString().split('T')[0], amount_ht: '', tva_rate: 20, category: 'other', description: '', status: 'to_pay', reference: '' });

  useEffect(() => { fetchData(); }, [filterMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = filterMonth && filterMonth !== 'all' ? `?month=${filterMonth}` : '';
      const [salesRes, purchRes, pendingRes, remindersRes] = await Promise.all([
        axios.get(`${API_URL}/api/invoices/sales${params}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/invoices/purchases${params}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/invoices/reminders/pending`, { withCredentials: true }),
        axios.get(`${API_URL}/api/invoices/reminders`, { withCredentials: true })
      ]);
      setSalesInvoices(salesRes.data);
      setPurchaseInvoices(purchRes.data);
      setPendingReminders(pendingRes.data);
      setAllReminders(remindersRes.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const addItem = () => {
    if (!newItem.description || !newItem.unit_price_ht) return;
    setNewSale({ ...newSale, items: [...newSale.items, { ...newItem, unit_price_ht: parseFloat(newItem.unit_price_ht), tva_rate: newSale.tva_rate }] });
    setNewItem({ description: '', quantity: 1, unit_price_ht: '' });
  };

  const createSalesInvoice = async () => {
    if (!newSale.customer_name || newSale.items.length === 0) { toast.error('Client et articles requis'); return; }
    try {
      await axios.post(`${API_URL}/api/invoices/sales`, newSale, { withCredentials: true });
      toast.success('Facture créée');
      setShowNewSale(false);
      setNewSale({ customer_name: '', customer_email: '', customer_address: '', items: [], tva_rate: 20, notes: '', status: 'draft' });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const createPurchaseInvoice = async () => {
    if (!newPurchase.supplier || !newPurchase.amount_ht) { toast.error('Fournisseur et montant requis'); return; }
    try {
      await axios.post(`${API_URL}/api/invoices/purchases`, { ...newPurchase, amount_ht: parseFloat(newPurchase.amount_ht), tva_rate: parseFloat(newPurchase.tva_rate) }, { withCredentials: true });
      toast.success('Facture achat créée');
      setShowNewPurchase(false);
      setNewPurchase({ supplier: '', date: new Date().toISOString().split('T')[0], amount_ht: '', tva_rate: 20, category: 'other', description: '', status: 'to_pay', reference: '' });
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const updateInvoiceStatus = async (id, type, status) => {
    try {
      await axios.put(`${API_URL}/api/invoices/${type}/${id}`, { status }, { withCredentials: true });
      toast.success('Statut mis à jour');
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const deleteInvoice = async (id, type) => {
    if (!window.confirm('Supprimer cette facture ?')) return;
    try {
      await axios.delete(`${API_URL}/api/invoices/${type}/${id}`, { withCredentials: true });
      toast.success('Facture supprimée');
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
  };

  const downloadPDF = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/invoices/sales/${id}/pdf`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `facture_${id}.pdf`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success('PDF téléchargé');
    } catch (err) { toast.error('Erreur téléchargement PDF'); }
  };

  const importCSV = async (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/api/invoices/import-csv?invoice_type=${type}`, formData, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`${res.data.imported} factures importées`);
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    e.target.value = '';
  };

  const importPDF = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/api/invoices/import-pdf`, formData, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.error) { toast.error(res.data.error); } else { toast.success(`Facture importée : ${res.data.supplier || 'OK'}`); }
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    e.target.value = '';
  };

  const sendReminder = async (invoiceId) => {
    setSendingReminder(prev => ({ ...prev, [invoiceId]: true }));
    try {
      const res = await axios.post(`${API_URL}/api/invoices/${invoiceId}/remind`, {}, { withCredentials: true });
      toast.success(`Relance "${res.data.level}" créée pour ${res.data.customer_name}`);
      fetchData();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setSendingReminder(prev => ({ ...prev, [invoiceId]: false })); }
  };

  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const getMonths = () => { const o = []; const now = new Date(); for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); o.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }); } return o; };
  const saleTotal = newSale.items.reduce((s, i) => s + (i.quantity * i.unit_price_ht), 0);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="invoices-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-3xl font-bold">Facturation</h1><p className="text-muted-foreground mt-1">Gérez vos factures ventes et achats</p></div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-44 bg-secondary"><SelectValue placeholder="Tous les mois" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les mois</SelectItem>{getMonths().map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <label className="cursor-pointer"><input type="file" accept=".csv" className="hidden" onChange={(e) => importCSV(e, activeTab === 'sales' ? 'sales' : 'purchase')} /><div className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium hover:bg-secondary/80 cursor-pointer"><FileSpreadsheet className="w-4 h-4" />Import CSV</div></label>
          <label className="cursor-pointer"><input type="file" accept=".pdf" className="hidden" onChange={importPDF} /><div className="inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-medium hover:bg-secondary/80 cursor-pointer"><Upload className="w-4 h-4" />Import PDF (IA)</div></label>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="sales">Factures ventes</TabsTrigger>
          <TabsTrigger value="purchases">Factures achats</TabsTrigger>
          <TabsTrigger value="reminders" className="relative">
            Relances
            {pendingReminders.filter(r => r.needs_reminder).length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{pendingReminders.filter(r => r.needs_reminder).length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={showNewSale} onOpenChange={setShowNewSale}>
              <DialogTrigger asChild><Button className="btn-primary" data-testid="new-sales-invoice"><Plus className="w-5 h-5 mr-2" />Nouvelle facture vente</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Créer une facture de vente</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Client *</Label><Input value={newSale.customer_name} onChange={e => setNewSale({...newSale, customer_name: e.target.value})} className="bg-secondary" data-testid="invoice-customer" /></div>
                    <div className="space-y-2"><Label>Email</Label><Input value={newSale.customer_email} onChange={e => setNewSale({...newSale, customer_email: e.target.value})} className="bg-secondary" /></div>
                  </div>
                  <div className="space-y-2"><Label>Adresse</Label><Input value={newSale.customer_address} onChange={e => setNewSale({...newSale, customer_address: e.target.value})} className="bg-secondary" /></div>
                  <div className="space-y-2">
                    <Label>TVA par défaut (%)</Label>
                    <Input type="number" value={newSale.tva_rate} onChange={e => setNewSale({...newSale, tva_rate: parseFloat(e.target.value) || 20})} className="bg-secondary w-32" />
                  </div>
                  <div className="space-y-2">
                    <Label>Articles *</Label>
                    <div className="flex gap-2">
                      <Input placeholder="Description" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="flex-1 bg-secondary" />
                      <Input type="number" min="1" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: parseInt(e.target.value)||1})} className="w-16 bg-secondary" placeholder="Qté" />
                      <Input type="number" step="0.01" placeholder="Prix HT" value={newItem.unit_price_ht} onChange={e => setNewItem({...newItem, unit_price_ht: e.target.value})} className="w-28 bg-secondary" />
                      <Button onClick={addItem} variant="secondary"><Plus className="w-4 h-4" /></Button>
                    </div>
                    {newSale.items.length > 0 && (
                      <div className="rounded-xl border border-border overflow-hidden mt-2">
                        <Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qté</TableHead><TableHead className="text-right">PU HT</TableHead><TableHead className="text-right">Total HT</TableHead><TableHead></TableHead></TableRow></TableHeader>
                        <TableBody>{newSale.items.map((item, i) => (
                          <TableRow key={i}><TableCell>{item.description}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right">{fmt(item.unit_price_ht)}</TableCell><TableCell className="text-right">{fmt(item.quantity * item.unit_price_ht)}</TableCell><TableCell><Button variant="ghost" size="sm" className="text-destructive" onClick={() => setNewSale({...newSale, items: newSale.items.filter((_,idx)=>idx!==i)})}>×</Button></TableCell></TableRow>
                        ))}<TableRow><TableCell colSpan={3} className="font-bold">Total HT</TableCell><TableCell className="text-right font-bold">{fmt(saleTotal)}</TableCell><TableCell></TableCell></TableRow>
                        <TableRow><TableCell colSpan={3}>TVA ({newSale.tva_rate}%)</TableCell><TableCell className="text-right">{fmt(saleTotal * newSale.tva_rate / 100)}</TableCell><TableCell></TableCell></TableRow>
                        <TableRow><TableCell colSpan={3} className="font-bold text-primary">Total TTC</TableCell><TableCell className="text-right font-bold text-primary">{fmt(saleTotal * (1 + newSale.tva_rate / 100))}</TableCell><TableCell></TableCell></TableRow>
                        </TableBody></Table>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={newSale.notes} onChange={e => setNewSale({...newSale, notes: e.target.value})} className="bg-secondary" /></div>
                  <Button onClick={createSalesInvoice} className="w-full btn-primary" data-testid="create-sales-invoice">Créer la facture</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-border"><CardContent className="p-0">
            {loading ? <div className="py-12 text-center text-muted-foreground animate-pulse">Chargement...</div> : salesInvoices.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucune facture de vente</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>{salesInvoices.map(inv => (
                <TableRow key={inv.id} className="table-row-hover">
                  <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.date}</TableCell>
                  <TableCell className="font-medium">{inv.customer_name}</TableCell>
                  <TableCell className="text-right">{fmt(inv.total_ht)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(inv.total_tva)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(inv.total_ttc)}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>{STATUS_LABELS[inv.status] || inv.status}</span></TableCell>
                  <TableCell><div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => downloadPDF(inv.id)} title="PDF"><Download className="w-4 h-4" /></Button>
                    {inv.status === 'draft' && <Button variant="ghost" size="sm" onClick={() => updateInvoiceStatus(inv.id, 'sales', 'sent')} title="Envoyer"><Send className="w-4 h-4 text-blue-500" /></Button>}
                    {inv.status === 'sent' && <Button variant="ghost" size="sm" onClick={() => updateInvoiceStatus(inv.id, 'sales', 'paid')} title="Payée"><CheckCircle className="w-4 h-4 text-green-500" /></Button>}
                    {inv.status === 'sent' && <Button variant="ghost" size="sm" onClick={() => updateInvoiceStatus(inv.id, 'sales', 'unpaid')} title="Impayée"><AlertCircle className="w-4 h-4 text-red-500" /></Button>}
                    {(inv.status === 'draft' || inv.status === 'importee') && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteInvoice(inv.id, 'sales')}><Trash2 className="w-4 h-4" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* PURCHASES TAB */}
        <TabsContent value="purchases" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={showNewPurchase} onOpenChange={setShowNewPurchase}>
              <DialogTrigger asChild><Button className="btn-primary" data-testid="new-purchase-invoice"><Plus className="w-5 h-5 mr-2" />Nouvelle facture achat</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Saisir une facture d'achat</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>Fournisseur *</Label><Input value={newPurchase.supplier} onChange={e => setNewPurchase({...newPurchase, supplier: e.target.value})} className="bg-secondary" data-testid="purchase-supplier" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={newPurchase.date} onChange={e => setNewPurchase({...newPurchase, date: e.target.value})} className="bg-secondary" /></div>
                    <div className="space-y-2"><Label>Référence</Label><Input value={newPurchase.reference} onChange={e => setNewPurchase({...newPurchase, reference: e.target.value})} className="bg-secondary" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Montant HT (€) *</Label><Input type="number" step="0.01" value={newPurchase.amount_ht} onChange={e => setNewPurchase({...newPurchase, amount_ht: e.target.value})} className="bg-secondary" data-testid="purchase-amount" /></div>
                    <div className="space-y-2"><Label>TVA (%)</Label><Input type="number" value={newPurchase.tva_rate} onChange={e => setNewPurchase({...newPurchase, tva_rate: e.target.value})} className="bg-secondary" /></div>
                  </div>
                  <div className="space-y-2"><Label>Catégorie</Label>
                    <Select value={newPurchase.category} onValueChange={v => setNewPurchase({...newPurchase, category: v})}>
                      <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="stock">Achat stock</SelectItem><SelectItem value="general">Frais généraux</SelectItem><SelectItem value="other">Autre</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Input value={newPurchase.description} onChange={e => setNewPurchase({...newPurchase, description: e.target.value})} className="bg-secondary" /></div>
                  {newPurchase.amount_ht && (
                    <div className="p-3 rounded-xl bg-secondary/50 text-sm">
                      <div className="flex justify-between"><span>HT</span><span>{fmt(parseFloat(newPurchase.amount_ht)||0)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>TVA ({newPurchase.tva_rate}%)</span><span>{fmt((parseFloat(newPurchase.amount_ht)||0) * (parseFloat(newPurchase.tva_rate)||20) / 100)}</span></div>
                      <div className="flex justify-between font-bold text-primary mt-1 pt-1 border-t border-border"><span>TTC</span><span>{fmt((parseFloat(newPurchase.amount_ht)||0) * (1 + (parseFloat(newPurchase.tva_rate)||20) / 100))}</span></div>
                    </div>
                  )}
                  <Button onClick={createPurchaseInvoice} className="w-full btn-primary" data-testid="create-purchase-invoice">Enregistrer</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-border"><CardContent className="p-0">
            {loading ? <div className="py-12 text-center text-muted-foreground animate-pulse">Chargement...</div> : purchaseInvoices.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucune facture d'achat</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Date</TableHead><TableHead>Fournisseur</TableHead><TableHead>Catégorie</TableHead><TableHead className="text-right">HT</TableHead><TableHead className="text-right">TTC</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>{purchaseInvoices.map(inv => (
                <TableRow key={inv.id} className="table-row-hover">
                  <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.date}</TableCell>
                  <TableCell className="font-medium">{inv.supplier}</TableCell>
                  <TableCell><span className="text-sm">{PURCHASE_CATEGORIES[inv.category] || inv.category}</span></TableCell>
                  <TableCell className="text-right">{fmt(inv.amount_ht)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(inv.total_ttc)}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>{STATUS_LABELS[inv.status] || inv.status}</span></TableCell>
                  <TableCell><div className="flex gap-1 justify-end">
                    {inv.status === 'to_pay' && <Button variant="ghost" size="sm" onClick={() => updateInvoiceStatus(inv.id, 'purchases', 'paid')} title="Marquer payée"><CheckCircle className="w-4 h-4 text-green-500" /></Button>}
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteInvoice(inv.id, 'purchases')}><Trash2 className="w-4 h-4" /></Button>
                  </div></TableCell>
                </TableRow>
              ))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* REMINDERS TAB */}
        <TabsContent value="reminders" className="space-y-6 mt-4">
          {/* Pending reminders */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                Factures à relancer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingReminders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune facture impayée</p>
              ) : (
                <div className="space-y-3">
                  {pendingReminders.map(inv => (
                    <div key={inv.invoice_id} className={`flex items-center justify-between p-4 rounded-xl border ${inv.needs_reminder ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm">{inv.invoice_number}</span>
                          <span className="font-medium">{inv.customer_name}</span>
                          <span className="font-bold text-primary">{fmt(inv.amount_ttc)}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{inv.days_since} jours d'impayé</span>
                          <span>{inv.reminders_sent} relance(s) envoyée(s)</span>
                          {inv.last_level && <span className={`px-2 py-0.5 rounded-full text-xs ${inv.last_level === 'mise_en_demeure' ? 'bg-red-500/10 text-red-500' : inv.last_level === 'relance' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>{inv.last_level}</span>}
                        </div>
                      </div>
                      <Button
                        onClick={() => sendReminder(inv.invoice_id)}
                        disabled={sendingReminder[inv.invoice_id]}
                        className={inv.needs_reminder ? 'btn-primary' : 'rounded-full'}
                        variant={inv.needs_reminder ? 'default' : 'secondary'}
                        data-testid={`send-reminder-${inv.invoice_id}`}
                      >
                        {sendingReminder[inv.invoice_id] ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération IA...</>
                        ) : (
                          <><Bell className="w-4 h-4 mr-2" />Relancer ({inv.next_level})</>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reminder history */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Historique des relances
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allReminders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune relance envoyée</p>
              ) : (
                <div className="space-y-3">
                  {allReminders.map(rem => (
                    <Card key={rem.id} className={`border-l-2 ${rem.level === 'mise_en_demeure' ? 'border-l-red-500' : rem.level === 'relance' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{rem.invoice_number}</span>
                            <span className="font-medium">{rem.customer_name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rem.level === 'mise_en_demeure' ? 'bg-red-500/10 text-red-500' : rem.level === 'relance' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>{rem.level}</span>
                            <Badge variant="secondary" className="text-xs">{rem.status === 'simulated' ? 'Simulée' : rem.status}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{new Date(rem.created_at).toLocaleString('fr-FR')}</span>
                        </div>
                        <p className="text-sm font-medium mb-1">{rem.subject}</p>
                        <div className="bg-secondary/50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">{rem.content}</div>
                        <p className="text-xs text-muted-foreground mt-2">Montant : {fmt(rem.amount_ttc)} | {rem.days_since_invoice}j d'impayé | Par {rem.created_by}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InvoicesPage;
