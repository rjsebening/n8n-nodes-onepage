# n8n-nodes-onepage

![OnePage Node](https://img.shields.io/badge/n8n-community--node-FF6D5A)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Eine schlanke n8n Community Node zur **Echtzeit-Integration von OnePage Leads** über einen Trigger.
Ideal für alle, die neue Leads **sofort automatisiert weiterverarbeiten** wollen – ohne Polling, ohne Umwege.

---

## Was ist n8n?

n8n ist ein Workflow-Automatisierungstool, mit dem du Prozesse zwischen verschiedenen Web-Apps – wie **OnePage**, CRM-Systemen, Slack, E-Mail oder Datenbanken – automatisieren kannst.

Statt manueller Arbeit laufen Abläufe automatisch im Hintergrund, sobald ein Ereignis eintritt.

---

## ⚖️ Rechtlicher Hinweis

Diese Community Node nutzt die öffentliche OnePage API und steht **in keiner offiziellen Verbindung zu OnePage**.

Alle Marken- und Produktnamen sind Eigentum der jeweiligen Inhaber.

**Hinweis:** Dies ist eine von der Community entwickelte Integration. Für offiziellen Support wende dich bitte direkt an OnePage.

---

## 🚀 Überblick

Die **OnePage n8n Node** stellt einen **Trigger** bereit, der ausgelöst wird, sobald **ein neuer Lead in OnePage eingeht**.

Der Trigger eignet sich perfekt für:

* Lead-Weiterleitung
* CRM-Synchronisation
* Benachrichtigungen
* automatisierte Follow-ups
* interne Prozesse & Scoring

Kein manuelles Abrufen.
Keine Zeitverzögerung.
**100 % Event-basiert.**

---

## ✨ Hauptfunktion

### ⚡ **OnePage Trigger – New Lead**

Diese Node stellt **genau einen Trigger** bereit:

* **New Lead**

  * Wird ausgelöst, sobald ein neuer Lead in OnePage erstellt wird
  * Nutzung über Webhooks (Echtzeit)
  * Automatische Registrierung & Entfernung des Webhooks in OnePage

---

## 🔔 Trigger-Details

### **OnePage Trigger: New Lead**

| Eigenschaft       | Beschreibung          |
| ----------------- | --------------------- |
| Trigger-Typ       | Webhook               |
| Auslöser          | Neuer Lead in OnePage |
| Ausführung        | Echtzeit              |
| Webhook-Handling  | Automatisch           |
| Mehrere Workflows | Unterstützt           |

Der Trigger übermittelt alle vom OnePage Webhook bereitgestellten Lead-Daten direkt an den Workflow.

---

## 📦 Installation

### Voraussetzungen

* n8n Version **1.0.0 oder höher**
* Aktiver OnePage Account

---

### Installation über Community Nodes

1. Öffne deine **n8n-Instanz**
2. Gehe zu **Settings → Community Nodes**
3. Klicke auf **Install**
4. Installiere eines der folgenden Pakete:

#### Variante 1 – Scoped (empfohlen)

```bash
@rjsebening/n8n-nodes-onepage
```

#### Variante 2 – Unscoped

```bash
n8n-nodes-onepage
```

5. n8n neu starten → Node ist verfügbar

---

## 🔐 Konfiguration

### OnePage API Credentials anlegen

1. Gehe in n8n zu **Credentials → New Credential**
2. Wähle **OnePage API**
3. Trage deine Zugangsdaten ein:

   * **E-Mail**: OnePage Login-E-Mail
   * **Passwort**: OnePage Login-Passwort
   * **Base URL**:

     ```
     https://api-eu.onepage.io/api/v1
     ```
4. Speichern

Die Verbindung wird beim Speichern automatisch getestet.

---

## 🧩 Verwendung im Workflow

1. Erstelle einen neuen Workflow
2. Füge den **OnePage Trigger** hinzu
3. Wähle den Trigger-Typ **New Lead**
4. Aktiviere den Workflow

👉 Ab jetzt wird der Workflow **bei jedem neuen Lead automatisch ausgeführt**.

---

## 📖 Typische Anwendungsfälle

* Neue OnePage Leads automatisch ins CRM übertragen
* Sofortige Benachrichtigung per Slack, E-Mail oder Microsoft Teams
* Lead-Scoring & Qualifizierung direkt nach Eingang
* Automatisierte Follow-Up-Workflows starten
* Übergabe an Sales- oder Onboarding-Prozesse

---

## 🌍 Warum das wichtig ist

Viele Teams verlieren Leads nicht im Marketing –
sondern **nachdem sie eingegangen sind**.

Diese Node sorgt dafür, dass:

* **kein Lead liegen bleibt**
* **Reaktionszeiten auf Sekunden sinken**
* **manuelle Arbeit entfällt**
* **Prozesse skalierbar werden**

Kurz: **Leads kommen rein – alles andere läuft automatisch.**

---

## 📬 Über den Autor

Ich bin [Rezk Jörg Sebening](https://github.com/rjsebening) –
Business-Automation-Experte für n8n, APIs und skalierbare Prozesse im DACH-Markt.

Ich entwickle n8n Nodes & Systeme, die **manuelle Arbeit konsequent eliminieren**.

👉 Folge mir auf GitHub für weitere **praxisnahe Community Nodes & Integrationen**.

## 📋 Haftungsausschluss

Diese inoffizielle Community-Node steht in keiner Verbindung zu OnePage und wird weder von OnePage unterstützt noch gesponsert. Er bietet lediglich eine Schnittstelle zur öffentlich verfügbaren OnePage-API gemäß deren Nutzungsbedingungen.

**Wichtige Hinweise:**

- Diese Node wird von der Community entwickelt und gepflegt.
- Bei Problemen mit der OnePage-API wenden Sie sich bitte an den offiziellen OnePage-Support.
- Alle OnePage-Marken und -Logos sind Eigentum von OnePage.

Diese Node dient lediglich als Verbindung zur öffentlichen API.