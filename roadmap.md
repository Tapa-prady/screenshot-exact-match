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
- [ ] Test de bout en bout avec de vrais comptes et de vrais trajets.
- [ ] Restreindre en base ce qu’une passagère peut modifier sur sa réservation (prix, statut) : migration SQL à appliquer.
- [ ] Purge automatique des positions (24 h) et des messages IA (30 jours).
- [ ] Prévenir le conducteur (notification) quand la pluie est annoncée.
- [ ] Publication en application installable (PWA ou Capacitor).
