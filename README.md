# Sporta 🧺

*La spesa condivisa, in famiglia e non solo.*

Lista della spesa condivisa, installabile sul telefono come app (PWA) e aggiornata in tempo reale, con ricette e storico delle spese.

## Funzioni

### Panoramica e avvisi
- La pagina iniziale è una **panoramica di tutti i gruppi**, senza doverli cambiare: **Da fare per me** (le cose assegnate a te, con le scadenze; sotto, quelle in scadenza che non ha preso nessuno), **Da comprare** (ogni lista della spesa con quello che manca) e **tutte le liste**, gruppo per gruppo. Si può spuntare direttamente da qui, anche negli altri gruppi, e toccando una voce si apre la sua lista.
- **Avvisi** (campanella): quando qualcuno ti assegna una cosa, quando chi l'ha ricevuta tocca **Non posso**, quando una cosa che hai assegnato è fatta, e il **promemoria** delle cose assegnate a te che scadono oggi o domani (o già scadute).
- **Notifiche push** sul telefono e sul computer, anche ad app chiusa (si attivano da Altro → Avvisi, valgono per tutti i gruppi; su iPhone serve l'app installata). Gli avvisi di assegnazione e scadenza possono arrivare anche **per email**, se lo scegli per quel gruppo.

### Eventi
- **Eventi del gruppo** (cena, festa, partita…) con giorno, ora, luogo (aperto nelle mappe) e note. Tutti ricevono un avviso e rispondono **Ci sono / Forse / Non ci sono**, aggiungendo quanti **ospiti** portano (+1, +2, +3…): il totale delle persone si aggiorna in tempo reale, con chi non ha ancora risposto.
- **Liste dell'evento**: "Spesa per l'evento" e "Chi porta cosa" (una lista *Da fare* dove ognuno tocca **Prendo io**), oppure qualunque lista del gruppo collegata all'evento.
- **Calendario** del mese sugli schermi larghi, prossimi eventi nella panoramica di tutti i gruppi, esportazione in **.ics** (un evento o tutti quelli in programma) e condivisione dei dettagli.
- Avvisi quando un evento viene creato, cambia data, ora o luogo, o viene annullato, e un **promemoria il giorno prima** (a chi ha detto sì o forse e a chi non ha ancora risposto). Può modificarlo o annullarlo chi l'ha creato o un amministratore.

### Accesso con email
- Ci si riconosce con la propria **email**, senza password: si scrive l'email e arriva un **codice di 6 cifre** (o un link "Entra in Sporta" nella stessa email). La stessa schermata vale per chi è nuovo e per chi torna.
- L'email identifica la persona in **tutti i gruppi** (in ognuno con il nome che preferisce): su un nuovo dispositivo, dopo il codice, si ritrovano tutti i propri gruppi; un gruppo in cui si entra da un dispositivo compare da solo anche sugli altri.
- Chi riceve un **invito via email** non deve inserire nessun codice: il link dimostra già che l'email è sua.
- Alla creazione dell'account si accettano le **condizioni d'uso** (anche di avere almeno 14 anni) e si prende visione dell'**informativa sulla privacy** (`/termini.html`, `/privacy.html`). Quando cambiano, l'app le richiede prima di continuare.
- **Il tuo account** (in *Altro*): email (il cambio si conferma con un codice al nuovo indirizzo), **dispositivi** con l'uscita da uno, da tutti gli altri o da questo, **scarica i miei dati** ed **elimina l'account**.
- Chi usava Sporta prima degli account conferma l'email al primo avvio (si può rimandare per 14 giorni): i gruppi del dispositivo si collegano al suo account.

### Gruppi e persone
- Un telefono può partecipare a **più gruppi** (la famiglia, la squadra di calcetto, una festa…) e passare dall'uno all'altro toccando il nome del gruppo. Ogni gruppo ha liste, ricette, prodotti e spese separati.
- **Ruoli**: ogni persona ha un *permesso* — **Amministratore** o **Partecipante** — e una *relazione* descrittiva (Familiare, Amico, Collega, Ospite o personalizzata). Chi crea il gruppo ne è l'amministratore; deve sempre restarcene almeno uno.
- **Membri**: elenco delle persone con chi è **online ora**, l'ultimo accesso e quale lista sta guardando; nelle liste compaiono gli avatar di chi la sta guardando.
- **Come si entra**:
  - **link personale** creato da un amministratore (relazione e permesso già impostati, vale per una persona, scade in 7 giorni), anche inviato per email: si scrive solo il proprio nome e si entra subito;
  - **codice del gruppo** (chiunque nel gruppo può condividerlo): ci si presenta con nome, relazione e un messaggio, e l'email viene confermata con il codice prima che la richiesta arrivi agli amministratori; per impostazione predefinita un amministratore deve **accettare** la richiesta, e intanto si vede una schermata di attesa che si sblocca da sola. L'amministratore può spegnere l'approvazione (utile per un evento) e **rigenerare il codice**;
  - **nuovo gruppo**: nome della persona e nome del gruppo.
- **Inviti in attesa**: in *Membri* gli amministratori vedono gli inviti non ancora usati (a chi sono stati mandati, da chi, quando scadono) e possono **annullarli**: il link smette subito di funzionare. Gli inviti scaduti o usati vengono cancellati da soli dopo 30 giorni.
- **Richieste**: gli amministratori le vedono in cima a *Membri* (con un contatore nella navigazione) e possono correggere il nome, scegliere relazione e permesso, poi accettare, rifiutare o rifiutare e bloccare.
- **Rimozione**: un amministratore può rimuovere una persona; il suo accesso viene revocato subito e il suo telefono mostra "Non fai più parte del gruppo". Quello che aveva aggiunto resta nello storico.
- **Profilo nel gruppo**: opzione **"non mostrare quando sono online"**. Gli amministratori vedono l'email (verificata ✓) di ogni persona.
- **Email** (vedi sotto): codice per entrare, invito via email, avviso agli amministratori per ogni nuova richiesta, esito della richiesta.
- **Nomi**: unici nel gruppo (controllo mentre si scrive); in ogni gruppo ci si può presentare con un nome diverso e cambiarlo in *Altro*: lo storico si aggiorna da solo.

### Liste
- **Tipi di lista**, scelti alla creazione:
  - **Spesa**: quantità, marca, reparti, carrello e "Concludi spesa" (vedi sotto);
  - **Da fare**: chi se ne occupa, scadenza e priorità. Inserimento rapido con persona e data: `prenotare il campo @Luca venerdì !` (`!` = priorità alta; date: oggi, domani, giorni della settimana, `22/11`, `30 nov`). Chiunque può assegnare; con **Prendo io** ci si offre, con **Non posso** si rifiuta un'assegnazione. Filtri "Mie" e "Senza nessuno", ordinamento per scadenza, scadenze colorate;
  - **Libri, film e desideri**: autore o regia, stato (es. da leggere → in lettura → letto), voto, prezzo e link. Inserimento rapido `Dune - Frank Herbert`;
  - **Generica**: testo, tag e spunta.
- **Più liste** per gruppo, ognuna con il suo tipo e la sua icona.
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

### Segreto dell'app

| Variabile | Uso |
|---|---|
| `APP_SECRET` | stringa casuale lunga (**riservata**), per firmare le prove anti-spam e i link "non voglio più ricevere inviti". Si genera per esempio con `openssl rand -hex 32`. Se manca viene derivata da un altro segreto già impostato, ma è meglio impostarla. |
| `CODES_PER_HOUR_TOTAL` | facoltativa, default `600`: tetto complessivo dei codici via email all'ora (freno di emergenza). |

### Notifiche push e promemoria

| Variabile | Uso |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | chiavi per le notifiche push: si generano una volta con `npm run vapid` (la privata è **riservata**). Senza, l'app funziona e non offre le notifiche. |
| `VAPID_SUBJECT` | contatto per i servizi push, `mailto:…` o `https://…` (default: `APP_URL`) |
| `CRON_SECRET` | segreto del cron dei promemoria: Vercel lo manda da solo a `/api/cron/reminders` (vedi `crons` in `vercel.json`, una volta al giorno) |
| `APP_TIMEZONE` | facoltativa, default `Europe/Rome`: fuso usato per "oggi" e "domani" nelle scadenze |

Sul server locale le chiavi VAPID, se mancano, vengono create e salvate in `data/vapid.json`, e i promemoria partono ogni ora.

### Email

Le email (codice per entrare, inviti, avvisi agli amministratori, esito delle richieste, avvisi facoltativi) passano da **inboundemail / Procmail**, con modelli **Liquid** salvati sul servizio. Servono per entrare: senza configurazione (solo in sviluppo, in locale) il codice compare nel registro del server.

| Variabile | Uso |
|---|---|
| `EMAIL_API_KEY` | chiave API di Procmail (**riservata**) |
| `EMAIL_FROM` | mittente, su un dominio verificato per l'invio (es. `Sporta <noreply@tuodominio.it>`) |
| `APP_URL` | indirizzo pubblico dell'app, usato nei link (es. `https://sporta.vercel.app`) |
| `EMAIL_API_URL` | facoltativa, default `https://api-eu.procmail.sh` |

I modelli sono nel repository, in `emails/templates.js` (oggetto, HTML e testo per ognuno):

```bash
npm run emails:preview
```

controlla la sintassi e genera le anteprime in `emails/preview/` con dati di esempio;

```bash
EMAIL_API_KEY=... npm run emails:sync
```

crea o aggiorna i modelli sul servizio (si riconoscono per nome: `sporta-invite`, `sporta-join-request`, `sporta-request-approved`, `sporta-request-rejected`, `sporta-code`, `sporta-assigned`, `sporta-reminder`, `sporta-event`). Va rilanciato ogni volta che si modifica un modello.

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
| `sporta_get_my_overview` | tutti i gruppi insieme: cose da fare assegnate a me, cose da comprare, avvisi non letti |
| `sporta_get_members` | persone del gruppo, ruoli, chi è online (sola lettura) |
| `sporta_list_events` | eventi del gruppo con le risposte e gli ospiti |
| `sporta_create_event` | crea un evento, anche con le liste "Spesa" e "Chi porta cosa" |
| `sporta_rsvp_event` | risponde a un evento (sì, forse, no) con il numero di ospiti |
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

- Si entra con un **codice usa e getta via email** (6 cifre, valido 10 minuti, al massimo 5 tentativi, un nuovo codice ogni minuto e non più di 5 l'ora per email, con limiti anche per indirizzo IP); i codici sono conservati solo come impronta e la risposta non rivela se un'email è registrata.
- Ogni dispositivo ha una **chiave dell'account** e una chiave per ogni gruppo (conservate sul server solo come impronta): uscendo da un dispositivo si revocano tutte insieme. Il **codice del gruppo** serve solo a chiedere di entrare: da solo non apre nulla. I permessi da amministratore sono controllati dal server.
- Una persona ha al massimo un posto per gruppo.
- **Contro lo spam**:
  - prima di chiedere un codice il browser risolve una piccola prova di lavoro **ALTCHA** (in background, di solito meno di mezzo secondo, nessun servizio esterno): costa poco a una persona e molto a chi manda richieste in massa. La difficoltà cresce con le richieste dallo stesso indirizzo IP, e c'è un tetto complessivo di codici all'ora;
  - **inviti via email**: al massimo 10 al giorno per gruppo e 20 per persona (3 nelle prime 24 ore di un account nuovo), non più di 30 in attesa per gruppo;
  - in fondo a ogni invito c'è **"Non voglio più ricevere inviti"**: quell'indirizzo non ne riceve più, finché la persona non entra in Sporta con la sua email;
  - nei nomi dei gruppi e delle persone non si possono scrivere indirizzi web, e dai testi scritti dalle persone che finiscono nelle email (messaggi, articoli, eventi) gli indirizzi web vengono tolti;
  - al massimo 10 richieste di ingresso al giorno per persona e 20 avvisi per email al giorno per persona (oltre, restano nell'app e nelle notifiche);
  - i limiti sono salvati nel database, quindi valgono anche con più istanze del server.
- Una persona rimossa perde subito l'accesso, anche alla connessione in tempo reale e alle modifiche rimaste in coda offline.
- Le email e i messaggi delle richieste sono visibili solo agli amministratori; gli avvisi per email partono solo verso indirizzi confermati.
- Tentativi con codici o chiavi sbagliati e richieste di accesso sono limitati; il numero di richieste in attesa per gruppo è limitato.
- Le **ricette condivise** sono raggiungibili solo da chi ha il link (identificativo casuale non indovinabile). La pagina non mostra dati del gruppo e il link si può disattivare in qualsiasi momento.
- Le **foto** sono servite tramite identificativi casuali non indovinabili, come i link condivisi.
- L'app chiede ai motori di ricerca di non indicizzare le pagine (`noindex`).

## Struttura

```
api/index.js           funzione serverless per Vercel (tutte le /api/*)
server.js              server locale/self-hosted: statici + API + SSE
lib/core.js            logica delle API, schema del database e migrazioni
lib/accounts.js        account: codici via email, dispositivi, condizioni, i miei dati, eliminazione
lib/legal.js           versione delle condizioni d'uso e dell'informativa
lib/protect.js         protezioni contro lo spam: ALTCHA, limiti nel database, blocco degli inviti, niente link
lib/members.js         membri: chiavi di gruppo, ruoli, richieste, inviti, presenza
lib/notify.js          avvisi, notifiche push (Web Push), promemoria delle scadenze
lib/events.js          eventi, risposte con ospiti, liste collegate, promemoria del giorno prima
lib/util.js            funzioni di supporto del server
lib/backends.js        adattatori: SQLite o Postgres, tempo reale in memoria o LISTEN/NOTIFY
lib/http.js            adattamento richiesta/risposta HTTP
public/index.html      shell dell'app
public/version.js      versione dell'app (generato da package.json)
public/shared.js       inserimento rapido, unità, scalatura, reparti (usato da client e server)
public/js/icons.js     set di icone (reparti, liste, interfaccia) e relativi colori
public/js/core.js      stato multi-gruppo, coda offline, sincronizzazione, componenti comuni
public/js/lists.js     liste, articoli, abituali, conclusione spesa, catalogo prodotti
public/js/members.js   ingresso (email e codice, inviti, codice del gruppo), membri, richieste, attesa
public/js/account.js   account: codice, gruppi ritrovati, Il tuo account, condizioni, conferma dell'email
public/js/altcha-worker.js  prova di lavoro ALTCHA, calcolata in background
public/termini.html    condizioni d'uso
public/privacy.html    informativa sulla privacy
public/js/recipes.js   ricette, foto, condivisione
public/js/trips.js     storico delle spese
public/js/overview.js  panoramica di tutti i gruppi, avvisi, notifiche push
public/js/events.js    eventi: elenco, calendario, risposte, liste dell'evento, .ics
public/js/webmcp.js    strumenti WebMCP per gli agenti AI
public/js/settings.js  impostazioni, avvio e aggiornamenti
public/sw.js           service worker versionato (offline e aggiornamenti)
vercel.json            configurazione Vercel
emails/templates.js    modelli Liquid delle email
lib/mailer.js          invio delle email (inboundemail / Procmail)
scripts/               db-init, sync-version, make-icons, email-templates
```
