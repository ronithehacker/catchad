# Catchad

Flerspelar-frågesport om fotboll. Alla spelar från sin egen telefon i webbläsaren, utan konto.

## Kör lokalt
    node server.js
Öppna http://localhost:3000 (kräver Node 18 eller senare, inga paket att installera).

## Lägg ut på nätet (Render, gratis)
1. Lägg mappen på GitHub.
2. På render.com: New → Web Service → välj ditt repo.
3. Build Command: tomt (eller `npm install`). Start Command: `npm start`.
4. När den är uppe får du en adress. Skicka den till vännerna.

Gratisnivån sover efter en stunds inaktivitet, så första laddningen kan ta en halv minut.
Rum och poäng ligger i serverns minne och försvinner om servern startar om.
