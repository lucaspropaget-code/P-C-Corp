import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
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
  Edit,
  Trash2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Play,
  Users,
  BarChart3,
  Sparkles,
  Copy,
  Check,
  Send
} from 'lucide-react';
import { formatApiErrorDetail } from '../context/AuthContext';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLATFORMS = [
  { value: 'facebook', label: 'Facebook', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { value: 'instagram', label: 'Instagram', color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { value: 'tiktok', label: 'TikTok', color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { value: 'youtube', label: 'YouTube', color: 'text-red-500', bg: 'bg-red-500/10' }
];

export function SocialDashboardPage() {
  const [posts, setPosts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNewPost, setShowNewPost] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [metricsPost, setMetricsPost] = useState(null);
  const [metricsValues, setMetricsValues] = useState({ likes: 0, comments: 0, shares: 0, views: 0, reach: 0 });
  const [newPost, setNewPost] = useState({
    platform: 'instagram',
    content: '',
    content_type: 'social_post',
    status: 'draft',
    scheduled_date: '',
    ai_generated: false
  });

  useEffect(() => {
    fetchData();
  }, [filterPlatform, filterStatus]);

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (filterPlatform !== 'all') params.append('platform', filterPlatform);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      const [postsRes, metricsRes] = await Promise.all([
        axios.get(`${API_URL}/api/social/posts?${params}`, { withCredentials: true }),
        axios.get(`${API_URL}/api/social/metrics`, { withCredentials: true })
      ]);
      setPosts(postsRes.data);
      setMetrics(metricsRes.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const createPost = async () => {
    if (!newPost.content.trim()) { toast.error('Contenu requis'); return; }
    try {
      await axios.post(`${API_URL}/api/social/posts`, newPost, { withCredentials: true });
      toast.success('Post créé');
      setShowNewPost(false);
      setNewPost({ platform: 'instagram', content: '', content_type: 'social_post', status: 'draft', scheduled_date: '', ai_generated: false });
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const updatePostStatus = async (postId, status) => {
    try {
      await axios.put(`${API_URL}/api/social/posts/${postId}`, { status }, { withCredentials: true });
      toast.success(status === 'published' ? 'Marqué comme publié' : 'Remis en brouillon');
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const updateMetrics = async () => {
    if (!metricsPost) return;
    try {
      await axios.put(`${API_URL}/api/social/posts/${metricsPost.id}/metrics`, metricsValues, { withCredentials: true });
      toast.success('Métriques mises à jour');
      setMetricsPost(null);
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm('Supprimer ce post ?')) return;
    try {
      await axios.delete(`${API_URL}/api/social/posts/${postId}`, { withCredentials: true });
      toast.success('Post supprimé');
      fetchData();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const openMetrics = (post) => {
    setMetricsPost(post);
    setMetricsValues(post.metrics || { likes: 0, comments: 0, shares: 0, views: 0, reach: 0 });
  };

  const getPlatformInfo = (platform) => PLATFORMS.find(p => p.value === platform) || PLATFORMS[0];

  const chartData = metrics?.by_platform?.map(p => ({
    name: getPlatformInfo(p._id).label,
    likes: p.total_likes,
    comments: p.total_comments,
    shares: p.total_shares,
    views: p.total_views
  })) || [];

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="social-dashboard-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Réseaux sociaux</h1>
          <p className="text-muted-foreground mt-1">Gérez vos publications et suivez vos performances</p>
        </div>
        <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="new-social-post-button">
              <Plus className="w-5 h-5 mr-2" /> Nouveau post
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Créer un post</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plateforme</Label>
                  <Select value={newPost.platform} onValueChange={(v) => setNewPost({...newPost, platform: v})}>
                    <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Statut</Label>
                  <Select value={newPost.status} onValueChange={(v) => setNewPost({...newPost, status: v})}>
                    <SelectTrigger className="bg-secondary"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Brouillon</SelectItem>
                      <SelectItem value="published">Publié</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contenu</Label>
                <Textarea value={newPost.content} onChange={(e) => setNewPost({...newPost, content: e.target.value})} placeholder="Rédigez votre post..." className="bg-secondary min-h-32" data-testid="social-post-content" />
              </div>
              <div className="space-y-2">
                <Label>Date de publication (optionnel)</Label>
                <Input type="date" value={newPost.scheduled_date} onChange={(e) => setNewPost({...newPost, scheduled_date: e.target.value})} className="bg-secondary" />
              </div>
              <Button onClick={createPost} className="w-full btn-primary" data-testid="save-social-post-button">Enregistrer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="dashboard">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="posts">Publications</TabsTrigger>
          <TabsTrigger value="ai-history">Contenus IA</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          {/* Global Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="stat-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{metrics?.totals?.total_posts || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Posts total</p>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-green-500">{metrics?.totals?.published || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Publiés</p>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-amber-500">{metrics?.totals?.drafts || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Brouillons</p>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-purple-500">{metrics?.totals?.ai_generated || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Générés par IA</p>
              </CardContent>
            </Card>
          </div>

          {/* Platform Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLATFORMS.map(platform => {
              const data = metrics?.by_platform?.find(p => p._id === platform.value) || {};
              return (
                <Card key={platform.value} className="border-border">
                  <CardContent className="pt-6">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${platform.bg} mb-4`}>
                      <span className={`font-semibold ${platform.color}`}>{platform.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-red-400" />
                        <span>{data.total_likes || 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-blue-400" />
                        <span>{data.total_comments || 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-green-400" />
                        <span>{data.total_shares || 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-purple-400" />
                        <span>{data.total_views || 0}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">{data.posts_count || 0} publications</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Engagement par plateforme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                      <XAxis dataKey="name" stroke="#71717A" tick={{ fill: '#71717A' }} />
                      <YAxis stroke="#71717A" tick={{ fill: '#71717A' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#161618', border: '1px solid #27272A', borderRadius: '8px' }} />
                      <Bar dataKey="likes" fill="#EF4444" name="Likes" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comments" fill="#3B82F6" name="Commentaires" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="shares" fill="#22C55E" name="Partages" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Posts Tab */}
        <TabsContent value="posts" className="space-y-4 mt-6">
          <div className="flex gap-2 flex-wrap">
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-40 bg-secondary"><SelectValue placeholder="Plateforme" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-secondary"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="published">Publié</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {posts.length === 0 ? (
              <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">Aucun post. Créez-en un ou générez du contenu IA.</CardContent></Card>
            ) : posts.map(post => {
              const platform = getPlatformInfo(post.platform);
              return (
                <Card key={post.id} className="border-border hover:border-primary/20 transition-colors">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${platform.bg} ${platform.color}`}>{platform.label}</span>
                          {post.status === 'published' ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Publié</Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Brouillon</Badge>
                          )}
                          {post.ai_generated && <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/30"><Sparkles className="w-3 h-3 mr-1" />IA</Badge>}
                        </div>
                        <p className="text-sm whitespace-pre-wrap line-clamp-3">{post.content}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span>{new Date(post.created_at).toLocaleDateString('fr-FR')}</span>
                          {post.metrics && post.status === 'published' && (
                            <div className="flex gap-3">
                              <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.metrics.likes || 0}</span>
                              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.metrics.comments || 0}</span>
                              <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{post.metrics.shares || 0}</span>
                              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.metrics.views || 0}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {post.status === 'draft' ? (
                          <Button variant="ghost" size="sm" onClick={() => updatePostStatus(post.id, 'published')} title="Marquer publié">
                            <Send className="w-4 h-4 text-green-500" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => openMetrics(post)} title="Métriques">
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(post.content); toast.success('Contenu copié'); }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deletePost(post.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* AI History Tab */}
        <TabsContent value="ai-history" className="space-y-4 mt-6">
          {posts.filter(p => p.ai_generated).length === 0 ? (
            <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground">Aucun contenu généré par IA. Utilisez la page "Génération IA" pour créer du contenu.</CardContent></Card>
          ) : posts.filter(p => p.ai_generated).map(post => {
            const platform = getPlatformInfo(post.platform);
            return (
              <Card key={post.id} className="border-border border-l-2 border-l-purple-500">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    <span className="text-xs text-purple-400 font-medium">Généré par IA</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${platform.bg} ${platform.color}`}>{platform.label}</span>
                    {post.status === 'published' ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Publié</Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Brouillon</Badge>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">Créé le {new Date(post.created_at).toLocaleString('fr-FR')}</p>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Metrics Dialog */}
      <Dialog open={!!metricsPost} onOpenChange={(open) => !open && setMetricsPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mettre à jour les métriques</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Heart className="w-4 h-4 text-red-400" /> Likes</Label>
                <Input type="number" value={metricsValues.likes} onChange={(e) => setMetricsValues({...metricsValues, likes: parseInt(e.target.value) || 0})} className="bg-secondary" data-testid="metrics-likes" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-blue-400" /> Commentaires</Label>
                <Input type="number" value={metricsValues.comments} onChange={(e) => setMetricsValues({...metricsValues, comments: parseInt(e.target.value) || 0})} className="bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Share2 className="w-4 h-4 text-green-400" /> Partages</Label>
                <Input type="number" value={metricsValues.shares} onChange={(e) => setMetricsValues({...metricsValues, shares: parseInt(e.target.value) || 0})} className="bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Eye className="w-4 h-4 text-purple-400" /> Vues</Label>
                <Input type="number" value={metricsValues.views} onChange={(e) => setMetricsValues({...metricsValues, views: parseInt(e.target.value) || 0})} className="bg-secondary" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Portée (reach)</Label>
                <Input type="number" value={metricsValues.reach} onChange={(e) => setMetricsValues({...metricsValues, reach: parseInt(e.target.value) || 0})} className="bg-secondary" />
              </div>
            </div>
            <Button onClick={updateMetrics} className="w-full btn-primary" data-testid="save-metrics-button">Enregistrer les métriques</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SocialDashboardPage;
