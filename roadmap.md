# Rafiq

- [x] Étapes 5–6 : moteur de prix et de rendez-vous sur l’itinéraire, vérifié par des tests.
- [x] Écran de recherche : position GPS ou adresse libre, arrivée, date et heure d’arrivée, vraie carte.
- [x] Connecter les itinéraires voiture et piéton aux calculs, sans simulation.
- [x] Comptes étudiants @etu.uae.ac.ma (`/auth`).
- [x] Publier un trajet (`/publier`) : l’itinéraire exact est enregistré et vérifié à chaque recherche.
- [x] Réserver depuis la recherche : le serveur recalcule rendez-vous et prix avant d’enregistrer.
- [x] Mes trajets (`/mes-trajets`) : réservations, annulation, trajets publiés, proches de confiance.
- [x] Voyager (`/trajet/$bookingId`) : position partagée en direct avec l’autre personne, bouton SOS, numéros d’urgence, SMS/WhatsApp aux proches.
- [x] Rafiq IA (`/assistant`) : cherche, propose de réserver, météo. Fonctionne sans clé (mode simple) ; avec `GEMINI_API_KEY` (secret serveur) il comprend les phrases libres.
- [x] Sécurité en base (`drizzle/migrations/0001_security_guards.sql`) : note et vérification protégées, réservation verrouillée sauf statut, avis limités à l’autre partie, purge des positions (24 h) et des messages IA (30 jours). Testée sur Postgres 16 ; **à appliquer une fois sur la base Supabase**.
- [x] Sécurité des accès RLS (`drizzle/migrations/0002_security_access_rules.sql`) : le serveur (service role) recherche et valide les trajets à la place de l’utilisateur ; RLS restreint la lecture des trajets (conducteur / passagers inscrits), profils (soi-même ou covoitureurs) et avis (parties prenantes). Résout les alertes Lovable.
- [x] Version installable : manifeste, icônes, service worker prudent (page hors ligne), `lang="fr"`.
- [x] Appliquer `0001_security_guards.sql` et `0002_security_access_rules.sql` sur la base Supabase de production.
- [x] Prévenir le conducteur et le passager (notifications météo et alertes pluie en direct) quand la pluie est annoncée.
- [x] Test de bout en bout avec de vrais comptes et de vrais trajets (`src/test/end-to-end-journey.test.ts`).
- [x] Générer un APK depuis l’adresse publiée (PWABuilder ou Bubblewrap avec `twa-manifest.json`, `assetlinks.json` et bouton d’installation dans l’interface).
- [x] Assistant complet Google AI Studio : activation via secret serveur `GEMINI_API_KEY` avec protection contre le dépassement de quota gratuit (fallback local automatique).
- [ ] Prix et point de rendez-vous : aujourd’hui calculés par le serveur mais enregistrés avec les droits de la personne connectée ; à verrouiller avant tout paiement réel.
