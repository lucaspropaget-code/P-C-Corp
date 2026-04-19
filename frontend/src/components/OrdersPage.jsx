import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
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
  Search, 
  Eye,
  Filter,
  Package,
  MapPin,
  History,
  ArrowRight,
  FileText
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { AddressAutocomplete } from './AddressAutocomplete';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_LABELS = {
  pending: 'En attente',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée'
};

const ALL_STATUSES = ['pending', 'shipped', 'delivered', 'cancelled'];

export function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    shipping_address: '',
    billing_address: '',
    items: [],
    notes: '',
    source: 'site',
    shipping_method_id: 'colissimo_home',
    shipping_method: 'Colissimo Domicile'
  });
  const [newItem, setNewItem] = useState({ product_id: '', quantity: 1 });

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, [filter]);

  const fetchOrders = async () => {
    try {
      const url = filter === 'all' 
        ? `${API_URL}/api/orders`
        : `${API_URL}/api/orders?status=${filter}`;
      const response = await axios.get(url, { withCredentials: true });
      setOrders(response.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/products`, { withCredentials: true });
      setProducts(response.data);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put(
        `${API_URL}/api/orders/${orderId}/status`,
        { status },
        { withCredentials: true }
      );
      toast.success(`Statut mis à jour : ${STATUS_LABELS[status] || status}`);
      fetchOrders();
      setSelectedOrder(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const fetchOrderHistory = async (orderId) => {
    try {
      const response = await axios.get(`${API_URL}/api/orders/${orderId}/history`, { withCredentials: true });
      setOrderHistory(response.data);
      setShowHistory(true);
    } catch (err) {
      console.error('Error fetching history:', err);
      setOrderHistory([]);
      setShowHistory(true);
    }
  };

  const generateInvoice = async (orderId) => {
    try {
      const res = await axios.post(`${API_URL}/api/orders/${orderId}/generate-invoice`, {}, { withCredentials: true });
      if (res.data.already_exists) {
        toast.info(`Facture ${res.data.invoice_number} déjà existante`);
      } else {
        toast.success(`Facture ${res.data.invoice?.number} générée !`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const addItemToOrder = () => {
    if (!newItem.product_id) return;
    const product = products.find(p => p.id === newItem.product_id);
    if (!product) return;

    setNewOrder({
      ...newOrder,
      items: [...newOrder.items, {
        product_id: product.id,
        product_name: product.name,
        quantity: newItem.quantity,
        unit_price: product.price
      }]
    });
    setNewItem({ product_id: '', quantity: 1 });
  };

  const removeItemFromOrder = (index) => {
    setNewOrder({
      ...newOrder,
      items: newOrder.items.filter((_, i) => i !== index)
    });
  };

  const createOrder = async () => {
    if (!newOrder.customer_name || !newOrder.shipping_address || !newOrder.customer_email || !newOrder.customer_phone || newOrder.items.length === 0) {
      toast.error('Veuillez remplir : nom, email, téléphone, adresse et articles');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/orders`, newOrder, { withCredentials: true });
      toast.success('Commande créée');
      setShowNewOrder(false);
      setNewOrder({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        shipping_address: '',
        billing_address: '',
        items: [],
        notes: '',
        source: 'site',
        shipping_method_id: 'colissimo_home',
        shipping_method: 'Colissimo Domicile'
      });
      fetchOrders();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
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

  const filteredOrders = orders.filter(order => 
    order.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    order.order_number?.toLowerCase().includes(search.toLowerCase())
  );

  const orderTotal = newOrder.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="orders-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Commandes</h1>
          <p className="text-muted-foreground mt-1">Gérez toutes vos commandes</p>
        </div>
        <Dialog open={showNewOrder} onOpenChange={setShowNewOrder}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="new-order-button">
              <Plus className="w-5 h-5 mr-2" />
              Nouvelle commande
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Créer une commande manuelle</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom du client *</Label>
                  <Input value={newOrder.customer_name} onChange={(e) => setNewOrder({...newOrder, customer_name: e.target.value})} placeholder="Nom complet" className="bg-secondary" data-testid="order-customer-name" />
                </div>
                <div className="space-y-2">
                  <Label>Source *</Label>
                  <select className="w-full p-3 rounded-xl bg-secondary border border-border" value={newOrder.source} onChange={(e) => setNewOrder({...newOrder, source: e.target.value})}>
                    <option value="site">Site</option>
                    <option value="salon">Salon</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={newOrder.customer_email} onChange={(e) => setNewOrder({...newOrder, customer_email: e.target.value})} placeholder="email@exemple.com" className="bg-secondary" />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone *</Label>
                  <Input value={newOrder.customer_phone} onChange={(e) => setNewOrder({...newOrder, customer_phone: e.target.value})} placeholder="06 12 34 56 78" className="bg-secondary" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Adresse de livraison *</Label>
                <AddressAutocomplete value={newOrder.shipping_address} onChange={v => setNewOrder({...newOrder, shipping_address: v})} onSelect={({address}) => setNewOrder({...newOrder, shipping_address: address})} data-testid="order-shipping-address" />
              </div>
              <div className="space-y-2">
                <Label>Adresse de facturation (si différente)</Label>
                <AddressAutocomplete value={newOrder.billing_address} onChange={v => setNewOrder({...newOrder, billing_address: v})} onSelect={({address}) => setNewOrder({...newOrder, billing_address: address})} placeholder="Laisser vide = même que livraison" />
              </div>

              <div className="space-y-2">
                <Label>Transporteur choisi par le client *</Label>
                <select
                  className="w-full p-3 rounded-xl bg-secondary border border-border"
                  value={newOrder.shipping_method_id}
                  onChange={(e) => {
                    const map = {
                      colissimo_home:  'Colissimo Domicile',
                      colissimo_relay: 'Colissimo Point Relais',
                      mondial_relay:   'Mondial Relay Point',
                      chronopost_13:   'Chronopost 13h',
                      ups_standard:    'UPS Standard',
                      dhl_express:     'DHL Express',
                    };
                    setNewOrder({ ...newOrder, shipping_method_id: e.target.value, shipping_method: map[e.target.value] });
                  }}
                  data-testid="order-shipping-method"
                >
                  <option value="colissimo_home">Colissimo Domicile</option>
                  <option value="colissimo_relay">Colissimo Point Relais</option>
                  <option value="mondial_relay">Mondial Relay Point</option>
                  <option value="chronopost_13">Chronopost 13h</option>
                  <option value="ups_standard">UPS Standard</option>
                  <option value="dhl_express">DHL Express</option>
                </select>
              </div>

              <div className="space-y-4">
                <Label>Produits *</Label>
                <div className="flex gap-2">
                  <Select value={newItem.product_id} onValueChange={(v) => setNewItem({...newItem, product_id: v})}>
                    <SelectTrigger className="flex-1 bg-secondary">
                      <SelectValue placeholder="Sélectionner un produit" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} - {formatCurrency(product.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                    className="w-20 bg-secondary"
                    data-testid="order-item-quantity"
                  />
                  <Button onClick={addItemToOrder} variant="secondary" data-testid="add-item-button">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {newOrder.items.length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead className="text-right">Qté</TableHead>
                          <TableHead className="text-right">Prix</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newOrder.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.product_name}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.quantity * item.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive"
                                onClick={() => removeItemFromOrder(index)}
                              >
                                ×
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={2} className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(orderTotal)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({...newOrder, notes: e.target.value})}
                  placeholder="Notes sur la commande"
                  className="bg-secondary"
                />
              </div>

              <Button onClick={createOrder} className="w-full btn-primary" data-testid="create-order-button">
                Créer la commande
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Rechercher par nom ou numéro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary"
                data-testid="orders-search"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48 bg-secondary">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filtrer par statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="shipped">Expédiées</SelectItem>
                  <SelectItem value="delivered">Livrées</SelectItem>
                  <SelectItem value="cancelled">Annulées</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Chargement...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune commande trouvée
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Commande</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produits</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id} className="table-row-hover">
                      <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                      <TableCell className="font-medium">{order.customer_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{order.items?.length || 0} article(s)</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(order.total_amount)}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(order.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedOrder(order)}
                              data-testid={`view-order-${order.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Détail commande {order.order_number}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Statut</span>
                                {getStatusBadge(order.status)}
                              </div>
                              <div>
                                <p className="text-muted-foreground text-sm">Client</p>
                                <p className="font-medium">{order.customer_name}</p>
                                {order.customer_email && <p className="text-sm">{order.customer_email}</p>}
                              </div>
                              <div>
                                <p className="text-muted-foreground text-sm flex items-center gap-1">
                                  <MapPin className="w-4 h-4" /> Adresse
                                </p>
                                <p>{order.shipping_address}</p>
                              </div>
                              {order.shipping_method && (
                                <div>
                                  <p className="text-muted-foreground text-sm">Transporteur</p>
                                  <p className="font-medium">{order.shipping_method}</p>
                                  {order.tracking_number && (
                                    <p className="text-xs text-muted-foreground font-mono">Suivi : {order.tracking_number}</p>
                                  )}
                                </div>
                              )}
                              <div>
                                <p className="text-muted-foreground text-sm mb-2">Produits</p>
                                {order.items?.map((item, i) => (
                                  <div key={i} className="flex justify-between py-2 border-b border-border">
                                    <span>{item.product_name} × {item.quantity}</span>
                                    <span>{formatCurrency(item.quantity * item.unit_price)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between py-2 font-bold">
                                  <span>Total</span>
                                  <span>{formatCurrency(order.total_amount)}</span>
                                </div>
                              </div>
                              
                              {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                <div className="flex gap-2 pt-4">
                                  {order.status === 'pending' && (
                                    <Button 
                                      onClick={() => updateOrderStatus(order.id, 'shipped')}
                                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                                    >
                                      Marquer expédiée
                                    </Button>
                                  )}
                                  {order.status === 'shipped' && (
                                    <Button 
                                      onClick={() => updateOrderStatus(order.id, 'delivered')}
                                      className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                      Marquer livrée
                                    </Button>
                                  )}
                                  <Button 
                                    variant="destructive"
                                    onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  >
                                    Annuler
                                  </Button>
                                </div>
                              )}

                              {/* Full status control for admin */}
                              <div className="pt-4 border-t border-border">
                                <p className="text-sm text-muted-foreground mb-3">Changer le statut</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {ALL_STATUSES.filter(s => s !== order.status).map(s => (
                                    <Button
                                      key={s}
                                      variant="secondary"
                                      className={`rounded-xl ${
                                        s === 'pending' ? 'hover:bg-amber-500/20 hover:text-amber-500' :
                                        s === 'shipped' ? 'hover:bg-blue-500/20 hover:text-blue-500' :
                                        s === 'delivered' ? 'hover:bg-green-500/20 hover:text-green-500' :
                                        'hover:bg-red-500/20 hover:text-red-500'
                                      }`}
                                      onClick={() => updateOrderStatus(order.id, s)}
                                      data-testid={`set-status-${s}-${order.id}`}
                                    >
                                      <ArrowRight className="w-4 h-4 mr-1" />
                                      {STATUS_LABELS[s]}
                                    </Button>
                                  ))}
                                </div>
                              </div>

                              {/* Status history button */}
                              <div className="flex gap-2 mt-2">
                                <Button 
                                  variant="ghost" 
                                  className="flex-1 text-muted-foreground"
                                  onClick={() => fetchOrderHistory(order.id)}
                                  data-testid={`order-history-${order.id}`}
                                >
                                  <History className="w-4 h-4 mr-2" />
                                  Historique statuts
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  className="flex-1 text-primary"
                                  onClick={() => generateInvoice(order.id)}
                                  data-testid={`generate-invoice-${order.id}`}
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  Générer facture
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Historique des statuts
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {orderHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucun changement de statut enregistré</p>
            ) : (
              <div className="space-y-3 py-4">
                {orderHistory.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        {getStatusBadge(entry.old_status)}
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        {getStatusBadge(entry.new_status)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Par <span className="font-medium text-foreground">{entry.changed_by}</span>
                        {entry.changed_by_role && <span className="text-muted-foreground"> ({entry.changed_by_role})</span>}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.changed_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrdersPage;
