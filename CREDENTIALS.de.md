# 📄 `CREDENTIALS.md`

# OnePage API Credentials

Diese Datei beschreibt, wie du die Zugangsdaten (**Credentials**) für die **OnePage API** in n8n anlegst, um die **OnePage Node** zu verwenden.

Die Authentifizierung erfolgt über **Login-Daten (E-Mail & Passwort)**.

---

## 🔑 Benötigte Zugangsdaten

Um die Integration nutzen zu können, benötigst du folgende Angaben:

1. **E-Mail (`email`)**

   * Die E-Mail-Adresse deines OnePage-Accounts.
   * Diese entspricht der E-Mail, mit der du dich auch im OnePage-Dashboard anmeldest.

2. **Passwort (`password`)**

   * Das Passwort deines OnePage-Accounts.
   * Wird in n8n **verschlüsselt gespeichert** und nicht im Klartext weitergegeben.

3. **Base URL (`baseUrl`)** *(optional, Standardwert hinterlegt)*

   * Standardwert:

     ```
     https://api-eu.onepage.io/api/v1
     ```
   * Dieser Wert ist in den Credentials bereits vorausgefüllt und muss in der Regel **nicht geändert** werden.

---

## ⚙️ Einrichtung in n8n

1. Öffne **n8n**.
2. Navigiere zu **Credentials → Neues Credential hinzufügen**.
3. Wähle **OnePage API** aus.
4. Trage folgende Daten ein:

   * **E-Mail:** Deine OnePage Login-E-Mail
   * **Passwort:** Dein OnePage Login-Passwort
   * **Base URL:** (optional, Standardwert empfohlen)
5. Speichern.

---

## ✅ Verbindung testen

Beim Speichern testet n8n automatisch die Verbindung zur OnePage API.

Typischer Test-Request:

```
POST /auth/login
Host: https://api-eu.onepage.io/api/v1
Content-Type: application/json

{
  "email": "<DEINE_EMAIL>",
  "password": "<DEIN_PASSWORT>"
}
```

* Bei korrekten Zugangsdaten erhältst du eine **200 OK** Antwort inkl. Auth-Token.
* Bei einem Fehler überprüfe bitte:

  * E-Mail-Adresse
  * Passwort
  * ob dein Account aktiv ist

---

## 📝 Hinweise

* Die Zugangsdaten entsprechen **deinem normalen OnePage Login**.
* Ändert sich dein Passwort, müssen die Credentials in n8n ebenfalls aktualisiert werden.
* Die Authentifizierung erfolgt serverseitig, es wird **kein Passwort im Workflow ausgegeben**.
* Für produktive Umgebungen empfiehlt sich ein dedizierter OnePage-Account für Integrationen.
