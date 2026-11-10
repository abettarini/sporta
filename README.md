# Sporta 🧺

*La spesa condivisa, in famiglia e non solo.*

Lista della spesa condivisa, installabile sul telefono come app (PWA) e aggiornata in tempo reale, con ricette e storico delle spese.

## Funzioni

### Panoramica e avvisi
- La pagina iniziale è una **panoramica di tutti i gruppi**, senza doverli cambiare: **Da fare per me** (le cose assegnate a te, con le scadenze; sotto, quelle in scadenza che non ha preso nessuno), **Da comprare** (ogni lista della spesa con quello che manca) e **tutte le liste**, gruppo per gruppo. Si può spuntare direttamente da qui, anche negli altri gruppi, e toccando una voce si apre la sua lista.
- **Avvisi** (campanella): quando qualcuno ti assegna una cosa, quando chi l'ha ricevuta tocca **Non posso**, quando una cosa che hai assegnato è fatta, e il **promemoria** delle cose assegnate a te che scadono oggi o domani (o già scadute).
- **Numero sull'icona** dell'app installata con gli avvisi non letti di tutti i gruppi, aggiornato anche ad app chiusa dalle notifiche push (iPhone/iPad con iOS 16.4 o successivo e computer; su Android molti launcher mostrano invece un pallino).
- **Notifiche push** sul telefono e sul computer, anche ad app chiusa (si attivano da Altro → Avvisi, valgono per tutti i gruppi; su iPhone serve l'app installata). Gli avvisi di assegnazione e scadenza possono arrivare anche **per email**, se lo scegli per quel gruppo.

### Eventi
- **Eventi del gruppo** (cena, festa, partita…) con giorno, ora, luogo (aperto nelle mappe) e note. Tutti ricevono un avviso e rispondono **Ci sono / Forse / Non ci sono**, aggiungendo quanti **ospiti** portano (+1, +2, +3…): il totale delle persone si aggiorna in tempo reale, con chi non ha ancora risposto.
- **Invito con un link** per chi non usa Sporta: dalla pagina dell'evento chi l'ha creato (o un amministratore) attiva un link `/e/<codice>` da condividere dove vuole. Chi lo apre vede l'evento e risponde con il solo **nome** (ci sono / forse / non ci sono, con gli ospiti), senza iscriversi; la risposta si ricorda sul dispositivo e un **link personale** permette di cambiarla da un altro. Chi organizza sceglie se mostrare **anche i nomi** o solo il numero, i **posti** disponibili e la **scadenza** per rispondere; vede le risposte "dal link" insieme a quelle del gruppo, può toglierle e riceve un avviso a ogni risposta. Il link si può rigenerare o disattivare. Chi usa già Sporta può **aggiungere l'evento a un suo gruppo**, con il collegamento all'invito originale. Protezioni: prova anti-spam ALTCHA, limiti per indirizzo IP e al massimo 200 risposte dal link per evento.
- **Liste dell'evento**: "Spesa per l'evento" e "Chi porta cosa" (una lista *Da fare* dove ognuno tocca **Prendo io**), oppure qualunque lista del gruppo collegata all'evento.
- **Calendario** del mese sugli schermi larghi, prossimi eventi nella panoramica di tutti i gruppi, esportazione in **.ics** (un evento o tutti quelli in programma) e condivisione dei dettagli.
- Avvisi quando un evento viene creato, cambia data, ora o luogo, o viene annullato, e un **promemoria il giorno prima** (a chi ha detto sì o forse e a chi non ha ancora risposto). Può modificarlo o annullarlo chi l'ha creato o un amministratore.

### Accesso con email
- Ci si riconosce con la propria **email**, senza password: si scrive l'email e arriva un **codice di 6 cifre** (o un link "Entra in Sporta" nella stessa email). La stessa schermata vale per chi è nuovo e per chi torna.
- L'email identifica la persona in **tutti i gruppi** (in ognuno con il nome che preferisce): su un nuovo dispositivo, dopo il codice, si ritrovano tutti i propri gruppi; un gruppo in cui si entra da un dispositivo compare da solo anche sugli altri.
- Chi riceve un **invito via email** non deve inserire nessun codice: il link dimostra già che l'email è sua.
- Alla creazione dell'account si accettano le **condizioni d'uso** (anche di avere almeno 14 anni) e si prende visione dell'**informativa sulla privacy** (`/termini.html`, `/privacy.html`). Quando cambiano, l'app le richiede prima di continuare.
- **Esci da Sporta su questo dispositivo** (in fondo ad *Altro*): il server revoca le chiavi del dispositivo e i dati locali vengono cancellati; i gruppi restano e si ritrovano entrando di nuovo con la propria email.
- **Il tuo account** (in *Altro*): email (il cambio si conferma con un codice al nuovo indirizzo), **dispositivi** con l'uscita da uno, da tutti gli altri o da questo, **scarica i miei dati** ed **elimina l'account**.
- Chi usava Sporta prima degli account conferma l'email al primo avvio (si può rimandare per 14 giorni): i gruppi del dispositivo si collegano al suo account.

### Gruppi e persone
- **Gruppo personale**: ogni persona ha uno spazio solo suo, creato da solo al primo accesso e chiamato **Personale** (il nome si può cambiare). Ha tutto quello che hanno i gruppi (liste di ogni tipo, ricette, prodotti, spese, eventi) ma niente membri, inviti, codice o presenza; non si elimina e non se ne esce. Le cose da fare lì sono tutte tue: compaiono in *Da fare per me* e i promemoria delle scadenze arrivano anche senza assegnarle.
- **Spostare una lista** in un altro gruppo (dal menu della lista): per esempio la prepari nel gruppo personale e poi la condividi con la famiglia, o viceversa. Passano anche gli articoli; le assegnazioni a persone vengono tolte.
- Un telefono può partecipare a **più gruppi** (la famiglia, la squadra di calcetto, una festa…) e passare dall'uno all'altro toccando il nome del gruppo. Ogni gruppo ha liste, ricette, prodotti e spese separati.
- **Ruoli**: ogni persona ha un *permesso* — **Amministratore** o **Partecipante** — e una *relazione* descrittiva (Familiare, Amico, Collega, Ospite o personalizzata). Chi crea il gruppo ne è l'amministratore; deve sempre restarcene almeno uno.
- **Membri**: elenco delle persone con chi è **online ora**, l'ultimo accesso e quale lista sta guardando; nelle liste compaiono gli avatar di chi la sta guardando.
- **Come si entra**:
  - **link personale** creato da un amministratore (relazione e permesso già impostati, vale per una persona, scade in 7 giorni), anche inviato per email: si scrive solo il proprio nome e si entra subito. Chi invita può indicare anche il **nome** della persona: chi apre l'invito lo trova già scritto e può cambiarlo;
  - **codice del gruppo** (chiunque nel gruppo può condividerlo): ci si presenta con nome, relazione e un messaggio, e l'email viene confermata con il codice prima che la richiesta arrivi agli amministratori; per impostazione predefinita un amministratore deve **accettare** la richiesta, e intanto si vede una schermata di attesa che si sblocca da sola. L'amministratore può spegnere l'approvazione (utile per un evento) e **rigenerare il codice**;
  - **nuovo gruppo**: nome della persona e nome del gruppo.
- **Inviti in attesa**: in *Membri* gli amministratori vedono gli inviti non ancora usati (a chi sono stati mandati, da chi, quando scadono) e possono **annullarli**: il link smette subito di funzionare. Gli inviti scaduti o usati vengono cancellati da soli dopo 30 giorni.
- **Richieste**: gli amministratori le vedono in cima a *Membri* (con un contatore nella navigazione) e possono correggere il nome, scegliere relazione e permesso, poi accettare, rifiutare o rifiutare e bloccare.
- **Eliminare un gruppo**: un amministratore può eliminarlo da *Altro* (bisogna scriverne il nome per confermare). Si cancellano per tutti liste, articoli, ricette e foto, eventi, storico delle spese, membri e inviti; le altre persone ricevono un avviso e il gruppo sparisce dai loro dispositivi.
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
- Il **catalogo** si riempie da solo con quello che si aggiunge alle liste e alle ricette. Da *Altro → Prodotti* si impostano reparto, tag, quantità e marca abituali e la ★. Il **nome** di un prodotto si può correggere (per esempio "Hamburge" → "Hamburger"): l'app propone di correggerlo anche negli articoli delle liste e negli ingredienti delle ricette del gruppo, e se il nome giusto è già nel catalogo i due prodotti si uniscono.

### Spese
- **Concludi spesa** salva gli articoli presi nello storico, con data, chi l'ha fatta, negozio e totale (facoltativi), e li toglie dalla lista.
- Nella scheda **Spese** lo storico è diviso per mese, con il totale mensile; da una spesa passata si possono **rimettere in lista** gli articoli scelti.


### Alimenti e valori nutrizionali

- **Database centrale degli alimenti** (`public/foods.json`, generato da `scripts/foods/`): circa 400 alimenti generici in italiano con varianti (latte → intero, scremato, senza lattosio…), circa 1.500 nomi alternativi (plurali, sinonimi, scritture diverse), reparto, peso medio di un pezzo, densità e valori per 100 g da **CIQUAL 2025 (ANSES)** e **USDA FoodData Central**. È unico per tutti i gruppi e funziona anche offline.
- **Riconoscimento dei nomi**: "2 spicchi d'aglio", "parmigiano reggiano dop da grattugiare", "latte intero a temperatura ambiente", "uova medie" vengono ricondotti all'alimento giusto (aggiunte, misure, plurali). Sulle ricette reali riconosce circa il 98% degli ingredienti.
- **Meno doppioni**: "uovo" e "uova" sono lo stesso articolo in lista (le quantità si sommano) e lo stesso prodotto nel catalogo; i suggerimenti mostrano anche i nomi del database ("zucch" → Zucchine); il reparto viene dal database.
- **Valori per porzione** nella scheda della ricetta: kcal, proteine, carboidrati (zuccheri), grassi (saturi), fibre e sale, con la copertura ("calcolati su 9 ingredienti su 10"), gli ingredienti senza quantità esclusi, l'avviso quando un valore è stimato da un alimento simile e la citazione delle fonti. Sono indicativi e calcolati sugli ingredienti crudi.
- Le caratteristiche suggerite (con carne, con pesce, vegetariana, vegana) usano il tipo degli alimenti del database.
- **Segnala un errore** (nel riquadro dei valori): alimento sbagliato, valori sbagliati, alimento mancante; arriva agli amministratori senza dati del gruppo (massimo 20 al giorno per persona).
- **Gestione per gli amministratori** (*Altro → Alimenti*, per chi è in `ADMIN_EMAILS`): modifica degli alimenti (nome, reparto, tipo, variante di, valori per 100 g, peso di un pezzo, densità, misure, nomi alternativi), nuovi alimenti ed eliminazione; coda **Da riconoscere** con i nomi di articoli e ingredienti non riconosciuti, mostrati quando compaiono in almeno 2 gruppi (solo conteggi: il gruppo è registrato come impronta, senza dire quale), da collegare a un alimento, trasformare in un alimento nuovo o ignorare; elenco delle **segnalazioni**. Le correzioni stanno nel database (tabelle `food_edits`, `food_alias_edits`) sopra `public/foods.json` e valgono subito per tutti: lo stato porta `foods_version` e le app riscaricano `/api/foods` solo quando cambia. "Scarica" salva il database completo, da riportare in `public/foods.json`.
### Ricette
- Foto, descrizione, **difficoltà**, **tempi di preparazione e cottura**, ingredienti e **procedimento a passaggi** (riordinabili con drag & drop).
- **Autocompletamento** degli ingredienti dal catalogo e dalle altre ricette; gli ingredienti nuovi entrano subito nei suggerimenti.
- Si sceglie per quante persone cucinare: le quantità vengono ricalcolate e arrotondate in modo sensato (uova e pezzi interi, grammi a 5/10). Si deselezionano gli ingredienti già in casa e il resto va nella lista.
- **Parte pubblica delle ricette (spenta per ora)**: tutto ciò che segue — ricette pubbliche, Scopri, preferite, Ricettari, pagine web — funziona solo con `PUBLIC_RECIPES=1`. Spenta (il default), le nuove ricette sono private, le schede Mie/Preferite/Scopri, la firma e il tipo Ricettario spariscono, ricerca, stelle e ricette di altri gruppi sono rifiutate anche dal server, le pagine `/ricetta/…` rispondono 404, la sitemap è vuota e `robots.txt` esclude tutto. Le ricette già pubbliche e le preferite restano nel database: riaccendendo la variabile torna tutto com'era (per toglierle davvero: `npm run admin -- rendi-private --tutti --si`).
- **Ricette pubbliche e Scopri**: ogni ricetta è *privata* (solo il gruppo) o *pubblica* (la trovano tutti). Le ricette che esistevano prima restano private; per quelle nuove l'interruttore **Pubblica** parte attivo. Alla prima pubblicazione si sceglie la **firma** (proposta: "<nome> da <gruppo>", nel gruppo Personale solo il nome; oppure un altro nome o Anonimo), che si cambia da *Altro* e vale per le pubblicazioni successive. Ogni ricetta ha una **portata** e delle **caratteristiche** (vegetariana, vegana, con carne, con pesce, senza glutine, senza lattosio, veloce, per bambini, economica, light, da preparare prima, al forno): quelle calcolabili vengono suggerite dagli ingredienti e dai tempi e si confermano con un tocco.
- In **Ricette → Scopri** si cerca tra le ricette pubbliche di tutti per nome o ingrediente, con filtri per portata, caratteristiche, ingredienti *con* (tutti) e *senza*, tempo massimo e ordine. Una ricetta di un altro gruppo si apre in sola lettura: si scelgono le persone, si mettono gli ingredienti in lista (nota "per <ricetta>"), si **salva una copia** (privata, con "Da una ricetta di …") o si **segnala**. Nei testi pubblici non sono ammessi link; al massimo 20 pubblicazioni al giorno per gruppo.
- **Preferite**: la ★ su una ricetta pubblica (in Scopri o nella ricetta) la mette in *Ricette → Preferite*. Le preferite sono della persona, non del gruppo: si ritrovano in tutti i propri gruppi, si aprono anche senza rete e si usano in **La faccio** come le ricette proprie (il menu del gruppo porta con sé i dati della ricetta, così la vedono tutti i membri). Sono un riferimento all'originale: se l'autore la corregge si vede la versione nuova; se la rende privata o la elimina resta in fondo, grigia, con "non più disponibile" finché non la si toglie, ed esce dai menu degli altri gruppi. Le ricette pubbliche mostrano quante persone le hanno tra le preferite.
- **Ricettario**: un tipo di gruppo (*Nuovo gruppo → Ricettario*) con solo ricette, tutte pubbliche e firmate con il nome del ricettario (rinominandolo cambia la firma di tutte). Niente liste, eventi e spese; si possono invitare altre persone a scrivere. Ha una pagina web con tutte le ricette divise per portata e una descrizione (*Altro → Ricettario*). È il modo per mettere ricette pubbliche nel sistema, anche importandole da file.
- **Pagine web delle ricette pubbliche**: `/ricetta/<nome>-<codice>` (se il nome cambia, il vecchio indirizzo reindirizza) e `/ricettario/<nome>-<codice>`, generate sul server e trovabili dai motori di ricerca, con i dati strutturati *schema.org/Recipe* (ingredienti, passaggi, tempi, porzioni, diete), anteprima per i social, `sitemap.xml` e `robots.txt` (indicizzabili solo queste pagine e le foto). Mostrano solo la firma, mai email, membri o altri dati del gruppo. Le ricette private o nascoste non hanno pagina (404).
- **Importa ricette** (*Altro → Importa ricette*): da un file JSON, con anteprima, avvisi e scelta delle ricette (al massimo 200 per file). Nel ricettario diventano pubbliche; negli altri gruppi restano private salvo `"visibility": "public"`. Le foto si importano se sono dentro il file (`photos_data`, immagini in base64; servono la rete e file fino a 40 MB). Formato: vedi [Importazione di ricette](#importazione-di-ricette).
- **Gruppi di sistema** (*Altro → Gruppi di sistema*, solo per `ADMIN_EMAILS`): gruppi che non appartengono a nessuno, per esempio "Ricette di Sporta". Dentro c'è il membro "Sporta", senza account, il cui **token** serve agli script (*Nuovo token per gli script*, che revoca i precedenti); l'amministratore che li crea ci entra con il proprio account e gli altri amministratori con *Entra*. Possono essere un gruppo privato (per le prove, anche con ricette scaricate da altri siti) o un Ricettario pubblico (solo per ricette proprie).
- **Segnalazioni**: dopo 3 segnalazioni da persone diverse una ricetta pubblica viene nascosta. Gli amministratori della piattaforma (variabile `ADMIN_EMAILS`, email separate da virgola) le rivedono da *Altro → Segnalazioni* e le nascondono o ripristinano.
- **La faccio**: dalla ricetta si tocca *La faccio* e si apre *Preparo*, il menu del gruppo (visibile e modificabile da tutti, resta finché qualcuno non lo svuota). Si possono mettere più ricette, ognuna con le sue persone: gli ingredienti uguali si sommano quando le unità sono compatibili. Ogni ingrediente si segna **Ce l'ho** o **Da comprare** (scelta condivisa, in tempo reale), con gli indizi *già in lista*, *comprato N giorni fa* (ultimi 7 giorni) e *sempre in casa*. *Aggiungi* mette nella lista scelta quello che manca, con la nota "per <ricetta>" e sommando a quello che c'è già; il messaggio offre *Annulla*. Eliminare una ricetta la toglie dal menu.
- **Sempre in casa**: nella scheda di un prodotto (*Altro → Prodotti*, con il filtro apposito) si segnano sale, olio e simili; nel menu partono come *Ce l'ho*.
- **Condivisione con link privato** (non indicizzato e revocabile): chi lo apre vede la ricetta anche senza Sporta e, se usa Sporta, può salvarla nelle sue ricette. Le ricette si possono anche copiare in un altro dei propri gruppi.

### App
- **Installazione curata**: nella finestra "Installa app" compaiono descrizione e screenshot (telefono e computer); icone adattive e monocrome (icone a tema di Android, sagoma bianca nelle notifiche); schermata di avvio con il logo su iPhone e iPad, chiara o scura; l'app gira anche in orizzontale sui tablet.
- **Scorciatoie** tenendo premuta l'icona (o con il tasto destro sul computer): Liste, Eventi, Avvisi, Ricette.
- **Condividi con Sporta**: dall'app installata (Android e computer) Sporta compare nel menu "Condividi" delle altre app; un testo condiviso (una lista ricevuta in chat, gli ingredienti di una ricetta…) diventa voci da aggiungere alla lista scelta, una per riga, con quantità e unità riconosciute. Se prima bisogna entrare in Sporta, il contenuto aspetta.
- Aprendo un link o una notifica sul computer si usa la finestra di Sporta già aperta.
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
| `BLOB_READ_WRITE_TOKEN` | facoltativa: con un **Vercel Blob** store collegato al progetto (Vercel la imposta da sola) le foto nuove vanno lì invece che nel database. Per spostare quelle già nel database: `npm run admin -- foto-su-blob --si`. Vedi [Foto](#foto). |
| `PUBLIC_RECIPES` | facoltativa: `1` accende la parte pubblica delle ricette (Scopri, preferite, Ricettari, pagine web). Spenta se manca. |
| `ADMIN_EMAILS` | facoltativa: email (separate da virgola) degli amministratori della piattaforma, che vedono *Altro → Segnalazioni* (ricette pubbliche segnalate) e *Altro → Alimenti* (database degli alimenti). |
| `APP_TIMEZONE` | facoltativa, default `Europe/Rome`: fuso usato per "oggi" e "domani" nelle scadenze |

Sul server locale le chiavi VAPID, se mancano, vengono create e salvate in `data/vapid.json`, e i promemoria partono ogni ora.

### Email

Le email (codice per entrare, inviti, avvisi agli amministratori, esito delle richieste, avvisi facoltativi) passano da **inboundemail / Procmail**, con modelli **Liquid** salvati sul servizio. Servono per entrare: senza configurazione (solo in sviluppo, in locale) il codice compare nel registro del server.

| Variabile | Uso |
|---|---|
| `EMAIL_API_KEY` | chiave API di Procmail (**riservata**) |
| `EMAIL_FROM` | mittente, su un dominio verificato per l'invio (es. `Sporta <noreply@tuodominio.it>`) |
| `APP_URL` | indirizzo pubblico dell'app, usato nei link e negli indirizzi canonici delle pagine web delle ricette e nella sitemap (es. `https://sporta.vercel.app`; se manca si usa l'indirizzo della richiesta) |
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
| `sporta_search_public_recipes` | cerca tra le ricette pubbliche (nome, portata, caratteristiche, ingredienti con/senza, tempo) |
| `sporta_get_menu`, `sporta_cook_recipe`, `sporta_mark_menu_ingredients`, `sporta_add_menu_to_list` | menu "La faccio": legge, aggiunge ricette, segna Ce l'ho / Da comprare, mette in lista quello che manca |
| `sporta_get_shopping_history` | storico delle spese |
| `sporta_create_list` | crea una lista |

Gli strumenti usano le stesse funzioni dell'interfaccia: le modifiche passano dalla coda offline e arrivano in tempo reale a tutto il gruppo.

## Foto

Le foto delle ricette vengono ridimensionate nel browser (lato lungo 1600 px, JPEG) e caricate dal server. Dove finiscono dipende da `BLOB_READ_WRITE_TOKEN`:

- **senza**: nel database (tabella `photos`), come all'inizio;
- **con un Vercel Blob store** (*Storage → Create → Blob* nel progetto su Vercel, accesso pubblico): il file va in `photos/<gruppo>/<id>.<ext>` sul Blob store e nel database resta solo una riga con l'indirizzo.

L'app usa sempre `/api/photos/<id>`: per le foto sul Blob store il server risponde con un reindirizzamento, quindi link e pagine già esistenti continuano a funzionare e le due modalità convivono. Il service worker le tiene in cache per l'uso offline. Togliere una foto da una ricetta, eliminare la ricetta o il gruppo, eliminare l'account o usare `cancella-ricette` cancella anche il file sul Blob store; le ricette copiate in un altro gruppo hanno una copia propria del file. Per provare in locale con lo stesso store basta mettere il token nell'ambiente (`vercel env pull` o copiandolo dal pannello).

## Amministrazione da riga di comando

`scripts/admin.js` lavora direttamente sul database configurato (`DATABASE_URL`/`POSTGRES_URL`, altrimenti SQLite in `DATA_DIR`). Per il database su Neon basta lanciarlo con la stessa `DATABASE_URL` di Vercel.

```bash
npm run admin -- gruppi
```

```bash
npm run admin -- ricette "Ricette di Sporta"
```

```bash
npm run admin -- cancella-ricette "Ricette di Sporta" --si
```

```bash
npm run admin -- rendi-private --tutti --si
```

| Comando | Cosa fa |
|---|---|
| `gruppi [testo]` | elenco dei gruppi (identificativo, codice, nome, tipo, membri, ricette, pubbliche), filtrabile per nome |
| `ricette <gruppo>` | le ricette di un gruppo |
| `cancella-ricette <gruppo> [--pubbliche]` | cancella le ricette del gruppo (o solo le pubbliche), con foto, preferite e voci del menu "La faccio" |
| `rendi-private <gruppo> \| --tutti` | toglie la pubblicazione |
| `foto` | quante foto ci sono e quanto spazio occupano, nel database e sul Blob store, con i gruppi che ne hanno di più |
| `foto-su-blob` | sposta sul Blob store le foto ancora nel database (serve `BLOB_READ_WRITE_TOKEN`); si può rilanciare se si interrompe |

`<gruppo>` è l'identificativo (bastano le prime 8 cifre), il codice d'invito o il nome esatto; se il nome corrisponde a più gruppi lo script li elenca e si ferma. Senza `--si` i comandi che cambiano i dati mostrano solo cosa farebbero. Su Postgres le app aperte ricaricano i dati da sole.

## Importazione di ricette

Il file JSON può essere un elenco di ricette, un oggetto `{ "recipes": [...] }` oppure ricette nel formato [schema.org/Recipe](https://schema.org/Recipe) (anche dentro `@graph`, come le pubblicano molti siti). L'app ne propone un esempio (*Scarica un esempio*).

```json
{
  "recipes": [
    {
      "name": "Pasta zucchine e menta",
      "description": "Un primo veloce e fresco.",
      "servings": 4, "prep_min": 10, "cook_min": 15, "difficulty": "facile",
      "course": "primo", "traits": ["vegetariana", "veloce"],
      "ingredients": ["320 g spaghetti", "600 g zucchine", { "name": "Pecorino", "qty": 60, "unit": "g" }, "sale q.b."],
      "steps": ["Taglia le zucchine.", "Cuoci la pasta.", "Manteca con pecorino e menta."],
      "visibility": "public"
    }
  ]
}
```

| Campo | Note |
|---|---|
| `name` | obbligatorio |
| `servings` / `recipeYield` | persone (default 4) |
| `prep_min`, `cook_min` / `prepTime`, `cookTime`, `totalTime` | minuti, oppure durate ISO 8601 (`PT1H30M`) |
| `difficulty` | `facile`, `media`, `difficile` (anche `easy`, `medium`, `hard`) |
| `course` / `recipeCategory` | `antipasto`, `primo`, `secondo`, `contorno`, `unico`, `dolce`, `colazione`, `salsa`, `pane`, `bevanda` (riconosce anche le etichette e parole come "Dessert", "Primi piatti") |
| `traits` / `suitableForDiet` | `vegetariana`, `vegana`, `carne`, `pesce`, `senza-glutine`, `senza-lattosio`, `veloce`, `bambini`, `economica`, `light`, `prima`, `forno` |
| `ingredients` / `recipeIngredient` | testo come nell'inserimento rapido (`"150 g guanciale"`, `"pepe q.b."`) o oggetti `{ name, qty, unit, brand }` |
| `steps` / `recipeInstructions` | testi, `{ "text": … }` o sezioni `HowToSection` |
| `visibility` | `public` o `private` (ignorato nel ricettario, dove tutto è pubblico) |
| `photos_data` | fino a 4 foto come data URL (`data:image/jpeg;base64,…`; JPEG, PNG o WebP, al massimo 3 MB ciascuna). Gli indirizzi web delle foto (`image`) non vengono scaricati |

Le ricette pubbliche non possono contenere indirizzi web: nel ricettario vengono scartate, negli altri gruppi restano private.

### Ricette di prova da siti di cucina

Per popolare e provare un'istanza c'è `scripts/fetch-recipes.js`: legge i dati strutturati *schema.org/Recipe* che pubblicano quasi tutti i siti di cucina (provato con GialloZafferano, Misya, ricetta.it, Cucchiaio d'Argento) dagli indirizzi elencati in un file, uno per riga.

```bash
node scripts/fetch-recipes.js urls.txt --push http://localhost:3000 --token m_…
```

```bash
node scripts/fetch-recipes.js urls.txt --out ricette.json --images foto
```

Con `--push` carica ricette e foto (fino a `--photos 4`) direttamente nel gruppo della chiave indicata: nell'app, dalla console del browser, `tokenFor(st.code)`. Con `--out` scrive un file per *Importa ricette* (che non importa le foto) e, con `--images`, salva le foto in una cartella. Le ricette sono **sempre private**, con l'indirizzo della fonte nella descrizione (che impedisce di renderle pubbliche); lo script si rifiuta di scrivere in un Ricettario. Testi e foto restano di chi li ha pubblicati: servono solo per provare. Legge solo gli indirizzi indicati (al massimo 500), rispetta `robots.txt`, aspetta `--delay` secondi (default 2) tra una richiesta e l'altra e si presenta come `SportaTestImporter`. Le ricette con un nome già presente si saltano (`--duplicates` per caricarle comunque). Dietro un proxy aziendale serve `NODE_USE_ENV_PROXY=1`. In `scripts/urls-esempio.txt` ci sono 500 indirizzi pronti (GialloZafferano, Misya, ricetta.it, Cucchiaio d'Argento, di tutte le portate): con la pausa di 2 secondi, e le foto, il caricamento dura circa mezz'ora. Se nei dati strutturati manca il procedimento, lo script lo prende dal testo sotto il titolo "Procedimento" o "Preparazione" della pagina.

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

## Sito di presentazione

Nella cartella `site/` c'è il sito che presenta l'app (italiano in `/`, inglese in `/en/`), statico e senza dipendenze: nessun font, script o servizio esterno.

- **Nome e indirizzi** in `site/site.config.js` (`name`, `appUrl` dell'app, `siteUrl` quando c'è il dominio, `contactEmail`); i testi in `site/src/strings.js` (`{name}` diventa il nome).
- `npm run site:build` genera `site/dist`, usando gli screenshot e le icone dell'app (`public/screenshots`, `public/icons`); con `siteUrl` impostato genera anche link canonici e `sitemap.xml`.
- `npm run site:og` rigenera le immagini di anteprima per i social (serve Playwright).
- **Pubblicazione su Vercel**: un secondo progetto dallo stesso repository, con *Root Directory* `site` (il resto è in `site/vercel.json`). Lasciare attiva l'opzione che include i file fuori dalla Root Directory, perché il sito usa le immagini dell'app.

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
lib/menu.js            menu "La faccio": ricette da preparare e scelte Ce l'ho / Da comprare
lib/foods.js           database degli alimenti: correzioni degli amministratori, nomi non riconosciuti, segnalazioni
lib/pubrecipes.js      ricette pubbliche: visibilità, firma, ricerca, preferite, segnalazioni
lib/pages.js           pagine web delle ricette e dei ricettari, sitemap.xml, robots.txt
lib/photos.js          foto delle ricette: nel database o su Vercel Blob
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
public/js/cook.js      "La faccio": menu condiviso e ingredienti da comprare
public/js/discover.js  Scopri, preferite, ricette pubbliche di altri, firma, segnalazioni
public/js/import.js    importazione di ricette da file JSON
public/foods-lib.js    database degli alimenti: riconoscimento dei nomi, grammi, valori per porzione (client e server)
public/foods.json      il database degli alimenti (generato da scripts/foods/)
public/js/foodsadmin.js  segnalazioni sugli alimenti e gestione per gli amministratori (Altro → Alimenti)
public/js/trips.js     storico delle spese
public/js/overview.js  panoramica di tutti i gruppi, avvisi, notifiche push
public/js/events.js    eventi: elenco, calendario, risposte, liste dell'evento, .ics
public/js/webmcp.js    strumenti WebMCP per gli agenti AI
public/js/settings.js  impostazioni, avvio e aggiornamenti
public/sw.js           service worker versionato (offline e aggiornamenti)
vercel.json            configurazione Vercel
emails/templates.js    modelli Liquid delle email
lib/mailer.js          invio delle email (inboundemail / Procmail)
scripts/               db-init, sync-version, make-icons (icone, scorciatoie, schermate di avvio: npm run icons), email-templates
public/screenshots/    screenshot per la finestra di installazione (e per gli store)
public/js/share.js     "Condividi con Sporta": testo condiviso da altre app → voci di una lista
```
