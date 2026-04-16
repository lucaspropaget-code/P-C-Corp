# Assault58 Back-Office - PRD

## Problem Statement
Back-office web complet pour Assault58, PME e-commerce vendant des lampes torches tactiques sur WooCommerce.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Recharts
- **Backend**: FastAPI + MongoDB + JWT Auth
- **AI Integration**: OpenAI GPT-5.2 via Emergent LLM Key

## User Personas
1. **Admin** - Gestion complète
2. **Stockeur (Léac)** - Expéditions uniquement
3. **Marketing** - Stats + IA + Social

## What's Been Implemented (April 2026)

### Phase 1 (Initial MVP)
- Auth JWT 3 rôles, Dashboard Admin, Commandes CRUD, Stocks CRUD, Clients CRUD
- Comptabilité + Export Excel, Config WooCommerce, Vue Stockeur, Stats Marketing, Génération IA

### Phase 2 (Améliorations - 16 avril 2026)
- **Synchro WooCommerce** : Bouton sync manuelle (commandes+produits) + webhook temps réel + historique des synchros
- **Rapprochement bancaire avancé** : Import CSV bancaire + saisie manuelle + matching transactions avec commandes/dépenses + résumé rapprochement (solde banque vs système + écart)
- **Tableau de bord réseaux sociaux** : 4 plateformes (Facebook, Instagram, TikTok, YouTube) + métriques manuelles (likes, commentaires, partages, vues, portée) + historique contenus IA + sauvegarde post IA vers social + filtres + graphique engagement

## Prioritized Backlog
### P1
- [ ] Synchronisation WooCommerce automatique périodique (cron)
- [ ] Notifications email alertes stock critique
- [ ] Export multi-format (CSV, PDF)

### P2
- [ ] Connexion API réseaux sociaux (auto-publication)
- [ ] Import OFX/QIF pour rapprochement bancaire
- [ ] Dashboard analytics avancé avec comparaison périodes
