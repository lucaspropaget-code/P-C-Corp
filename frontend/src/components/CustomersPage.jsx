import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
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
  Edit,
  Trash2,
  User,
  Mail,
  Phone,
  MapPin,
  ShoppingBag
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/customers`, { withCredentials: true });
      setCustomers(response.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetails = async (customerId) => {
    try {
      const response = await axios.get(`${API_URL}/api/customers/${customerId}`, { withCredentials: true });
      setSelectedCustomer(response.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const createOrUpdateCustomer = async () => {
    if (!newCustomer.name) {
      toast.error('Le nom est obligatoire');
      return;
    }

    try {
      if (editingCustomer) {
        await axios.put(`${API_URL}/api/customers/${editingCustomer.id}`, newCustomer, { withCredentials: true });
        toast.success('Client mis à jour');
      } else {
        await axios.post(`${API_URL}/api/customers`, newCustomer, { withCredentials: true });
        toast.success('Client créé');
      }
      
      setShowNewCustomer(false);
      setEditingCustomer(null);
      setNewCustomer({ name: '', email: '', phone: '', address: '', notes: '' });
      fetchCustomers();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deleteCustomer = async (customerId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/customers/${customerId}`, { withCredentials: true });
      toast.success('Client supprimé');
      fetchCustomers();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    setNewCustomer({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setShowNewCustomer(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const filteredCustomers = customers.filter(customer => 
    customer.name?.toLowerCase().includes(search.toLowerCase()) ||
    customer.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="customers-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">Gérez votre base clients</p>
        </div>
        <Dialog open={showNewCustomer} onOpenChange={(open) => {
          setShowNewCustomer(open);
          if (!open) {
            setEditingCustomer(null);
            setNewCustomer({ name: '', email: '', phone: '', address: '', notes: '' });
          }
        }}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="new-customer-button">
              <Plus className="w-5 h-5 mr-2" />
              Nouveau client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Modifier le client' : 'Ajouter un client'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="Nom complet"
                  className="bg-secondary"
                  data-testid="customer-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                  placeholder="email@exemple.com"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                  placeholder="06 12 34 56 78"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Textarea
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})}
                  placeholder="Adresse complète"
                  className="bg-secondary"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newCustomer.notes}
                  onChange={(e) => setNewCustomer({...newCustomer, notes: e.target.value})}
                  placeholder="Notes sur le client"
                  className="bg-secondary"
                />
              </div>
              <Button onClick={createOrUpdateCustomer} className="w-full btn-primary" data-testid="save-customer-button">
                {editingCustomer ? 'Mettre à jour' : 'Créer le client'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="border-border">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary"
              data-testid="customers-search"
            />
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Chargement...</div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucun client trouvé
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead className="text-right">Commandes</TableHead>
                    <TableHead className="text-right">Total dépensé</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} className="table-row-hover">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Client depuis {new Date(customer.created_at).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="w-3 h-3 text-muted-foreground" />
                              {customer.email}
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.address && (
                          <div className="flex items-start gap-1 text-sm max-w-xs">
                            <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="truncate">{customer.address}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{customer.total_orders || 0}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(customer.total_spent)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => fetchCustomerDetails(customer.id)}
                                data-testid={`view-customer-${customer.id}`}
                              >
                                <ShoppingBag className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Fiche client - {selectedCustomer?.name}</DialogTitle>
                              </DialogHeader>
                              {selectedCustomer && (
                                <div className="space-y-6 py-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">Email</p>
                                      <p>{selectedCustomer.email || '-'}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">Téléphone</p>
                                      <p>{selectedCustomer.phone || '-'}</p>
                                    </div>
                                    <div className="col-span-2">
                                      <p className="text-sm text-muted-foreground">Adresse</p>
                                      <p>{selectedCustomer.address || '-'}</p>
                                    </div>
                                    {selectedCustomer.notes && (
                                      <div className="col-span-2">
                                        <p className="text-sm text-muted-foreground">Notes</p>
                                        <p>{selectedCustomer.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-semibold mb-3">Historique des achats</h4>
                                    {selectedCustomer.orders?.length === 0 ? (
                                      <p className="text-muted-foreground">Aucune commande</p>
                                    ) : (
                                      <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {selectedCustomer.orders?.map((order) => (
                                          <div key={order.id} className="flex justify-between items-center p-3 rounded-lg bg-secondary/50">
                                            <div>
                                              <p className="font-mono text-sm">{order.order_number}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                              </p>
                                            </div>
                                            <div className="text-right">
                                              <p className="font-medium">{formatCurrency(order.total_amount)}</p>
                                              <span className={`text-xs ${
                                                order.status === 'delivered' ? 'text-green-500' :
                                                order.status === 'shipped' ? 'text-blue-500' :
                                                order.status === 'cancelled' ? 'text-red-500' : 'text-amber-500'
                                              }`}>
                                                {order.status === 'delivered' ? 'Livrée' :
                                                 order.status === 'shipped' ? 'Expédiée' :
                                                 order.status === 'cancelled' ? 'Annulée' : 'En attente'}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEdit(customer)}
                            data-testid={`edit-customer-${customer.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteCustomer(customer.id)}
                            data-testid={`delete-customer-${customer.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

export default CustomersPage;
