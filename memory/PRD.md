# Assault58 Back-Office - PRD

## Architecture
- Frontend: React + Tailwind + Shadcn UI + Recharts
- Backend: FastAPI + MongoDB + JWT Auth
- AI: OpenAI GPT-5.2 via Emergent LLM Key

## 4 Rôles
1. Admin (accès complet), 2. Stockeur (expéditions), 3. Marketing (stats+IA+social), 4. Comptable (lecture seule finances)

## Implemented (April 2026)
- Auth JWT 4 rôles, Dashboard, Commandes CRUD + statut libre + historique
- Stocks CRUD, Clients CRUD, Comptabilité + Export Excel
- Facturation ventes (FA-2026-XXXX) + PDF + achats (FAA-2026-XXXX)
- Import CSV + Import PDF avec extraction IA
- Rapprochement bancaire (import CSV, matching, verrouillage)
- Synchro WooCommerce (manuelle + webhook temps réel)
- Social Dashboard (FB/IG/TikTok/YouTube) + Génération IA + auto-save
- Génération auto factures depuis commandes (statut "delivered" + bouton manuel)
- Relances impayés IA (J+7 rappel, J+14 relance, J+30 mise en demeure) - simulées, prêt pour n8n
- Espace Comptable (lecture seule + export Excel complet)
- Gestion compte comptable dans Paramètres Admin
