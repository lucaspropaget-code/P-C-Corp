import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
  Plus, 
  Download,
  Trash2,
  Calculator,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  FileSpreadsheet
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EXPENSE_CATEGORIES = [
  'Fournisseurs',
  'Marketing',
  'Logistique',
  'Charges fixes',
  'Salaires',
  'Impôts & Taxes',
  'Autre'
];

export function AccountingPage() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expensesRes, summaryRes] = await Promise.all([
        axios.get(`${API_URL}/api/expenses?month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/accounting/summary?month=${selectedMonth}`, { withCredentials: true })
      ]);
      setExpenses(expensesRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const createExpense = async () => {
    if (!newExpense.description || !newExpense.amount || !newExpense.category) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/expenses`, {
        ...newExpense,
        amount: parseFloat(newExpense.amount)
      }, { withCredentials: true });
      
      toast.success('Dépense enregistrée');
      setShowNewExpense(false);
      setNewExpense({
        description: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deleteExpense = async (expenseId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/expenses/${expenseId}`, { withCredentials: true });
      toast.success('Dépense supprimée');
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const exportExcel = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/accounting/export?month=${selectedMonth}`,
        { 
          withCredentials: true,
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comptabilite_${selectedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Export téléchargé');
    } catch (err) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

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
    <div className="space-y-6 animate-fadeIn" data-testid="accounting-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Comptabilité</h1>
          <p className="text-muted-foreground mt-1">Suivi des ventes et dépenses</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48 bg-secondary">
              <SelectValue placeholder="Sélectionner un mois" />
            </SelectTrigger>
            <SelectContent>
              {getMonthOptions().map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={exportExcel} variant="secondary" className="rounded-full" data-testid="export-excel-button">
            <FileSpreadsheet className="w-5 h-5 mr-2" />
            Export Excel
          </Button>
          
          <Dialog open={showNewExpense} onOpenChange={setShowNewExpense}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="new-expense-button">
                <Plus className="w-5 h-5 mr-2" />
                Nouvelle dépense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enregistrer une dépense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Input
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                    placeholder="Description de la dépense"
                    className="bg-secondary"
                    data-testid="expense-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Montant (€) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="bg-secondary"
                      data-testid="expense-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                      className="bg-secondary"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Catégorie *</Label>
                  <Select value={newExpense.category} onValueChange={(v) => setNewExpense({...newExpense, category: v})}>
                    <SelectTrigger className="bg-secondary">
                      <SelectValue placeholder="Sélectionner une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={newExpense.notes}
                    onChange={(e) => setNewExpense({...newExpense, notes: e.target.value})}
                    placeholder="Notes optionnelles"
                    className="bg-secondary"
                  />
                </div>
                <Button onClick={createExpense} className="w-full btn-primary" data-testid="save-expense-button">
                  Enregistrer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Chiffre d'affaires</p>
                  <p className="text-2xl font-bold mt-1 text-green-500">{formatCurrency(summary.total_revenue)}</p>
                  <p className="text-xs text-muted-foreground">{summary.orders_count} commandes</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Dépenses totales</p>
                  <p className="text-2xl font-bold mt-1 text-red-500">{formatCurrency(summary.total_expenses)}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bénéfice net</p>
                  <p className={`text-2xl font-bold mt-1 ${summary.net_profit >= 0 ? 'text-primary' : 'text-red-500'}`}>
                    {formatCurrency(summary.net_profit)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Marge</p>
                  <p className="text-2xl font-bold mt-1">
                    {summary.total_revenue > 0 
                      ? `${((summary.net_profit / summary.total_revenue) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Calculator className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expenses by Category */}
      {summary?.expenses_by_category && Object.keys(summary.expenses_by_category).length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Dépenses par catégorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(summary.expenses_by_category).map(([category, amount]) => (
                <div key={category} className="p-4 rounded-xl bg-secondary/50">
                  <p className="text-sm text-muted-foreground">{category}</p>
                  <p className="text-lg font-bold mt-1">{formatCurrency(amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses List */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Dépenses du mois</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Chargement...</div>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune dépense ce mois
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id} className="table-row-hover">
                      <TableCell className="text-muted-foreground">
                        {new Date(expense.date).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{expense.description}</p>
                        {expense.notes && (
                          <p className="text-xs text-muted-foreground">{expense.notes}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-secondary">
                          {expense.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-500">
                        -{formatCurrency(expense.amount)}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteExpense(expense.id)}
                          data-testid={`delete-expense-${expense.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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

export default AccountingPage;
