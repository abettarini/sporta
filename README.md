# Sporta 🧺

*La spesa di famiglia.*

Lista della spesa condivisa in famiglia: è una PWA installabile sul telefono e si aggiorna in tempo reale.

## Funzioni

- **Più liste** per famiglia (Supermercato, Farmacia…), ognuna con la sua icona.
- **Tempo reale**: articoli aggiunti, modificati, spuntati o riordinati compaiono subito su tutti i telefoni (Server-Sent Events).
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

Su Vercel il server gira come funzioni serverless, senza disco persistente e senza connessioni sempre aperte. Per questo servono due cose, entrambe fornite da **Supabase** (il piano gratuito basta per una famiglia):

- un database **Postgres** per i dati;
- **Supabase Realtime** per gli aggiornamenti in tempo reale tra i telefoni.

### Passi

1. **Importa il progetto**: su Vercel, *Add New → Project*, scegli il repository `sporta`. *Framework Preset*: **Other**. Non serve configurare build né output, lo fa `vercel.json`.
2. **Collega Supabase**: dal progetto Vercel, *Storage* (o *Integrations*) → **Supabase** → crea un nuovo progetto e collegalo. L'integrazione imposta da sola le variabili d'ambiente.
3. **Rifai il deploy** (*Deployments → Redeploy*) per far leggere all'app le nuove variabili.
4. Apri l'URL `https://….vercel.app` dal telefono: è già in HTTPS e quindi installabile.

Le tabelle vengono create in automatico alla prima richiesta.

### Variabili d'ambiente

Se preferisci configurarle a mano (*Settings → Environment Variables*):

| Variabile | Dove trovarla in Supabase |
|---|---|
| `DATABASE_URL` (o `POSTGRES_URL`) | *Connect → Connection string → Transaction pooler* (porta 6543) |
| `SUPABASE_URL` | *Project Settings → API → Project URL* |
| `SUPABASE_ANON_KEY` | *Project Settings → API Keys → anon / publishable* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Project Settings → API Keys → service_role / secret* (**riservata**: non condividerla) |

Note:
- Il tempo reale usa canali *Broadcast* pubblici. In Supabase, in *Realtime → Settings*, l'opzione **"Allow public access"** deve restare attiva (lo è di default). Il nome del canale contiene l'identificativo segreto della famiglia, visibile solo ai suoi membri.
- La chiave `anon` viene mandata al browser, ma i dati restano protetti: su tutte le tabelle è attiva la **Row Level Security** senza policy, quindi solo il server (con la `service_role` e la connessione Postgres) può leggerli e scriverli.
- **Senza Supabase Realtime** (per esempio con Neon come database), l'app funziona lo stesso ma si aggiorna ogni 5 secondi invece che all'istante.

## Avvio locale / self-hosted

Serve Node.js 22.5 o superiore.

```bash
npm install
```

```bash
npm start
```

L'app risponde su `http://localhost:3000`. Senza configurazione i dati stanno in un file SQLite dentro `./data` e il tempo reale passa per il server stesso (SSE). Le variabili `PORT` e `DATA_DIR` cambiano porta e cartella. Con `DATABASE_URL` si usa invece Postgres, e con le variabili `SUPABASE_*` Supabase Realtime.

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
lib/backends.js      adattatori: SQLite o Postgres, SSE o Supabase Realtime
lib/http.js          adattamento richiesta/risposta HTTP
public/index.html    shell dell'app
public/app.js        interfaccia, coda offline, sincronizzazione, drag & drop
public/shared.js     parsing inserimento rapido, unità, scalatura (usato da client e server)
public/sw.js         service worker (cache offline)
public/manifest.webmanifest, public/icons/
vercel.json          configurazione Vercel (statici da public/, rewrite delle API)
scripts/make-icons.js  rigenera le icone PNG dall'SVG (richiede Playwright)
```
