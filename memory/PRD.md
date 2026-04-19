# Assault58 Back-Office - PRD

## Architecture
- Frontend: React + Tailwind + Shadcn UI + Recharts + Leaflet/OpenStreetMap
- Backend: FastAPI + MongoDB + JWT Auth + Emergent Object Storage
- AI: OpenAI GPT-5.2 via Emergent LLM Key

## 4 Rôles
1. Admin (accès total + marketing), 2. Stockeur (expéditions + bordereaux), 3. Marketing (stats+IA+social), 4. Comptable (lecture seule finances)

## Phase 1 Complete (April 2026)
### Commandes enrichies
- Email et téléphone obligatoires, adresses livraison + facturation séparées
- Champ Source (Site/Salon/Autre), billing auto=livraison si vide

### Clients enrichis
- Statuts : Particulier/Pro/Gendarmerie/Police/École police/Fédération chasse/Autre
- Fiche complète au clic : infos + commandes + notes/problèmes + badge client fidèle (>3 cmd)
- Carte interactive OpenStreetMap avec marqueurs clients géolocalisés
- 8 clients de test répartis sur la France

### Stocks enrichis
- Poids, dimensions (L×l×H), localisation (LÉAC/André), catégorie (Lampe torche/Accessoire/Autre)
- Photo produit via Emergent Object Storage
- Mouvement type Cadeau/Prospection tracé séparément
- 7 produits dont 2 accessoires, 10 mouvements dont 3 cadeaux

### Facturation enrichie
- TVA 20% auto sur produits + frais expédition, mode de paiement, source vente
- Adresses facturation/livraison distinctes, sélection client existant
- Import CSV + PDF avec extraction IA

### Expédition (Boxtal simulé)
- Stockeur choisit Colissimo Domicile/Point Relais par commande
- Génération bordereau simulée (tracking, label), prêt pour API Boxtal
- Config Boxtal dans Paramètres Admin

## Phase 2 (À faire)
- Calendrier éditorial marketing + campagnes publicitaires + budgets
- Agenda professionnel + synchro Google Calendar
- Photos produits upload fonctionnel
