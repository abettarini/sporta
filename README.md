# Sporta 🧺

*La spesa condivisa, in famiglia e non solo.*

Lista della spesa condivisa, installabile sul telefono come app (PWA) e aggiornata in tempo reale, con ricette e storico delle spese.

## Funzioni

### Gruppi e persone
- Un telefono può partecipare a **più gruppi** (la famiglia, la squadra di calcetto, una festa…) e passare dall'uno all'altro toccando il nome del gruppo. Ogni gruppo ha liste, ricette, prodotti e spese separati.
- **Ruoli**: ogni persona ha un *permesso* — **Amministratore** o **Partecipante** — e una *relazione* descrittiva (Familiare, Amico, Collega, Ospite o personalizzata). Chi crea il gruppo ne è l'amministratore; deve sempre restarcene almeno uno.
- **Membri**: elenco delle persone con chi è **online ora**, l'ultimo accesso e quale lista sta guardando; nelle liste compaiono gli avatar di chi la sta guardando.
- **Come si entra**:
  - **link personale** creato da un amministratore (relazione e permesso già impostati, vale per una persona, scade in 7 giorni): si scrive solo il proprio nome e si entra subito;
  - **codice del gruppo** (chiunque nel gruppo può condividerlo): ci si presenta con nome, relazione, email facoltativa e un messaggio; per impostazione predefinita un amministratore deve **accettare** la richiesta, e intanto si vede una schermata di attesa che si sblocca da sola. L'amministratore può spegnere l'approvazione (utile per un evento) e **rigenerare il codice**;
  - **nuovo gruppo**: nome della persona e nome del gruppo.
- **Richieste**: gli amministratori le vedono in cima a *Membri* (con un contatore nella navigazione) e possono correggere il nome, scegliere relazione e permesso, poi accettare, rifiutare o rifiutare e bloccare.
- **Rimozione**: un amministratore può rimuovere una persona; il suo accesso viene revocato subito e il suo telefono mostra "Non fai più parte del gruppo". Quello che aveva aggiunto resta nello storico.
- **Nomi**: unici nel gruppo (controllo mentre si scrive); in ogni gruppo ci si può presentare con un nome diverso e cambiarlo in *Altro*: lo storico si aggiorna da solo.

### Liste
- **Più liste** per gruppo (Supermercato, Farmacia…), ognuna con la sua icona.
- **Tempo reale**: articoli aggiunti, modificati, spuntati o riordinati compaiono subito su tutti i telefoni.
- **Inserimento rapido** in una sola riga, con i dettagli facoltativi:
  - `latte` → solo il nome
  - `2 kg patate`, `500g farina`, `latte x3`, `uova 6` → quantità e unità
  - `pasta 500 g @De Cecco` → con la marca
  - suggerimenti dai prodotti più usati; se un articolo è già in lista la quantità viene sommata (g/kg e ml/l vengono convertiti)
- **Dettagli** dal pulsante ⋮: quantità, unità, marca, **reparto**, **tag**, nota, lista e ★ prodotto abituale.
- **Ordinamento**: manuale con drag & drop (maniglia ⠿, funziona con il dito), **per reparto** (nell'ordine tipico del supermercato) o alfabetico. Il reparto viene proposto in automatico dal nome del prodotto.
- **Filtro per tag** (es. `#bio`, `#offerta`, `#per Luca`).
- **Prodotti abituali**: con *Abituali* si rimettono in lista con un tocco, con quantità e marca solite.
- **Nel carrello**: gli articoli spuntati scendono in fondo e mostrano chi li ha presi.

### Prodotti
- Il **catalogo** si riempie da solo con quello che si aggiunge alle liste e alle ricette. Da *Altro → Prodotti* si impostano reparto, tag, quantità e marca abituali e la ★.

### Spese
- **Concludi spesa** salva gli articoli presi nello storico, con data, chi l'ha fatta, negozio e totale (facoltativi), e li toglie dalla lista.
- Nella scheda **Spese** lo storico è diviso per mese, con il totale mensile; da una spesa passata si possono **rimettere in lista** gli articoli scelti.

### Ricette
- Foto, descrizione, **difficoltà**, **tempi di preparazione e cottura**, ingredienti e **procedimento a passaggi** (riordinabili con drag & drop).
- **Autocompletamento** degli ingredienti dal catalogo e dalle altre ricette; gli ingredienti nuovi entrano subito nei suggerimenti.
- Si sceglie per quante persone cucinare: le quantità vengono ricalcolate e arrotondate in modo sensato (uova e pezzi interi, grammi a 5/10). Si deselezionano gli ingredienti già in casa e il resto va nella lista.
- **Condivisione con link privato** (non indicizzato e revocabile): chi lo apre vede la ricetta anche senza Sporta e, se usa Sporta, può salvarla nelle sue ricette. Le ricette si possono anche copiare in un altro dei propri gruppi.

### App
- **Telefono, tablet e desktop**: sul telefono navigazione in basso e una colonna; da 760 px barra laterale con le icone e pannelli come finestre; da 1000 px colonna con l'elenco (liste, ricette, spese) accanto al contenuto aperto e ricetta con ingredienti e procedimento affiancati; da 1240 px barra laterale completa, con il gruppo, e dettagli in un pannello a destra. Scorciatoie: `/` per scrivere, `Esc` per chiudere.
- **Offline**: l'app si apre anche senza rete, le modifiche vanno in coda e partono appena torna la connessione.
- **Aggiornamenti**: quando esce una nuova versione compare l'avviso *Aggiorna* (vedi [Versioni e aggiornamenti](#versioni-e-aggiornamenti)).
- **Pronta per gli agenti AI** con WebMCP (vedi [WebMCP](#webmcp)).
- **Icone**: un set di icone originali (SVG a tratto) per reparti, liste e stati vuoti, con un colore per ogni reparto e varianti per il tema chiaro e scuro. Le liste create con le versioni precedenti, che usavano emoji, vengono mostrate con l'icona equivalente.

## Pubblicazione su Vercel (consigliata)

Serve solo un database **Postgres**: Neon dal Marketplace di Vercel (piano gratuito), Vercel Postgres o un Postgres tuo raggiungibile da internet.

### Passi

1. **Importa il progetto**: su Vercel, *Add New → Project*, scegli il repository `sporta`. *Framework Preset*: **Other**. Non serve configurare build né output, lo fa `vercel.json`.
2. **Collega Postgres**: dal progetto Vercel, *Storage* → **Neon** (o un altro Postgres) → crea il database e collegalo al progetto. L'integrazione imposta da sola `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.
3. **Rifai il deploy** (*Deployments → Redeploy*) per far leggere all'app le nuove variabili.
4. Apri l'URL `https://….vercel.app` dal telefono: è già in HTTPS e quindi installabile.

### Inizializzazione del database

Non serve fare nulla: alla prima richiesta l'app crea da sola le tabelle e, sui database creati con versioni precedenti, aggiunge le colonne nuove (migrazioni automatiche, senza toccare i dati). L'operazione è idempotente e protetta da un lock, quindi è sicura anche con più istanze che partono insieme.

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

1. ogni modifica fa una `NOTIFY` sul canale del gruppo;
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

## Versioni e aggiornamenti

La versione dell'app è quella di `package.json`. Lo script `scripts/sync-version.js` la copia in `public/version.js`, letto sia dall'app (è visibile in *Altro*) sia dal service worker.

Per pubblicare una nuova versione:

```bash
npm version minor
```

Il comando (oppure `patch` o `major`) aggiorna `package.json` e `public/version.js`, poi crea commit e tag. Dopo il push e il deploy:

1. il service worker dei telefoni si accorge che `version.js` è cambiato e scarica in background tutti i file della nuova versione, in una cache separata;
2. l'app mostra l'avviso **"È disponibile una nuova versione · Aggiorna"**, e intanto continua a funzionare con la versione precedente;
3. toccando *Aggiorna* le modifiche non ancora inviate restano salvate, la nuova versione si attiva e la pagina si ricarica. La cache della versione vecchia viene eliminata.

L'app controlla gli aggiornamenti ogni volta che torna in primo piano e ogni 30 minuti. Il database si aggiorna da solo con le migrazioni automatiche.

Durante lo sviluppo i file vengono serviti dalla cache della versione installata: dopo una modifica conviene lanciare `npm run sync-version` con una versione nuova, oppure attivare *Update on reload* negli strumenti per sviluppatori del browser (*Application → Service workers*).

## WebMCP

Sporta espone i suoi strumenti agli agenti AI del browser tramite [WebMCP](https://webmachinelearning.github.io/webmcp/docs/proposal.html) (`navigator.modelContext.registerTool`), una proposta W3C ancora sperimentale: in Chrome è disponibile dietro flag. Nei browser che non la supportano il codice (`public/js/webmcp.js`) non fa nulla.

| Strumento | Cosa fa |
|---|---|
| `sporta_get_overview` | gruppo attivo, gruppi, liste con il numero di articoli |
| `sporta_get_members` | persone del gruppo, ruoli, chi è online (sola lettura) |
| `sporta_switch_group` | passa a un altro gruppo |
| `sporta_get_list` | articoli di una lista (da prendere e nel carrello) |
| `sporta_add_items` | aggiunge articoli con quantità, unità, marca, nota e tag facoltativi |
| `sporta_set_item_checked` | segna un articolo come preso o da prendere |
| `sporta_remove_items` | elimina articoli |
| `sporta_get_favorites` | prodotti abituali |
| `sporta_search_recipes`, `sporta_get_recipe` | cerca e legge le ricette |
| `sporta_add_recipe_to_list` | aggiunge gli ingredienti di una ricetta per N persone, escludendo quelli già in casa |
| `sporta_create_recipe` | crea una ricetta |
| `sporta_get_shopping_history` | storico delle spese |
| `sporta_create_list` | crea una lista |

Gli strumenti usano le stesse funzioni dell'interfaccia: le modifiche passano dalla coda offline e arrivano in tempo reale a tutto il gruppo.

## Condivisione e sicurezza

- Ogni persona, su ogni dispositivo, ha una **chiave personale** (conservata sul server solo come impronta). Il **codice del gruppo** serve solo a chiedere di entrare: da solo non apre nulla. I permessi da amministratore sono controllati dal server.
- Una persona rimossa perde subito l'accesso, anche alla connessione in tempo reale e alle modifiche rimaste in coda offline.
- Le email (facoltative) e i messaggi delle richieste sono visibili solo agli amministratori.
- Tentativi con codici o chiavi sbagliati e richieste di accesso sono limitati; il numero di richieste in attesa per gruppo è limitato.
- Le **ricette condivise** sono raggiungibili solo da chi ha il link (identificativo casuale non indovinabile). La pagina non mostra dati del gruppo e il link si può disattivare in qualsiasi momento.
- Le **foto** sono servite tramite identificativi casuali non indovinabili, come i link condivisi.
- L'app chiede ai motori di ricerca di non indicizzare le pagine (`noindex`).

### Passaggio dalla versione 2

Fino alla versione 2 il codice del gruppo bastava per entrare. Per i gruppi creati prima della versione 3 c'è un **periodo di transizione di 30 giorni** in cui il vecchio codice funziona ancora: ogni telefono aggiornato si presenta da solo con il nome che usava e riceve la sua chiave personale. Tutti diventano amministratori (come prima, tutti potevano tutto) e i ruoli si possono poi sistemare da *Membri*. Due dispositivi con lo stesso nome sono considerati la stessa persona, e gli articoli scritti con quel nome vengono collegati a lei. Finito il periodo, chi non si è aggiornato dovrà chiedere di entrare.

## Struttura

```
api/index.js           funzione serverless per Vercel (tutte le /api/*)
server.js              server locale/self-hosted: statici + API + SSE
lib/core.js            logica delle API, schema del database e migrazioni
lib/members.js         membri: chiavi personali, ruoli, richieste, inviti, presenza
lib/util.js            funzioni di supporto del server
lib/backends.js        adattatori: SQLite o Postgres, tempo reale in memoria o LISTEN/NOTIFY
lib/http.js            adattamento richiesta/risposta HTTP
public/index.html      shell dell'app
public/version.js      versione dell'app (generato da package.json)
public/shared.js       inserimento rapido, unità, scalatura, reparti (usato da client e server)
public/js/icons.js     set di icone (reparti, liste, interfaccia) e relativi colori
public/js/core.js      stato multi-gruppo, coda offline, sincronizzazione, componenti comuni
public/js/lists.js     liste, articoli, abituali, conclusione spesa, catalogo prodotti
public/js/members.js   ingresso nei gruppi, membri, richieste, inviti, attesa
public/js/recipes.js   ricette, foto, condivisione
public/js/trips.js     storico delle spese
public/js/webmcp.js    strumenti WebMCP per gli agenti AI
public/js/settings.js  impostazioni, avvio e aggiornamenti
public/sw.js           service worker versionato (offline e aggiornamenti)
vercel.json            configurazione Vercel
scripts/               db-init, sync-version, make-icons
```
