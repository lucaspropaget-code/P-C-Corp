import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Settings as SettingsIcon,
  Store,
  Key,
  Link,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function SettingsPage() {
  const [wooConfig, setWooConfig] = useState({
    store_url: '',
    consumer_key: '',
    consumer_secret: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/settings/woocommerce`, { withCredentials: true });
      if (response.data) {
        setWooConfig(response.data);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!wooConfig.store_url || !wooConfig.consumer_key || !wooConfig.consumer_secret) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API_URL}/api/settings/woocommerce`, wooConfig, { withCredentials: true });
      toast.success('Configuration sauvegardée');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground mt-1">Configuration de votre back-office</p>
      </div>

      {/* WooCommerce Configuration */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            Connexion WooCommerce
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-secondary/50 rounded-xl p-4">
            <h4 className="font-medium mb-2">Comment obtenir les clés API WooCommerce ?</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Connectez-vous à votre admin WordPress (assault58.com/wp-admin)</li>
              <li>Allez dans WooCommerce → Réglages → Avancé → API REST</li>
              <li>Cliquez sur "Ajouter une clé"</li>
              <li>Donnez un nom à la clé et sélectionnez "Lecture/Écriture"</li>
              <li>Copiez la Consumer Key et la Consumer Secret</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="w-4 h-4" />
                URL de la boutique *
              </Label>
              <Input
                value={wooConfig.store_url}
                onChange={(e) => setWooConfig({...wooConfig, store_url: e.target.value})}
                placeholder="https://assault58.com"
                className="bg-secondary form-field-large"
                data-testid="woo-store-url"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Consumer Key *
              </Label>
              <Input
                value={wooConfig.consumer_key}
                onChange={(e) => setWooConfig({...wooConfig, consumer_key: e.target.value})}
                placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="bg-secondary form-field-large font-mono"
                data-testid="woo-consumer-key"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Consumer Secret *
              </Label>
              <Input
                type="password"
                value={wooConfig.consumer_secret}
                onChange={(e) => setWooConfig({...wooConfig, consumer_secret: e.target.value})}
                placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="bg-secondary form-field-large font-mono"
                data-testid="woo-consumer-secret"
              />
              {wooConfig.consumer_secret && wooConfig.consumer_secret.startsWith('***') && (
                <p className="text-xs text-muted-foreground">Secret masqué - entrez une nouvelle valeur pour modifier</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              {wooConfig.store_url && wooConfig.consumer_key ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Configuration enregistrée</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">Configuration incomplète</span>
                </>
              )}
            </div>
            <Button 
              onClick={saveConfig} 
              disabled={saving}
              className="btn-primary"
              data-testid="save-woo-config"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <SettingsIcon className="w-6 h-6 text-primary flex-shrink-0" />
            <div>
              <h4 className="font-semibold">Synchronisation automatique</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Une fois configurée, la connexion WooCommerce permettra de synchroniser automatiquement 
                les commandes et les stocks entre votre site e-commerce et ce back-office.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <strong>Note :</strong> La synchronisation sera activée dans une prochaine mise à jour.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsPage;
