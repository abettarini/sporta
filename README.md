# Sporta 🧺

*La spesa di famiglia.*

Lista della spesa condivisa in famiglia: è una PWA installabile sul telefono e si aggiorna in tempo reale.

## Funzioni

- **Più liste** per famiglia (Supermercato, Farmacia…), ognuna con la sua icona.
- **Tempo reale**: articoli aggiunti, modificati, spuntati o riordinati compaiono subito su tutti i telefoni (Server-Sent Events, con Postgres LISTEN/NOTIFY).
- **Inserimento rapido** in una sola riga, con i dettagli facoltativi:
  - `latte` → solo il nome
  - `2 kg patate`, `500g farina`, `latte x3`, `uova 6` → quantità e unità
  - `pasta 500 g @De Cecco` → con la marca
  - suggerimenti dagli articoli usati più spesso; se un articolo è già in lista, la quantità viene sommata (g/kg e ml/l vengono convertiti)
- **Dettagli** (quantità, unità, marca, nota, lista) dal pulsante ⋮ di ogni articolo.
- **Drag & drop**: si trascinano articoli, liste e ingredienti con la maniglia ⠿. Funziona con il dito e con il mouse.
- **Nel carrello**: gli articoli spuntati scendono in fondo e mostrano chi li ha presi. *Svuota* li toglie, e si può annullare.
- **Ricette**: ingredienti e numero di persone. Si sceglie per quante persone cucinare, le quantità vengono ricalcolate e arrotondate in modo sensato (uova e pezzi interi, grammi a 5/10), si deselezionano gli ingredienti che si hanno già e si aggiunge tutto a una lista.
- **Offline**: l'app si apre anche senza rete, le modifiche vanno in coda e partono appena torna la connessione.

## Pubblicazione su Vercel (consigliata)

Serve solo un database **Postgres**: Neon dal Marketplace di Vercel (piano gratuito), Vercel Postgres o un Postgres tuo raggiungibile da internet.

### Passi

1. **Importa il progetto**: su Vercel, *Add New → Project*, scegli il repository `sporta`. *Framework Preset*: **Other**. Non serve configurare build né output, lo fa `vercel.json`.
2. **Collega Postgres**: dal progetto Vercel, *Storage* → **Neon** (o un altro Postgres) → crea il database e collegalo al progetto. L'integrazione imposta da sola `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.
3. **Rifai il deploy** (*Deployments → Redeploy*) per far leggere all'app le nuove variabili.
4. Apri l'URL `https://….vercel.app` dal telefono: è già in HTTPS e quindi installabile.

### Inizializzazione del database

Non serve fare nulla: alla prima richiesta l'app crea da sola le tabelle (`households`, `lists`, `items`, `recipes`, `history`). L'operazione è idempotente e protetta da un lock, quindi è sicura anche con più istanze che partono insieme.

Se preferisci creare le tabelle prima del primo accesso, o verificare che la connessione funzioni, recupera le variabili da Vercel e lancia lo script:

```bash
npx vercel env pull .env.local
```

```bash
node --env-file=.env.local scripts/db-init.js
```

Oppure passa direttamente la stringa di connessione copiata da Neon:

```bash
DATABASE_URL="postgres://utente:password@host/db?sslmode=require" npm run db:init
```

### Variabili d'ambiente

| Variabile | Uso |
|---|---|
| `DATABASE_URL` (o `POSTGRES_URL`) | connessione per le query. Può essere quella con pooler. |
| `DATABASE_URL_UNPOOLED` (o `POSTGRES_URL_NON_POOLING`) | connessione **diretta**, senza pooler, usata per il tempo reale. Se manca si usa `DATABASE_URL`. |
| `SSE_MAX_SECONDS` | facoltativa, default `240`: durata di ogni connessione in tempo reale, da tenere sotto il `maxDuration` di `vercel.json` (300 s). |

Se hai un solo URL senza pooler (per esempio un Postgres tuo), basta `DATABASE_URL`.

### Come funziona il tempo reale

Le funzioni Vercel non condividono la memoria, quindi gli aggiornamenti passano da Postgres con **LISTEN/NOTIFY**:

1. ogni modifica fa una `NOTIFY` sul canale della famiglia;
2. ogni telefono con l'app aperta tiene una connessione SSE verso una funzione, che è in `LISTEN` su quel canale e inoltra subito la modifica.

Ogni 4 minuti circa la funzione chiude la connessione per rispettare i limiti di durata di Vercel; il browser si riconnette da solo e ricarica lo stato, quindi non si perde nulla. Se il tempo reale non è disponibile, l'app si aggiorna comunque ogni 10 secondi.

`LISTEN` non funziona attraverso un pooler in modalità *transaction* (PgBouncer, il pooler di Neon): per questo serve l'URL diretto (`DATABASE_URL_UNPOOLED`), che le integrazioni Vercel forniscono già. Ogni telefono con l'app aperta occupa una connessione diretta per istanza di funzione, molto al di sotto dei limiti anche dei piani gratuiti.

## Avvio locale / self-hosted

Serve Node.js 22.5 o superiore.

```bash
npm install
```

```bash
npm start
```

L'app risponde su `http://localhost:3000`. Senza configurazione i dati stanno in un file SQLite dentro `./data`. Le variabili `PORT` e `DATA_DIR` cambiano porta e cartella. Con `DATABASE_URL` si usa invece Postgres, e in quel caso si possono avviare anche più istanze del server: il tempo reale passa da LISTEN/NOTIFY.

### Con Docker

```bash
docker build -t sporta .
docker run -d --name sporta -p 3000:3000 -v sporta-data:/app/data --restart unless-stopped sporta
```

### HTTPS (necessario per installarla come app)

I telefoni installano una PWA solo se è servita in HTTPS. Il modo più semplice è mettere [Caddy](https://caddyserver.com) davanti al server, che ottiene il certificato da solo:

```
sporta.tuodominio.it {
    reverse_proxy localhost:3000
}
```

Con nginx va disattivato il buffering su `/api/events` (`proxy_buffering off;`), altrimenti gli aggiornamenti in tempo reale arrivano in ritardo.

## Condivisione e sicurezza

Chi crea la famiglia riceve un **codice d'invito** (es. `ABCD-EFGH-JKLM`). In *Impostazioni → Condividi invito* parte un link che fa entrare direttamente. Chi ha il codice vede e modifica tutto, quindi va trattato come una password. I tentativi con codici sbagliati sono limitati.

## Struttura

```
api/index.js         funzione serverless per Vercel (tutte le /api/*)
server.js            server locale/self-hosted: statici + API + SSE
lib/core.js          logica delle API e schema del database
lib/backends.js      adattatori: SQLite o Postgres, tempo reale in memoria o LISTEN/NOTIFY
lib/http.js          adattamento richiesta/risposta HTTP
public/index.html    shell dell'app
public/app.js        interfaccia, coda offline, sincronizzazione, drag & drop
public/shared.js     parsing inserimento rapido, unità, scalatura (usato da client e server)
public/sw.js         service worker (cache offline)
public/manifest.webmanifest, public/icons/
vercel.json          configurazione Vercel (statici da public/, rewrite delle API)
scripts/make-icons.js  rigenera le icone PNG dall'SVG (richiede Playwright)
```
