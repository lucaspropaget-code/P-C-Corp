import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Truck, Package, MapPin, CheckCircle, Loader2, RefreshCw, User, Printer, Clock, ExternalLink
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CARRIER_BADGE_COLOR = {
  colissimo_home: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  colissimo_relay: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  mondial_relay: 'bg-red-500/15 text-red-400 border-red-500/30',
  chronopost_13: 'bg-green-500/15 text-green-400 border-green-500/30',
  ups_standard: 'bg-amber-700/20 text-amber-500 border-amber-700/40',
  dhl_express: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

export function StockeurPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [generatedLabel, setGeneratedLabel] = useState({});

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/stockeur/orders`, { withCredentials: true });
      setOrders(response.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const generateLabel = async (orderId) => {
    setProcessing(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await axios.post(
        `${API_URL}/api/shipping/create-label`,
        { order_id: orderId },
        { withCredentials: true }
      );
      setGeneratedLabel(prev => ({ ...prev, [orderId]: res.data }));

      // Automatically mark order as shipped
      await axios.put(
        `${API_URL}/api/orders/${orderId}/status`,
        { status: 'shipped' },
        { withCredentials: true }
      );

      const srcLabel = res.data.source === 'boxtal_api' ? 'Boxtal' : 'simulation';
      toast.success(`Bordereau ${res.data.carrier} généré (${srcLabel}) — N° ${res.data.tracking_number}`);

      // Refresh list after a short delay so the user sees confirmation
      setTimeout(() => fetchOrders(), 1500);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setProcessing(prev => ({ ...prev, [orderId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="stockeur-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />Expéditions
          </h1>
          <p className="text-muted-foreground mt-1">
            {orders.length} commande(s) à expédier — cliquez pour générer le bordereau Boxtal
          </p>
        </div>
        <Button variant="secondary" onClick={fetchOrders} className="rounded-full" data-testid="refresh-orders-button">
          <RefreshCw className="w-5 h-5 mr-2" />Actualiser
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="border-border"><CardContent className="py-16 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Toutes les commandes sont expédiées !</h3>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const label = generatedLabel[order.id];
            const carrierKey = order.shipping_method_id || 'colissimo_home';
            const badgeClass = CARRIER_BADGE_COLOR[carrierKey] || 'bg-secondary text-muted-foreground border-border';

            return (
              <Card key={order.id} className="border-border hover:border-primary/30 transition-colors" data-testid={`stockeur-order-${order.order_number}`}>
                <CardContent className="pt-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Order Info */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm bg-secondary px-3 py-1 rounded-full">
                          {order.order_number}
                        </span>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {order.source && (
                          <Badge variant="outline" className="text-xs capitalize">{order.source}</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                          <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Client</p>
                            <p className="font-semibold text-lg">{order.customer_name}</p>
                            {order.customer_phone && (
                              <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Adresse de livraison</p>
                            <p className="font-medium">{order.shipping_address}</p>
                          </div>
                        </div>
                      </div>

                      {/* Products */}
                      <div className="flex items-start gap-3">
                        <Package className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2">Produits</p>
                          <div className="space-y-2">
                            {order.items?.map((item, i) => (
                              <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-secondary/50">
                                <span className="font-medium">{item.product_name}</span>
                                <span className="text-xl font-bold text-primary">x{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Carrier chosen by customer + single action */}
                    <div className="lg:w-80 space-y-3">
                      <p className="text-sm font-semibold text-muted-foreground uppercase">
                        Transporteur choisi par le client
                      </p>

                      <div className={`p-4 rounded-xl border ${badgeClass}`} data-testid={`carrier-${order.order_number}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Truck className="w-5 h-5" />
                          <span className="font-semibold text-base">
                            {order.shipping_method || 'Non défini'}
                          </span>
                        </div>
                        {order.shipping_method_title && order.shipping_method_title !== order.shipping_method && (
                          <p className="text-xs opacity-80">{order.shipping_method_title}</p>
                        )}
                      </div>

                      {!label && !order.tracking_number && (
                        <Button
                          onClick={() => generateLabel(order.id)}
                          disabled={processing[order.id]}
                          className="w-full btn-primary text-lg py-8"
                          data-testid={`generate-label-${order.order_number}`}
                        >
                          {processing[order.id] ? (
                            <><Loader2 className="w-6 h-6 mr-2 animate-spin" />Génération bordereau...</>
                          ) : (
                            <><Printer className="w-6 h-6 mr-2" />Générer bordereau Boxtal</>
                          )}
                        </Button>
                      )}

                      {(label || order.tracking_number) && (
                        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 space-y-2">
                          <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-semibold">Bordereau généré</span>
                          </div>
                          <p className="text-xs text-muted-foreground">N° de suivi</p>
                          <p className="font-mono text-sm break-all">
                            {label?.tracking_number || order.tracking_number}
                          </p>
                          {(label?.label_url || order.label_url) && !(label?.label_url || order.label_url).startsWith('#') && (
                            <a
                              href={label?.label_url || order.label_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />Télécharger le PDF
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StockeurPage;
