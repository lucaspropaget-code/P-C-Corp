import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  Truck, 
  Package,
  MapPin,
  CheckCircle,
  Loader2,
  RefreshCw,
  User,
  Printer
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function StockeurPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [shippingMethod, setShippingMethod] = useState({});

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/stockeur/orders`, { withCredentials: true });
      setOrders(response.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const markAsShipped = async (orderId) => {
    setProcessing(prev => ({ ...prev, [orderId]: true }));
    try {
      // Generate shipping label first
      const method = shippingMethod[orderId] || 'colissimo_domicile';
      await axios.post(`${API_URL}/api/shipping/create-label`, {
        order_id: orderId,
        method: method
      }, { withCredentials: true });
      
      // Then mark as shipped
      await axios.put(
        `${API_URL}/api/orders/${orderId}/status`,
        { status: 'shipped' },
        { withCredentials: true }
      );
      toast.success('Bordereau généré et commande marquée comme expédiée');
      fetchOrders();
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
            <Truck className="w-8 h-8 text-primary" />
            Expéditions
          </h1>
          <p className="text-muted-foreground mt-1">
            {orders.length} commande(s) à expédier
          </p>
        </div>
        <Button 
          variant="secondary" 
          onClick={fetchOrders}
          className="rounded-full"
          data-testid="refresh-orders-button"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Actualiser
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Toutes les commandes sont expédiées !</h3>
            <p className="text-muted-foreground">
              Il n'y a aucune commande en attente d'expédition.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Order Info */}
                  <div className="flex-1 space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm bg-secondary px-3 py-1 rounded-full">
                        {order.order_number}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {/* Customer & Address */}
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
                        <p className="text-sm text-muted-foreground mb-2">Produits commandés</p>
                        <div className="space-y-2">
                          {order.items?.map((item, index) => (
                            <div 
                              key={index}
                              className="flex justify-between items-center p-3 rounded-lg bg-secondary/50"
                            >
                              <span className="font-medium">{item.product_name}</span>
                              <span className="text-xl font-bold text-primary">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shipping Method + Action */}
                  <div className="lg:ml-6 space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Mode d'expédition</p>
                      <select
                        className="w-full p-3 rounded-xl bg-secondary border border-border text-base"
                        value={shippingMethod[order.id] || 'colissimo_domicile'}
                        onChange={(e) => setShippingMethod(prev => ({...prev, [order.id]: e.target.value}))}
                      >
                        <option value="colissimo_domicile">Colissimo Domicile</option>
                        <option value="colissimo_relais">Colissimo Point Relais</option>
                      </select>
                    </div>
                    <Button
                      onClick={() => markAsShipped(order.id)}
                      disabled={processing[order.id]}
                      className="w-full btn-primary text-lg py-8 px-10"
                      data-testid={`ship-order-${order.id}`}
                    >
                      {processing[order.id] ? (
                        <>
                          <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                          Génération bordereau...
                        </>
                      ) : (
                        <>
                          <Printer className="w-6 h-6 mr-2" />
                          Expédier + Bordereau
                        </>
                      )}
                    </Button>
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
