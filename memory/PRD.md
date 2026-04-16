# Assault58 Back-Office - PRD

## Problem Statement
Back-office web complet pour Assault58, PME e-commerce vendant des lampes torches tactiques sur WooCommerce.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Recharts
- **Backend**: FastAPI + MongoDB + JWT Auth
- **AI Integration**: OpenAI GPT-5.2 via Emergent LLM Key

## User Personas
1. **Admin** - Gestion complète (commandes, stocks, clients, comptabilité, paramètres)
2. **Stockeur (Léac)** - Vue expéditions uniquement + bouton "Marquer comme expédié"
3. **Marketing** - Stats de vente + Génération contenu IA

## What's Been Implemented (April 2026)
- Authentication JWT 3 rôles (admin, stockeur, marketing)
- Dashboard Admin (CA jour/semaine/mois, alertes stock, dernières commandes)
- Gestion commandes (liste, filtres, détail, création manuelle)
- Gestion stocks (CRUD produits, mouvements, historique, seuils alerte)
- Gestion clients (CRUD, fiche détaillée, historique achats)
- Comptabilité (saisie dépenses, résumé mensuel, export Excel)
- Configuration WooCommerce (Consumer Key/Secret/URL)
- Vue Stockeur simplifiée (commandes à expédier uniquement)
- Stats Marketing (graphiques CA, produits les plus vendus)
- Génération contenu IA (posts sociaux, descriptions produit, emails)
- Design noir/anthracite avec accents dorés #FFBD11

## Prioritized Backlog
### P0 (Critique)
- [x] Correction ObjectId serialization (endpoints POST)
- [x] Correction CORS pour authentification

### P1 (Important)
- [ ] Synchronisation automatique WooCommerce (import commandes/stocks)
- [ ] Rapprochement bancaire avancé

### P2 (Nice to have)
- [ ] Notifications push stock critique
- [ ] Tableau de bord réseaux sociaux
- [ ] Export multi-format (CSV, PDF)
- [ ] Historique des générations IA
