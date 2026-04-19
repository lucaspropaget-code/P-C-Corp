import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Truck, Package, MapPin, CheckCircle, Loader2, RefreshCw, User, Printer, Phone, Mail, Clock
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function StockeurPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [quotes, setQuotes] = useState({});
  const [loadingQuotes, setLoadingQuotes] = useState({});
  const [selectedCarrier, setSelectedCarrier] = useState({});

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/stockeur/orders`, { withCredentials: true });
      setOrders(response.data);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const fetchQuotes = async (orderId) => {
    setLoadingQuotes(prev => ({...prev, [orderId]: true}));
    try {
      const res = await axios.post(`${API_URL}/api/shipping/quote`, { order_id: orderId }, { withCredentials: true });
      setQuotes(prev => ({...prev, [orderId]: res.data.quotes}));
      if (res.data.source === 'simulation') toast.info('Cotations simulées (mode sandbox)');
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setLoadingQuotes(prev => ({...prev, [orderId]: false})); }
  };

  const shipOrder = async (orderId) => {
    const carrier = selectedCarrier[orderId];
    if (!carrier) { toast.error('Sélectionnez un transporteur'); return; }
    
    setProcessing(prev => ({...prev, [orderId]: true}));
    try {
      await axios.post(`${API_URL}/api/shipping/create-label`, {
        order_id: orderId,
        carrier_id: carrier.id,
        carrier_name: carrier.service
      }, { withCredentials: true });
      
      await axios.put(`${API_URL}/api/orders/${orderId}/status`, { status: 'shipped' }, { withCredentials: true });
      toast.success(`Expédié via ${carrier.service} !`);
      fetchOrders();
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setProcessing(prev => ({...prev, [orderId]: false})); }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="stockeur-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Truck className="w-8 h-8 text-primary" />Expéditions</h1>
          <p className="text-muted-foreground mt-1">{orders.length} commande(s) à expédier</p>
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
          {orders.map((order) => (
            <Card key={order.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Order Info */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm bg-secondary px-3 py-1 rounded-full">{order.order_number}</span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-start gap-3">
                        <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">Client</p>
                          <p className="font-semibold text-lg">{order.customer_name}</p>
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

                  {/* Shipping Selection */}
                  <div className="lg:w-80 space-y-3">
                    <p className="text-sm font-semibold text-muted-foreground uppercase">Expédition</p>

                    {/* Get quotes button or list */}
                    {!quotes[order.id] ? (
                      <Button 
                        variant="secondary" 
                        className="w-full rounded-xl py-6"
                        onClick={() => fetchQuotes(order.id)}
                        disabled={loadingQuotes[order.id]}
                      >
                        {loadingQuotes[order.id] ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Chargement...</> : <><Truck className="w-4 h-4 mr-2" />Voir les transporteurs</>}
                      </Button>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {quotes[order.id].map((q) => (
                          <div 
                            key={q.id}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedCarrier[order.id]?.id === q.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                            onClick={() => setSelectedCarrier(prev => ({...prev, [order.id]: q}))}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-sm">{q.service}</p>
                                <p className="text-xs text-muted-foreground">{q.carrier} — {q.delivery_time}</p>
                              </div>
                              <p className="font-bold text-primary">{q.price_ttc?.toFixed(2)}€</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ship button */}
                    {quotes[order.id] && (
                      <Button
                        onClick={() => shipOrder(order.id)}
                        disabled={processing[order.id] || !selectedCarrier[order.id]}
                        className="w-full btn-primary text-lg py-8"
                        data-testid={`ship-order-${order.id}`}
                      >
                        {processing[order.id] ? (
                          <><Loader2 className="w-6 h-6 mr-2 animate-spin" />Génération bordereau...</>
                        ) : (
                          <><Printer className="w-6 h-6 mr-2" />Expédier{selectedCarrier[order.id] ? ` via ${selectedCarrier[order.id].carrier}` : ''}</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default StockeurPage;
