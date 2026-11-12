# @tbca/bot-discord

Discord-Bot als dünner Client der API: Slash-Commands und Aktivitäts-XP. Entscheidungen trifft
immer der Server; der Bot ruft die interne API mit `BOT_SERVICE_TOKEN` auf.

## Einrichtung (Entwicklung)

1. Unter <https://discord.com/developers/applications> die Dev-App öffnen (dieselbe wie für den
   Web-Login).
2. Reiter **Bot**: Token erzeugen und als `DISCORD_BOT_TOKEN` in `.env.development` eintragen.
   **Message Content Intent** einschalten – der Bot braucht den Text, um Länge und Wiederholungen
   zu prüfen. Inhalte verlassen den Bot nie; an die API gehen nur Länge und ein kurzer Hash.
3. Reiter **OAuth2 → URL Generator**: Scopes `bot` und `applications.commands`, Berechtigungen
   „View Channels“ und „Send Messages“; mit der URL den Bot auf deinen Test-Server einladen.
4. Server-ID (Entwicklermodus in Discord, Rechtsklick auf den Server) als `DISCORD_DEV_GUILD_ID`
   eintragen, dann `scripts/bot.sh register-commands`.
5. `scripts/dev.sh` startet den Bot zusammen mit API und Website.

Fehlt `BOT_SERVICE_TOKEN` in einer älteren `.env.development`, einen zufälligen Wert mit mindestens
32 Zeichen ergänzen (z. B. `openssl rand -base64 32`).

## Commands

| Command                  | Wer          | Zweck                                         |
| ------------------------ | ------------ | --------------------------------------------- |
| `/tbca-admin einrichten` | Server-Admin | Server als Community anlegen                  |
| `/tbca-admin xp-kanal`   | Server-Admin | XP für Nachrichten in einem Kanal an/aus      |
| `/tbca-admin liga-kanal` | Server-Admin | Liga-Ankündigungen in einem Kanal an/aus      |
| `/tbca registrieren`     | alle         | Charakter anlegen (Schatten-Account)          |
| `/tbca profil`           | alle         | Level, XP und Credits                         |
| `/tbca kampf`            | alle         | Herausforderung, die der Gegner annehmen muss |
| `/tbca liga`             | alle         | Rating, Platzierung, Anmelden (mit Buttons)   |

`/tbca kampf @person` stellt eine Anfrage mit Buttons „Annehmen“ und „Ablehnen“, die nur die
herausgeforderte Person drücken kann; nach 15 Minuten läuft sie ab. Erst beim Annehmen wird
gekämpft (Belohnung wie bisher für den Herausforderer). Auf der Website gibt es dafür keine freie
Suche mehr, nur die Tagesgegner.

Nach einem Spieltag schickt der Bot innerhalb einer Minute die Ergebnisse der Spieler mit
Heimat in dieser Community in den Liga-Kanal, am Zyklusende auch Platz und Auf- oder Abstieg.
Die Zeiten erscheinen als Discord-Zeitstempel in der Ortszeit jedes Lesers. Neue Commands
erst nach `scripts/bot.sh register-commands` sichtbar.

Ein späterer Web-Login mit demselben Discord-Account übernimmt den Schatten-Account samt Charakter.
