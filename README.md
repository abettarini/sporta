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

## Avvio

Serve Node.js 22.5 o superiore. Non ci sono dipendenze da installare.

```bash
npm start
```

L'app risponde su `http://localhost:3000`. I dati stanno in un file SQLite dentro `./data`. Le variabili `PORT` e `DATA_DIR` cambiano porta e cartella.

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
server.js            API REST + SSE + file statici (node:http, node:sqlite)
public/index.html    shell dell'app
public/app.js        interfaccia, coda offline, sincronizzazione, drag & drop
public/shared.js     parsing inserimento rapido, unità, scalatura (usato da client e server)
public/sw.js         service worker (cache offline)
public/manifest.webmanifest, public/icons/
scripts/make-icons.js  rigenera le icone PNG dall'SVG (richiede Playwright)
```
