import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  TrendingUp, 
  Package,
  Sparkles,
  Copy,
  Loader2,
  BarChart3,
  ShoppingCart,
  Euro
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function MarketingPage() {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, trendRes] = await Promise.all([
        axios.get(`${API_URL}/api/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API_URL}/api/dashboard/revenue-trend?days=30`, { withCredentials: true })
      ]);
      setStats(statsRes.data);
      setTrend(trendRes.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="marketing-stats-page">
      <div>
        <h1 className="text-3xl font-bold">Statistiques</h1>
        <p className="text-muted-foreground mt-1">Analyse des performances de vente</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">CA du mois</p>
                <p className="text-3xl font-bold mt-1 text-primary">{formatCurrency(stats?.revenue?.month)}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Euro className="w-7 h-7 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">CA semaine</p>
                <p className="text-3xl font-bold mt-1 text-green-500">{formatCurrency(stats?.revenue?.week)}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Commandes en attente</p>
                <p className="text-3xl font-bold mt-1">{stats?.pending_orders || 0}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                <ShoppingCart className="w-7 h-7 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend Chart */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Évolution du CA (30 derniers jours)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Pas de données disponibles
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis 
                    dataKey="_id" 
                    stroke="#71717A"
                    tick={{ fill: '#71717A', fontSize: 12 }}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis 
                    stroke="#71717A"
                    tick={{ fill: '#71717A', fontSize: 12 }}
                    tickFormatter={(value) => `${value}€`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#161618', 
                      border: '1px solid #27272A',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#A1A1AA' }}
                    formatter={(value) => [formatCurrency(value), 'CA']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#FFBD11" 
                    strokeWidth={2}
                    dot={{ fill: '#FFBD11', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Products */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Produits les plus vendus
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.top_products?.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              Pas de données disponibles
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.top_products} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis type="number" stroke="#71717A" tick={{ fill: '#71717A' }} />
                  <YAxis 
                    type="category" 
                    dataKey="_id" 
                    stroke="#71717A" 
                    tick={{ fill: '#71717A', fontSize: 12 }}
                    width={150}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#161618', 
                      border: '1px solid #27272A',
                      borderRadius: '8px'
                    }}
                    formatter={(value) => [value, 'Vendus']}
                  />
                  <Bar dataKey="total_sold" fill="#FFBD11" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MarketingAIPage() {
  const [prompt, setPrompt] = useState('');
  const [contentType, setContentType] = useState('social_post');
  const [generatedContent, setGeneratedContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const generateContent = async () => {
    if (!prompt.trim()) {
      toast.error('Veuillez décrire le contenu souhaité');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');
    
    try {
      const response = await axios.post(`${API_URL}/api/ai/generate-content`, {
        prompt,
        content_type: contentType
      }, { withCredentials: true });
      
      setGeneratedContent(response.data.content);
      toast.success('Contenu généré et sauvegardé en brouillon !');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    toast.success('Copié dans le presse-papier');
  };

  const saveToSocial = async (platform) => {
    setSaving(true);
    try {
      await axios.post(`${API_URL}/api/social/posts`, {
        platform: platform,
        content: generatedContent,
        content_type: contentType,
        status: 'draft',
        ai_generated: true
      }, { withCredentials: true });
      toast.success(`Sauvegardé pour ${platform}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="marketing-ai-page">
      <div>
        <h1 className="text-3xl font-bold">Génération IA</h1>
        <p className="text-muted-foreground mt-1">Créez du contenu marketing avec l'IA</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Créer du contenu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Type de contenu</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger className="bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="social_post">Post réseaux sociaux</SelectItem>
                  <SelectItem value="description">Description produit</SelectItem>
                  <SelectItem value="email">Email marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Décrivez ce que vous voulez</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Un post Instagram pour promouvoir notre nouvelle lampe torche Tactical T1500, en mettant en avant sa puissance et sa robustesse..."
                className="bg-secondary min-h-32 form-field-large"
                data-testid="ai-prompt-input"
              />
            </div>

            <Button 
              onClick={generateContent}
              disabled={generating}
              className="w-full btn-primary text-lg py-6"
              data-testid="generate-content-button"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Générer le contenu
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Output Section */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Contenu généré</span>
              {generatedContent && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={copyToClipboard}
                  data-testid="copy-content-button"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {generatedContent ? (
              <>
                <div 
                  className="bg-secondary/50 rounded-xl p-4 min-h-48 whitespace-pre-wrap text-base leading-relaxed"
                  data-testid="generated-content"
                >
                  {generatedContent}
                </div>
                <div className="mt-4 p-4 rounded-xl bg-green-500/5 border border-green-500/20 space-y-3">
                  <p className="text-sm font-medium text-green-500">Sauvegardé automatiquement en brouillon (Instagram)</p>
                  <p className="text-xs text-muted-foreground">Dupliquer vers une autre plateforme :</p>
                  <div className="flex gap-2">
                    {['facebook', 'tiktok', 'youtube'].map(p => (
                      <Button key={p} variant="secondary" size="sm" className="rounded-full capitalize" onClick={() => saveToSocial(p)} disabled={saving}>
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-secondary/50 rounded-xl p-4 min-h-64 flex items-center justify-center text-muted-foreground">
                Le contenu généré apparaîtra ici
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <h4 className="font-semibold mb-3">Conseils pour de meilleurs résultats</h4>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Soyez précis sur le produit, ses caractéristiques et le ton souhaité</li>
            <li>• Mentionnez le public cible (professionnels, particuliers, passionnés outdoor...)</li>
            <li>• Indiquez si vous voulez des emojis, des hashtags, une longueur spécifique</li>
            <li>• Pour les posts Instagram, précisez le nombre de hashtags souhaité</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default MarketingPage;
