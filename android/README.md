# Packaging de l'application Android Rafiq (APK / Google Play)

Rafiq est une Progressive Web App (PWA) conforme aux standards Google et prête à être empaquetée en application Android native (APK ou Android App Bundle .aab) via une **Trusted Web Activity (TWA)**.

---

## Option 1 : Génération en 1 clic via PWABuilder (Recommandé - Sans installation)

1. Déployez ou ouvrez l'URL publique de Rafiq (ex. votre URL de publication).
2. Rendez-vous sur [PWABuilder.com](https://www.pwabuilder.com/).
3. Entrez l'URL de votre application Rafiq et cliquez sur **Start**.
4. PWABuilder détecte le manifeste complet, les icônes haute résolution et le service worker.
5. Cliquez sur **Package for Stores** puis sélectionnez **Android**.
6. Téléchargez directement le fichier **APK** (pour tester sur smartphone Android) ou le package **AAB** prêt pour publication sur le Google Play Store.

---

## Option 2 : Génération locale avec Bubblewrap CLI

Si vous avez Node.js, le JDK 17 et Android SDK installés :

```bash
# 1. Vérifiez le fichier twa-manifest.json à la racine du projet
# Ajustez le champ "host" avec le nom de domaine de production.

# 2. Initialiser et construire le projet Android
npx @bubblewrap/cli build

# L'APK signé est généré dans le répertoire courant (app-release-signed.apk).
```

### Installation directe sur un téléphone Android (test développeur)

Activez le « Débogage USB » sur votre téléphone Android et exécutez :

```bash
adb install app-release-signed.apk
```

---

## Association domaine / application (Asset Links)

Pour que la barre d'adresse de Chrome disparaisse complètement dans l'application Android :

1. Obtenez l'empreinte SHA-256 de votre certificat de signature (keystore).
2. Mettez à jour le fichier `public/.well-known/assetlinks.json` avec votre empreinte SHA-256.
