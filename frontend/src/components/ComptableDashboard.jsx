import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import { Download, FileText, Receipt, Landmark, Lock, Eye } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', unpaid: 'Impayée', to_pay: 'À payer', importee: 'Importée' };
const STATUS_COLORS = { draft: 'bg-secondary text-muted-foreground', sent: 'bg-blue-500/10 text-blue-500', paid: 'bg-green-500/10 text-green-500', unpaid: 'bg-red-500/10 text-red-500', to_pay: 'bg-amber-500/10 text-amber-500', importee: 'bg-purple-500/10 text-purple-500' };

export function ComptableDashboard() {
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [bankSummary, setBankSummary] = useState(null);
  const [bankTxns, setBankTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => { fetchData(); }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [salesRes, purchRes, summaryRes, bankRes] = await Promise.all([
        axios.get(`${API_URL}/api/invoices/sales?month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/invoices/purchases?month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/accounting/reconciliation-summary?month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/accounting/bank-transactions?month=${selectedMonth}&status=matched`, { withCredentials: true })
      ]);
      setSalesInvoices(salesRes.data);
      setPurchaseInvoices(purchRes.data);
      setBankSummary(summaryRes.data);
      setBankTxns(bankRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const exportExcel = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/comptable/export?month=${selectedMonth}`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `comptabilite_${selectedMonth}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success('Export téléchargé');
    } catch (err) { toast.error('Erreur export'); }
  };

  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const getMonths = () => { const o = []; const now = new Date(); for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); o.push({ value: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }); } return o; };

  const totalSalesTTC = salesInvoices.reduce((s, i) => s + (i.total_ttc || 0), 0);
  const totalPurchasesTTC = purchaseInvoices.reduce((s, i) => s + (i.total_ttc || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="comptable-dashboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Espace Comptable</h1>
          <p className="text-muted-foreground mt-1">Consultation des factures et rapprochements (lecture seule)</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48 bg-secondary"><SelectValue /></SelectTrigger>
            <SelectContent>{getMonths().map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={exportExcel} variant="secondary" className="rounded-full" data-testid="comptable-export">
            <Download className="w-5 h-5 mr-2" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card"><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Ventes TTC</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{fmt(totalSalesTTC)}</p>
          <p className="text-xs text-muted-foreground">{salesInvoices.length} factures</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Achats TTC</p>
          <p className="text-2xl font-bold mt-1 text-red-500">{fmt(totalPurchasesTTC)}</p>
          <p className="text-xs text-muted-foreground">{purchaseInvoices.length} factures</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Solde</p>
          <p className={`text-2xl font-bold mt-1 ${totalSalesTTC - totalPurchasesTTC >= 0 ? 'text-primary' : 'text-red-500'}`}>{fmt(totalSalesTTC - totalPurchasesTTC)}</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Rapprochement</p>
          <p className="text-2xl font-bold mt-1">{bankSummary?.locked || 0}/{bankSummary?.total_transactions || 0}</p>
          <p className="text-xs text-muted-foreground">validées</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="bg-secondary">
          <TabsTrigger value="sales"><FileText className="w-4 h-4 mr-2" />Factures ventes</TabsTrigger>
          <TabsTrigger value="purchases"><Receipt className="w-4 h-4 mr-2" />Factures achats</TabsTrigger>
          <TabsTrigger value="bank"><Landmark className="w-4 h-4 mr-2" />Rapprochement</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <Card className="border-border"><CardContent className="p-0">
            {salesInvoices.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucune facture</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>{salesInvoices.map(inv => (
                <TableRow key={inv.id}><TableCell className="font-mono text-sm">{inv.number}</TableCell><TableCell>{inv.date}</TableCell><TableCell>{inv.customer_name}</TableCell><TableCell className="text-right">{fmt(inv.total_ht)}</TableCell><TableCell className="text-right text-muted-foreground">{fmt(inv.total_tva)}</TableCell><TableCell className="text-right font-medium">{fmt(inv.total_ttc)}</TableCell><TableCell><span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[inv.status]||''}`}>{STATUS_LABELS[inv.status]||inv.status}</span></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <Card className="border-border"><CardContent className="p-0">
            {purchaseInvoices.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucune facture</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Date</TableHead><TableHead>Fournisseur</TableHead><TableHead>Description</TableHead><TableHead className="text-right">HT</TableHead><TableHead className="text-right">TTC</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>{purchaseInvoices.map(inv => (
                <TableRow key={inv.id}><TableCell className="font-mono text-sm">{inv.number}</TableCell><TableCell>{inv.date}</TableCell><TableCell>{inv.supplier}</TableCell><TableCell className="text-muted-foreground text-sm">{inv.description}</TableCell><TableCell className="text-right">{fmt(inv.amount_ht)}</TableCell><TableCell className="text-right font-medium">{fmt(inv.total_ttc)}</TableCell><TableCell><span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[inv.status]||''}`}>{STATUS_LABELS[inv.status]||inv.status}</span></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="bank" className="mt-4">
          <Card className="border-border"><CardContent className="p-0">
            {bankTxns.length === 0 ? <div className="py-12 text-center text-muted-foreground">Aucune transaction rapprochée validée</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Référence</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Type rapprochement</TableHead><TableHead>Verrouillé</TableHead></TableRow></TableHeader>
              <TableBody>{bankTxns.map(txn => (
                <TableRow key={txn.id}><TableCell>{txn.date}</TableCell><TableCell>{txn.description}</TableCell><TableCell className="text-muted-foreground">{txn.reference||'-'}</TableCell><TableCell className="text-right"><span className={txn.transaction_type==='credit'?'text-green-500':'text-red-500'}>{txn.transaction_type==='credit'?'+':'-'}{fmt(txn.amount)}</span></TableCell><TableCell className="text-sm">{txn.match_type||'-'}</TableCell><TableCell>{txn.locked ? <Lock className="w-4 h-4 text-green-500" /> : <span className="text-muted-foreground text-xs">Non</span>}</TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ComptableDashboard;
