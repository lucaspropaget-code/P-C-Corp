import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { 
  RefreshCw,
  Loader2,
  Store,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Webhook,
  Copy
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function WooCommerceSyncPage() {
  const [syncHistory, setSyncHistory] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncType, setSyncType] = useState('full');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [historyRes, webhookRes] = await Promise.all([
        axios.get(`${API_URL}/api/woocommerce/sync-history`, { withCredentials: true }),
        axios.get(`${API_URL}/api/woocommerce/webhook-url`, { withCredentials: true })
      ]);
      setSyncHistory(historyRes.data);
      setWebhookUrl(webhookRes.data.webhook_url);
    } catch (err) {
      console.error('Error fetching sync data:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API_URL}/api/woocommerce/sync`, {
        sync_type: syncType
      }, { withCredentials: true });
      toast.success(`Synchronisation réussie ! ${res.data.orders_imported} commandes importées, ${res.data.products_synced} produits synchronisés.`);
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSyncing(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL copiée dans le presse-papier');
  };

  const getStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-amber-500 animate-spin" />;
  };

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="woo-sync-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Synchronisation WooCommerce</h1>
          <p className="text-muted-foreground mt-1">Importez vos commandes et produits depuis votre boutique</p>
        </div>
      </div>

      {/* Sync Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Synchronisation manuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Lancez une synchronisation pour importer les dernières commandes et produits depuis WooCommerce.
            </p>
            <Tabs value={syncType} onValueChange={setSyncType}>
              <TabsList className="w-full bg-secondary">
                <TabsTrigger value="full" className="flex-1">Complète</TabsTrigger>
                <TabsTrigger value="orders" className="flex-1">Commandes</TabsTrigger>
                <TabsTrigger value="products" className="flex-1">Produits</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              onClick={triggerSync} 
              disabled={syncing}
              className="w-full btn-primary text-lg py-6"
              data-testid="sync-now-button"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Synchronisation en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Synchroniser maintenant
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-primary" />
              Webhook temps réel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Configurez ce webhook dans WooCommerce pour recevoir les commandes en temps réel.
            </p>
            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">URL du Webhook</p>
                <div className="flex gap-2">
                  <code className="flex-1 bg-background p-3 rounded-lg text-sm font-mono text-primary break-all">
                    {webhookUrl || 'Non configuré'}
                  </code>
                  {webhookUrl && (
                    <Button variant="secondary" size="sm" onClick={copyWebhookUrl} data-testid="copy-webhook-url">
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Topic</p>
                <code className="bg-background p-2 rounded-lg text-sm font-mono">order.created</code>
              </div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <h4 className="font-medium text-sm mb-2">Configuration dans WooCommerce</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Allez dans WooCommerce &rarr; Réglages &rarr; Avancé &rarr; Webhooks</li>
                <li>Cliquez sur "Ajouter un webhook"</li>
                <li>Collez l'URL ci-dessus dans le champ "URL de livraison"</li>
                <li>Sélectionnez le topic "Commande créée"</li>
                <li>Enregistrez le webhook</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync History */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Historique des synchronisations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-pulse text-muted-foreground">Chargement...</div></div>
          ) : syncHistory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune synchronisation effectuée. Cliquez sur "Synchroniser maintenant" pour commencer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Déclenché par</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncHistory.map((log) => (
                    <TableRow key={log.id} className="table-row-hover">
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(log.started_at).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {log.type === 'webhook' ? (
                            <Webhook className="w-4 h-4 text-blue-500" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-primary" />
                          )}
                          <span className="capitalize">{log.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{log.triggered_by}</TableCell>
                      <TableCell className="text-sm">
                        {log.details ? (
                          <div className="flex gap-3">
                            {log.details.orders_imported !== undefined && (
                              <span className="flex items-center gap-1">
                                <ShoppingCart className="w-3 h-3" />
                                {log.details.orders_imported} commandes
                              </span>
                            )}
                            {log.details.products_synced !== undefined && (
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                {log.details.products_synced} produits
                              </span>
                            )}
                          </div>
                        ) : log.topic ? (
                          <span className="text-muted-foreground">{log.topic}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <span className="capitalize text-sm">{log.status}</span>
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

export default WooCommerceSyncPage;
