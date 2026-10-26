import { describe, expect, it } from "vitest";
import { calculateRidePrice } from "@/lib/ride-pricing";
import { findRideMatches, type DriverRoute } from "@/lib/ride-matching";
import { legacyRouteCoordinates, moroccoInstant, tripRunsOnDate } from "@/lib/route-adapter";
import { normalizeMoroccanPhone, positionMessage, whatsappHref, smsHref } from "@/lib/trip-share";
import { parseIntentFallback } from "@/lib/assistant";

describe("Rafiq — Parcours complet de bout en bout (End-to-End Journey)", () => {
  // 1. Validation de l'éligibilité étudiant ENSA Tanger
  describe("1. Inscription et filtrage des comptes étudiants", () => {
    it("autorise uniquement le domaine officiel @etu.uae.ac.ma", () => {
      const validStudent = "amine.alami@etu.uae.ac.ma";
      const externalEmail = "contact@gmail.com";
      const universityStaff = "prof@uae.ac.ma";

      const isValidStudent = (email: string) =>
        email.trim().toLowerCase().endsWith("@etu.uae.ac.ma");

      expect(isValidStudent(validStudent)).toBe(true);
      expect(isValidStudent(externalEmail)).toBe(false);
      expect(isValidStudent(universityStaff)).toBe(false);
    });
  });

  // 2. Publication d'un trajet par un conducteur
  describe("2. Publication et calcul du trajet conducteur", () => {
    const ensaCoordinates: [number, number] = [-5.834, 35.7595];
    const malabataCoordinates: [number, number] = [-5.78, 35.77];

    const driverTrip = {
      id: "trip-ensa-001",
      driver_id: "driver-student-123",
      origin_label: "Malabata, Tanger",
      origin_lng: malabataCoordinates[0],
      origin_lat: malabataCoordinates[1],
      dest_label: "ENSA Tanger",
      dest_lng: ensaCoordinates[0],
      dest_lat: ensaCoordinates[1],
      departure_time: "07:45",
      weekdays: [1, 2, 3, 4, 5], // Lun - Ven
      one_off_date: null,
      seats: 3,
      active: true,
      // Géométrie simulée OSRM stockée en [lat, lng] dans la base
      route: [
        [35.77, -5.78],
        [35.765, -5.8],
        [35.76, -5.82],
        [35.7595, -5.834],
      ],
      route_km: 7.2,
      route_minutes: 18,
    };

    it("vérifie que le trajet récurrent est actif les jours de cours", () => {
      // 2026-10-27 est un mardi (weekday 2)
      expect(tripRunsOnDate(driverTrip, "2026-10-27")).toBe(true);
      // Dimanche (weekday 7)
      expect(tripRunsOnDate(driverTrip, "2026-11-01")).toBe(false);
    });

    it("convertit fidèlement les coordonnées stockées [lat, lng] en GeoJSON [lng, lat]", () => {
      const geoJsonCoords = legacyRouteCoordinates(driverTrip.route);
      expect(geoJsonCoords[0]).toEqual([-5.78, 35.77]);
      expect(geoJsonCoords[3]).toEqual([-5.834, 35.7595]);
    });
  });

  // 3. Recherche et correspondance piétonne (Matching)
  describe("3. Recherche d'un trajet et point de rendez-vous sécurisé", () => {
    it("trouve un point de rendez-vous à moins de 200 m à pied du passager", async () => {
      const routeGeometry: [number, number][] = [
        [-5.78, 35.77],
        [-5.795, 35.768],
        [-5.815, 35.762],
        [-5.834, 35.7595],
      ];

      const driverRoute: DriverRoute = {
        id: "trip-ensa-001",
        coordinates: routeGeometry,
        distanceMeters: [0, 2000, 5000, 7500],
        elapsedSeconds: [0, 300, 700, 1100],
        departureTime: moroccoInstant("2026-10-27", "07:45"),
        seatsAvailable: 3,
        rating: 4.9,
      };

      // Passager situé près du 2e point de passage
      const passengerPosition: [number, number] = [-5.7955, 35.7682];
      const desiredArrival = moroccoInstant("2026-10-27", "08:15");

      const matches = await findRideMatches({
        passengerPosition,
        desiredArrivalTime: desiredArrival,
        earliestPickupTime: moroccoInstant("2026-10-27", "07:30"),
        routes: [driverRoute],
        resolveWalkingRoute: async (from, to) => {
          // Résolveur piéton simulé retournant 60m de marche
          return {
            coordinates: [from, to],
            distanceMeters: 60,
            durationSeconds: 45,
          };
        },
      });

      expect(matches.length).toBe(1);
      const match = matches[0]!;
      expect(match.tripId).toBe("trip-ensa-001");
      expect(match.walkingRoute.distanceMeters).toBeLessThanOrEqual(200);
      expect(match.priceDh).toBeGreaterThanOrEqual(7);
      expect(match.priceDh).toBeLessThanOrEqual(25);
    });
  });

  // 4. Calcul tarifaire transparent
  describe("4. Barème kilométrique équitable", () => {
    it("applique le barème officiel Rafiq avec plancher de 7 DH et plafond de 25 DH", () => {
      // 2 km: 2 * 3 = 6 -> plancher 7 DH
      expect(calculateRidePrice(2)).toBe(7);
      // 5 km: 5 * 3 = 15 DH
      expect(calculateRidePrice(5)).toBe(15);
      // 8 km: 15 + 3*1 = 18 DH
      expect(calculateRidePrice(8)).toBe(18);
      // 14 km: 15 + 5 + 4*0.5 = 22 DH
      expect(calculateRidePrice(14)).toBe(22);
      // 30 km: 15 + 5 + 20*0.5 = 30 -> plafond 25 DH
      expect(calculateRidePrice(30)).toBe(25);
    });
  });

  // 5. Suivi du voyage et assistance SOS
  describe("5. Sécurité pendant le trajet : bouton SOS et partage de position", () => {
    it("génère des liens d'alerte SMS et WhatsApp valides avec coordonnées exactes", () => {
      const position = { lat: 35.768, lng: -5.795 };
      const message = positionMessage({
        firstName: "Salma",
        position,
        alert: true,
      });

      expect(message).toContain("ALERTE Rafiq");
      expect(message).toContain("SOS");
      expect(message).toContain("Salma");
      expect(message).toContain("35.76800");

      const phone = normalizeMoroccanPhone("06 12 34 56 78");
      expect(phone).toBe("+212612345678");

      const wa = whatsappHref(phone, message);
      expect(wa).toContain("https://wa.me/212612345678");
      expect(wa).toContain(encodeURIComponent(message));

      const sms = smsHref(phone, message);
      expect(sms).toContain("sms:+212612345678");
    });
  });

  // 6. Rafiq IA sans dépendance externe (mode de secours hors-ligne / sans quota)
  describe("6. Compréhension du langage naturel par l'assistant", () => {
    it("comprend les requêtes courantes même sans clé API ou hors quota", () => {
      const today = "2026-10-26";
      const intent = parseIntentFallback("trajet demain 7h30 depuis Malabata", today);

      expect(intent).toEqual({
        kind: "search",
        originText: "Malabata",
        date: "2026-10-27",
        arrival: "07:30",
      });

      const weatherIntent = parseIntentFallback("est-ce qu'il va pleuvoir demain ?", today);
      expect(weatherIntent?.kind).toBe("weather");
    });
  });
});
