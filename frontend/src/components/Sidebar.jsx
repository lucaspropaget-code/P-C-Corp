import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Calculator, 
  Settings, 
  LogOut,
  Flashlight,
  TrendingUp,
  Sparkles,
  Truck,
  RefreshCw,
  Landmark,
  Share2,
  FileText,
  Receipt,
  Eye
} from 'lucide-react';
import { Button } from './ui/button';

const adminLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/orders', icon: ShoppingCart, label: 'Commandes' },
  { to: '/stock', icon: Package, label: 'Stocks' },
  { to: '/customers', icon: Users, label: 'Clients' },
  { to: '/invoices', icon: FileText, label: 'Facturation' },
  { to: '/accounting', icon: Calculator, label: 'Comptabilité' },
  { to: '/bank', icon: Landmark, label: 'Banque' },
  { to: '/agenda', icon: LayoutDashboard, label: 'Agenda' },
  { to: '/woo-sync', icon: RefreshCw, label: 'Synchro WooCommerce' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

const marketingLinks = [
  { to: '/marketing', icon: TrendingUp, label: 'Statistiques' },
  { to: '/marketing/editorial', icon: LayoutDashboard, label: 'Calendrier éditorial' },
  { to: '/marketing/ai', icon: Sparkles, label: 'Génération IA' },
  { to: '/marketing/social', icon: Share2, label: 'Réseaux sociaux' },
];

const stockeurLinks = [
  { to: '/stockeur', icon: Truck, label: 'Expéditions' },
];

const comptableLinks = [
  { to: '/comptable', icon: Eye, label: 'Espace Comptable' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getLinks = () => {
    if (user?.role === 'admin') return [...adminLinks, ...marketingLinks];
    if (user?.role === 'marketing') return marketingLinks;
    if (user?.role === 'stockeur') return stockeurLinks;
    if (user?.role === 'comptable') return comptableLinks;
    return [];
  };

  const links = getLinks();

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <Flashlight className="w-8 h-8 text-primary" />
          <span className="logo-text text-xl">
            Assault<span className="text-primary">58</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Back-Office</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            data-testid={`nav-${link.to.replace('/', '')}`}
          >
            <link.icon className="w-5 h-5" />
            <span className="text-base">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info & Logout */}
      <div className="p-4 border-t border-border">
        <div className="px-4 py-3 mb-3">
          <p className="font-medium text-sm truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          data-testid="logout-button"
        >
          <LogOut className="w-5 h-5" />
          Déconnexion
        </Button>
      </div>
    </aside>
  );
}

export default Sidebar;
