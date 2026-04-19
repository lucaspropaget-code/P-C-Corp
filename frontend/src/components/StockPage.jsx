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
  Package,
  AlertTriangle,
  ArrowUpDown,
  History
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function StockPage() {
  const [products, setProducts] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [newProduct, setNewProduct] = useState({
    name: '', sku: '', description: '', price: '', quantity: '', alert_threshold: '5', category: 'lampe_torche', photo_url: '', weight: '', length: '', width: '', height: '', stock_location: 'leac'
  });
  const [movement, setMovement] = useState({
    product_id: '', quantity_change: '', reason: '', movement_type: 'normal'
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/products`, { withCredentials: true });
      setProducts(response.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const fetchStockHistory = async (productId = '') => {
    try {
      const url = productId 
        ? `${API_URL}/api/products/stock-history?product_id=${productId}`
        : `${API_URL}/api/products/stock-history`;
      const response = await axios.get(url, { withCredentials: true });
      setStockHistory(response.data);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const createProduct = async () => {
    if (!newProduct.name || !newProduct.sku || !newProduct.price || !newProduct.quantity) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      const data = {
        ...newProduct,
        price: parseFloat(newProduct.price),
        quantity: parseInt(newProduct.quantity),
        alert_threshold: parseInt(newProduct.alert_threshold) || 5,
        weight: newProduct.weight ? parseFloat(newProduct.weight) : null,
        length: newProduct.length ? parseFloat(newProduct.length) : null,
        width: newProduct.width ? parseFloat(newProduct.width) : null,
        height: newProduct.height ? parseFloat(newProduct.height) : null,
      };
      
      if (editingProduct) {
        await axios.put(`${API_URL}/api/products/${editingProduct.id}`, data, { withCredentials: true });
        toast.success('Produit mis à jour');
      } else {
        await axios.post(`${API_URL}/api/products`, data, { withCredentials: true });
        toast.success('Produit créé');
      }
      
      setShowNewProduct(false);
      setEditingProduct(null);
      setNewProduct({
        name: '', sku: '', description: '', price: '', quantity: '', alert_threshold: '5', category: 'lampe_torche', photo_url: '', weight: '', length: '', width: '', height: '', stock_location: 'leac'
      });
      fetchProducts();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/products/${productId}`, { withCredentials: true });
      toast.success('Produit supprimé');
      fetchProducts();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const recordMovement = async () => {
    if (!movement.product_id || !movement.quantity_change || !movement.reason) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/products/stock-movement`, {
        ...movement,
        quantity_change: parseInt(movement.quantity_change)
      }, { withCredentials: true });
      
      toast.success('Mouvement enregistré');
      setShowMovement(false);
      setMovement({ product_id: '', quantity_change: '', reason: '', movement_type: 'normal' });
      fetchProducts();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setNewProduct({
      name: product.name, sku: product.sku, description: product.description || '', price: product.price.toString(), quantity: product.quantity.toString(), alert_threshold: product.alert_threshold.toString(), category: product.category || 'lampe_torche', photo_url: product.photo_url || '', weight: product.weight?.toString() || '', length: product.length?.toString() || '', width: product.width?.toString() || '', height: product.height?.toString() || '', stock_location: product.stock_location || 'leac'
    });
    setShowNewProduct(true);
  };

  const openHistory = async (productId) => {
    setSelectedProductId(productId);
    await fetchStockHistory(productId);
    setShowHistory(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const filteredProducts = products.filter(product => 
    product.name?.toLowerCase().includes(search.toLowerCase()) ||
    product.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const criticalStock = products.filter(p => p.quantity <= p.alert_threshold);

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="stock-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des stocks</h1>
          <p className="text-muted-foreground mt-1">Gérez vos produits et inventaire</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showMovement} onOpenChange={setShowMovement}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="rounded-full" data-testid="stock-movement-button">
                <ArrowUpDown className="w-5 h-5 mr-2" />
                Mouvement stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enregistrer un mouvement de stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Produit</Label>
                  <select 
                    className="w-full p-3 rounded-xl bg-secondary border border-border"
                    value={movement.product_id}
                    onChange={(e) => setMovement({...movement, product_id: e.target.value})}
                  >
                    <option value="">Sélectionner un produit</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Quantité (+/-)</Label>
                  <Input
                    type="number"
                    value={movement.quantity_change}
                    onChange={(e) => setMovement({...movement, quantity_change: e.target.value})}
                    placeholder="Ex: 10 ou -5"
                    className="bg-secondary"
                  />
                  <p className="text-xs text-muted-foreground">Positif = entrée, Négatif = sortie</p>
                </div>
                <div className="space-y-2">
                  <Label>Type de mouvement</Label>
                  <select className="w-full p-3 rounded-xl bg-secondary border border-border" value={movement.movement_type} onChange={(e) => setMovement({...movement, movement_type: e.target.value})}>
                    <option value="normal">Normal (vente/achat/inventaire)</option>
                    <option value="gift_prospection">Cadeau / Prospection</option>
                  </select>
                  {movement.movement_type === 'gift_prospection' && <p className="text-xs text-amber-500">Les cadeaux/prospection sortent du stock sans impact financier</p>}
                </div>
                <div className="space-y-2">
                  <Label>Raison</Label>
                  <Input
                    value={movement.reason}
                    onChange={(e) => setMovement({...movement, reason: e.target.value})}
                    placeholder="Ex: Réception fournisseur, Inventaire..."
                    className="bg-secondary"
                  />
                </div>
                <Button onClick={recordMovement} className="w-full btn-primary">
                  Enregistrer
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showNewProduct} onOpenChange={(open) => {
            setShowNewProduct(open);
            if (!open) {
              setEditingProduct(null);
              setNewProduct({
                name: '',
                sku: '',
                description: '',
                price: '',
                quantity: '',
                alert_threshold: '5',
                category: ''
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button className="btn-primary" data-testid="new-product-button">
                <Plus className="w-5 h-5 mr-2" />
                Nouveau produit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                      placeholder="Assault58 Pro X1000"
                      className="bg-secondary"
                      data-testid="product-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU *</Label>
                    <Input
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                      placeholder="A58-PX1000"
                      className="bg-secondary"
                      disabled={!!editingProduct}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                    placeholder="Description du produit"
                    className="bg-secondary"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Prix (€) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newProduct.price}
                      onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                      placeholder="89.90"
                      className="bg-secondary"
                      data-testid="product-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantité *</Label>
                    <Input
                      type="number"
                      value={newProduct.quantity}
                      onChange={(e) => setNewProduct({...newProduct, quantity: e.target.value})}
                      placeholder="50"
                      className="bg-secondary"
                      data-testid="product-quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Seuil alerte</Label>
                    <Input
                      type="number"
                      value={newProduct.alert_threshold}
                      onChange={(e) => setNewProduct({...newProduct, alert_threshold: e.target.value})}
                      placeholder="5"
                      className="bg-secondary"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <select className="w-full p-3 rounded-xl bg-secondary border border-border" value={newProduct.category} onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}>
                    <option value="lampe_torche">Lampe torche</option>
                    <option value="accessoire">Accessoire</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Localisation stock</Label>
                  <select className="w-full p-3 rounded-xl bg-secondary border border-border" value={newProduct.stock_location} onChange={(e) => setNewProduct({...newProduct, stock_location: e.target.value})}>
                    <option value="leac">LÉAC</option>
                    <option value="andre">André</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-2"><Label>Poids (kg)</Label><Input type="number" step="0.01" value={newProduct.weight} onChange={e => setNewProduct({...newProduct, weight: e.target.value})} className="bg-secondary" placeholder="0.35" /></div>
                  <div className="space-y-2"><Label>L (cm)</Label><Input type="number" step="0.1" value={newProduct.length} onChange={e => setNewProduct({...newProduct, length: e.target.value})} className="bg-secondary" /></div>
                  <div className="space-y-2"><Label>l (cm)</Label><Input type="number" step="0.1" value={newProduct.width} onChange={e => setNewProduct({...newProduct, width: e.target.value})} className="bg-secondary" /></div>
                  <div className="space-y-2"><Label>H (cm)</Label><Input type="number" step="0.1" value={newProduct.height} onChange={e => setNewProduct({...newProduct, height: e.target.value})} className="bg-secondary" /></div>
                </div>
                <Button onClick={createProduct} className="w-full btn-primary" data-testid="save-product-button">
                  {editingProduct ? 'Mettre à jour' : 'Créer le produit'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Critical Stock Alert */}
      {criticalStock.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <span className="font-semibold text-amber-500">
                {criticalStock.length} produit(s) en stock critique
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {criticalStock.map(p => (
                <Badge key={p.id} variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                  {p.name}: {p.quantity} restants
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card className="border-border">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Rechercher par nom ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary"
              data-testid="stock-search"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Chargement...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucun produit trouvé
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Seuil</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="table-row-hover">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Package className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{product.description}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                      <TableCell>
                        {product.category && (
                          <Badge variant="secondary">{product.category === 'lampe_torche' ? 'Lampe torche' : product.category === 'accessoire' ? 'Accessoire' : product.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{product.stock_location === 'leac' ? 'LÉAC' : product.stock_location === 'andre' ? 'André' : product.stock_location || '-'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(product.price)}</TableCell>
                      <TableCell className="text-right">
                        <span className={product.quantity <= product.alert_threshold ? 'text-amber-500 font-bold' : ''}>
                          {product.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{product.alert_threshold}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openHistory(product.id)}
                            title="Historique"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEdit(product)}
                            data-testid={`edit-product-${product.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteProduct(product.id)}
                            data-testid={`delete-product-${product.id}`}
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

      {/* Stock History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique des mouvements</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {stockHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Aucun mouvement enregistré</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Mouvement</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead>Par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockHistory.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        {new Date(h.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>{h.product_name}</TableCell>
                      <TableCell className="text-right">
                        <span className={h.quantity_change > 0 ? 'text-green-500' : 'text-red-500'}>
                          {h.quantity_change > 0 ? '+' : ''}{h.quantity_change}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">
                          ({h.previous_quantity} → {h.new_quantity})
                        </span>
                      </TableCell>
                      <TableCell>{h.reason}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{h.user_name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StockPage;
