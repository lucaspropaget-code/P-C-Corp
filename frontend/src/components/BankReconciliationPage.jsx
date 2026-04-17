import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { 
  Upload,
  Plus,
  Trash2,
  Link2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  ArrowUpDown,
  Wallet,
  TrendingUp,
  TrendingDown,
  Lock
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function BankReconciliationPage() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewTxn, setShowNewTxn] = useState(false);
  const [matchingTxn, setMatchingTxn] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [newTxn, setNewTxn] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    transaction_type: 'credit',
    reference: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedMonth, filterStatus]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: selectedMonth });
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const [txnRes, summaryRes, ordersRes, expensesRes] = await Promise.all([
        axios.get(`${API_URL}/api/accounting/bank-transactions?${params}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/accounting/reconciliation-summary?month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/orders`, { withCredentials: true }),
        axios.get(`${API_URL}/api/expenses?month=${selectedMonth}`, { withCredentials: true })
      ]);
      setTransactions(txnRes.data);
      setSummary(summaryRes.data);
      setOrders(ordersRes.data);
      setExpenses(expensesRes.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const createTransaction = async () => {
    if (!newTxn.description || !newTxn.amount) {
      toast.error('Veuillez remplir les champs obligatoires');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/accounting/bank-transactions`, {
        ...newTxn,
        amount: parseFloat(newTxn.amount)
      }, { withCredentials: true });
      toast.success('Transaction ajoutée');
      setShowNewTxn(false);
      setNewTxn({ date: new Date().toISOString().split('T')[0], description: '', amount: '', transaction_type: 'credit', reference: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const importCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_URL}/api/accounting/bank-import`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`${res.data.imported} transactions importées`);
      if (res.data.errors?.length) {
        toast.error(`${res.data.errors.length} erreurs lors de l'import`);
      }
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
    e.target.value = '';
  };

  const matchTransaction = async (txnId, matchType, matchId) => {
    try {
      await axios.put(`${API_URL}/api/accounting/bank-transactions/${txnId}/match`, {
        match_type: matchType,
        match_id: matchId || null
      }, { withCredentials: true });
      toast.success('Transaction rapprochée');
      setMatchingTxn(null);
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deleteTransaction = async (txnId) => {
    if (!window.confirm('Supprimer cette transaction ?')) return;
    try {
      await axios.delete(`${API_URL}/api/accounting/bank-transactions/${txnId}`, { withCredentials: true });
      toast.success('Transaction supprimée');
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const lockMonth = async () => {
    if (!window.confirm(`Verrouiller toutes les transactions rapprochées du mois ? Cette action est irréversible.`)) return;
    try {
      const res = await axios.post(`${API_URL}/api/accounting/bank-transactions/lock?month=${selectedMonth}`, {}, { withCredentials: true });
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);

  const getMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  };

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="bank-reconciliation-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rapprochement bancaire</h1>
          <p className="text-muted-foreground mt-1">Comparez vos transactions bancaires avec vos ventes et dépenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48 bg-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getMonthOptions().map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
            <div className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary text-secondary-foreground px-6 py-3 font-medium transition-colors hover:bg-secondary/80 cursor-pointer" data-testid="import-csv-button">
              <Upload className="w-5 h-5" />
              Import CSV
            </div>
          </label>
          <Dialog open={showNewTxn} onOpenChange={setShowNewTxn}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="new-bank-txn-button">
                <Plus className="w-5 h-5 mr-2" /> Saisie manuelle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter une transaction bancaire</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input type="date" value={newTxn.date} onChange={(e) => setNewTxn({...newTxn, date: e.target.value})} className="bg-secondary" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select value={newTxn.transaction_type} onValueChange={(v) => setNewTxn({...newTxn, transaction_type: v})}>
                      <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Crédit (entrée)</SelectItem>
                        <SelectItem value="debit">Débit (sortie)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Input value={newTxn.description} onChange={(e) => setNewTxn({...newTxn, description: e.target.value})} placeholder="Libellé bancaire" className="bg-secondary" data-testid="bank-txn-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Montant (€) *</Label>
                    <Input type="number" step="0.01" value={newTxn.amount} onChange={(e) => setNewTxn({...newTxn, amount: e.target.value})} placeholder="0.00" className="bg-secondary" data-testid="bank-txn-amount" />
                  </div>
                  <div className="space-y-2">
                    <Label>Référence</Label>
                    <Input value={newTxn.reference} onChange={(e) => setNewTxn({...newTxn, reference: e.target.value})} placeholder="N° opération" className="bg-secondary" />
                  </div>
                </div>
                <Button onClick={createTransaction} className="w-full btn-primary" data-testid="save-bank-txn-button">Enregistrer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Solde banque</p>
                  <p className={`text-2xl font-bold mt-1 ${summary.bank.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(summary.bank.balance)}</p>
                </div>
                <Wallet className="w-8 h-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Solde système</p>
                  <p className={`text-2xl font-bold mt-1 ${summary.system.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(summary.system.balance)}</p>
                </div>
                <ArrowUpDown className="w-8 h-8 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Écart</p>
                  <p className={`text-2xl font-bold mt-1 ${Math.abs(summary.difference) < 1 ? 'text-green-500' : 'text-amber-500'}`}>{formatCurrency(summary.difference)}</p>
                </div>
                {Math.abs(summary.difference) < 1 ? <CheckCircle className="w-8 h-8 text-green-500/50" /> : <AlertTriangle className="w-8 h-8 text-amber-500/50" />}
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rapprochées</p>
                  <p className="text-2xl font-bold mt-1">{summary.matched}/{summary.total_transactions}</p>
                </div>
                <Link2 className="w-8 h-8 text-primary/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters + Lock */}
      <div className="flex gap-2 flex-wrap items-center">
        {['all', 'unmatched', 'matched'].map(s => (
          <Button key={s} variant={filterStatus === s ? 'default' : 'secondary'} className={`rounded-full ${filterStatus === s ? 'bg-primary text-black' : ''}`} onClick={() => setFilterStatus(s)}>
            {s === 'all' ? 'Toutes' : s === 'unmatched' ? 'Non rapprochées' : 'Rapprochées'}
          </Button>
        ))}
        <div className="flex-1" />
        {summary && summary.matched > 0 && (
          <Button onClick={lockMonth} variant="secondary" className="rounded-full gap-2" data-testid="lock-reconciliation">
            <Lock className="w-4 h-4" />
            Valider et verrouiller ({summary.matched} transactions)
          </Button>
        )}
      </div>

      {/* Transactions table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-pulse text-muted-foreground">Chargement...</div></div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Aucune transaction bancaire. Importez un relevé CSV ou saisissez manuellement.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn) => (
                    <TableRow key={txn.id} className="table-row-hover">
                      <TableCell className="text-muted-foreground">{txn.date}</TableCell>
                      <TableCell className="font-medium max-w-xs truncate">{txn.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{txn.reference || '-'}</TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={txn.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'}>
                          {txn.transaction_type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {txn.match_status === 'matched' ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30">{txn.locked ? 'Verrouillée' : 'Rapprochée'}</Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Non rapprochée</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {txn.locked ? (
                            <Lock className="w-4 h-4 text-green-500" />
                          ) : (<>
                          {txn.match_status !== 'matched' && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setMatchingTxn(txn)} data-testid={`match-txn-${txn.id}`}>
                                  <Link2 className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Rapprocher la transaction</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="p-4 rounded-xl bg-secondary/50">
                                    <p className="font-medium">{txn.description}</p>
                                    <p className={`text-lg font-bold ${txn.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                                      {txn.transaction_type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                                    </p>
                                  </div>
                                  <Tabs defaultValue="orders">
                                    <TabsList className="w-full bg-secondary">
                                      <TabsTrigger value="orders" className="flex-1">Commandes</TabsTrigger>
                                      <TabsTrigger value="expenses" className="flex-1">Dépenses</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="orders" className="max-h-64 overflow-y-auto space-y-2 mt-4">
                                      {orders.filter(o => o.status !== 'cancelled').map(order => (
                                        <div key={order.id} className="flex justify-between items-center p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 cursor-pointer" onClick={() => matchTransaction(txn.id, 'order', order.id)}>
                                          <div>
                                            <p className="font-mono text-sm">{order.order_number}</p>
                                            <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                                          </div>
                                          <p className="font-medium text-green-500">{formatCurrency(order.total_amount)}</p>
                                        </div>
                                      ))}
                                    </TabsContent>
                                    <TabsContent value="expenses" className="max-h-64 overflow-y-auto space-y-2 mt-4">
                                      {expenses.map(exp => (
                                        <div key={exp.id} className="flex justify-between items-center p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 cursor-pointer" onClick={() => matchTransaction(txn.id, 'expense', exp.id)}>
                                          <div>
                                            <p className="font-medium">{exp.description}</p>
                                            <p className="text-sm text-muted-foreground">{exp.category}</p>
                                          </div>
                                          <p className="font-medium text-red-500">-{formatCurrency(exp.amount)}</p>
                                        </div>
                                      ))}
                                    </TabsContent>
                                  </Tabs>
                                  <Button variant="secondary" className="w-full" onClick={() => matchTransaction(txn.id, 'none', null)}>
                                    Ignorer (pas de correspondance)
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteTransaction(txn.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          </>)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BankReconciliationPage;
