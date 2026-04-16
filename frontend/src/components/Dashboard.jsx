import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  TrendingUp, 
  ShoppingCart, 
  AlertTriangle, 
  Package,
  Euro,
  Clock,
  ArrowUpRight
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/stats`, {
        withCredentials: true
      });
      setStats(response.data);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'badge-pending',
      shipped: 'badge-shipped',
      delivered: 'badge-delivered',
      cancelled: 'badge-cancelled'
    };
    const labels = {
      pending: 'En attente',
      shipped: 'Expédiée',
      delivered: 'Livrée',
      cancelled: 'Annulée'
    };
    return <span className={styles[status] || 'badge-pending'}>{labels[status] || status}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-critical">
        <AlertTriangle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="admin-dashboard">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">Vue d'ensemble de votre activité</p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">CA du jour</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.revenue?.day)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Euro className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">CA semaine</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.revenue?.week)}</p>
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
                <p className="text-sm text-muted-foreground">CA du mois</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats?.revenue?.month)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold mt-1">{stats?.pending_orders || 0}</p>
                <p className="text-xs text-muted-foreground">commandes</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and Latest Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Alerts */}
        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Alertes stock critique
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.critical_stock?.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune alerte</p>
            ) : (
              <div className="space-y-3">
                {stats?.critical_stock?.map((product) => (
                  <div 
                    key={product._id} 
                    className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.sku}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                      {product.quantity} restants
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latest Orders */}
        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Dernières commandes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.latest_orders?.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune commande</p>
            ) : (
              <div className="space-y-3">
                {stats?.latest_orders?.map((order, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 rounded-xl bg-secondary/50"
                  >
                    <div>
                      <p className="font-medium">{order.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{order.order_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(order.total_amount)}</p>
                      {getStatusBadge(order.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-primary" />
            Produits les plus vendus
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.top_products?.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Aucune donnée</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {stats?.top_products?.map((product, index) => (
                <div 
                  key={index} 
                  className="p-4 rounded-xl bg-secondary/50 text-center"
                >
                  <p className="text-2xl font-bold text-primary">#{index + 1}</p>
                  <p className="font-medium mt-2 text-sm">{product._id}</p>
                  <p className="text-muted-foreground text-sm">{product.total_sold} vendus</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
