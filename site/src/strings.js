// Testi del sito in italiano e inglese. "{name}" diventa il nome dell'app (site.config.js).
module.exports = {
  it: {
    lang: 'it',
    title: '{name} – liste, cose da fare ed eventi condivisi',
    description: 'La lista della spesa, le cose da fare e gli eventi di famiglia, amici e squadra, condivisi in tempo reale. Anche offline, senza password. Inizia gratis.',
    nav: { features: 'Funzioni', how: 'Come funziona', faq: 'Domande', open: 'Apri {name}' },
    hero: {
      kicker: 'Per la famiglia, gli amici, la squadra. E per te.',
      title: 'Le liste di tutti, <span>finalmente</span> nello stesso posto.',
      text: 'La spesa da fare, le cose di casa, la cena di sabato con gli amici: {name} tiene tutto insieme e lo aggiorna in tempo reale su ogni telefono. Chi è al supermercato vede subito cosa hai aggiunto.',
      cta: 'Inizia gratis',
      cta2: 'Guarda come funziona',
      note: 'Nessuna password: entri con la tua email. Funziona su telefono, tablet e computer.',
    },
    audiences: {
      title: 'Una sola app, tre modi di usarla',
      items: [
        { icon: 'home', title: 'In famiglia', text: 'La lista della spesa divisa per reparto, come nei corridoi del supermercato. Le cose da fare con chi se ne occupa e la scadenza. Le ricette che si adattano al numero di persone e finiscono in lista con un tocco.' },
        { icon: 'ball', title: 'Con amici e squadra', text: 'La partita, la gita, la cena: un evento dove ognuno risponde “ci sono”, “forse” o “no” e dice quanti ospiti porta. Con la lista “Chi porta cosa”, così nessuno porta tre torte.' },
        { icon: 'me', title: 'Solo per te', text: 'Uno spazio personale, solo tuo, per le tue liste e le tue cose da fare. Sempre con te su tutti i dispositivi, e quando serve lo condividi con un tocco.' },
      ],
    },
    features: {
      title: 'Tutto quello che serve, niente di più',
      items: [
        ['live', 'In tempo reale', 'Aggiungi il latte e chi è al supermercato lo vede subito. Spunti un articolo e sparisce per tutti.'],
        ['offline', 'Anche senza rete', 'In cantina, in montagna o al supermercato senza campo: modifichi lo stesso, si sincronizza dopo.'],
        ['overview', 'Tutto in una pagina', 'Cosa devi fare, cosa c’è da comprare e i prossimi eventi di tutti i tuoi gruppi, senza passare da uno all’altro.'],
        ['todo', 'Cose da fare', 'Scrivi “prenotare il campo @Luca venerdì” e {name} capisce chi, quando e quanto è urgente. Promemoria prima della scadenza.'],
        ['event', 'Eventi e inviti', 'Risposte, ospiti, posti disponibili. E un link per invitare anche chi non usa l’app: risponde con il nome, senza iscriversi.'],
        ['recipe', 'Ricette', 'Con foto, tempi e passaggi. Scegli per quante persone cucinare e gli ingredienti finiscono nella lista della spesa.'],
        ['bell', 'Avvisi', 'Una notifica quando ti assegnano qualcosa, quando una scadenza si avvicina o quando qualcuno risponde a un tuo evento.'],
        ['receipt', 'Storico della spesa', 'Concludi la spesa con negozio e totale: ritrovi cosa hai comprato e lo rimetti in lista in un attimo.'],
      ],
    },
    how: {
      title: 'Si comincia in un minuto',
      steps: [
        ['Entra con la tua email', 'Ti mandiamo un codice: niente password da ricordare. Trovi subito il tuo spazio personale.'],
        ['Crea un gruppo e invita', 'La famiglia, la squadra, la festa. Mandi un link su WhatsApp: chi lo apre scrive il suo nome ed è dentro.'],
        ['Scrivete, spuntate, organizzate', 'Ognuno dal suo telefono, nello stesso momento. Anche più gruppi insieme, senza confondersi.'],
      ],
    },
    gallery: {
      title: 'Fatta per il telefono. Comoda anche sul computer.',
      shots: ['La panoramica di tutti i gruppi', 'La spesa, per reparto', 'Le cose da fare', 'Un evento con le risposte'],
    },
    install: {
      title: 'Non serve lo store',
      text: '{name} si usa dal browser e si installa come un’app, con l’icona sulla schermata Home e le notifiche.',
      items: [
        ['Android', 'Apri {name} con Chrome e tocca “Installa app”.'],
        ['iPhone e iPad', 'Apri {name} con Safari, tocca Condividi e poi “Aggiungi alla schermata Home”.'],
        ['Computer', 'Con Chrome o Edge, clicca l’icona di installazione nella barra degli indirizzi.'],
      ],
    },
    trust: {
      title: 'I tuoi dati restano tuoi',
      items: [
        'Niente pubblicità e niente tracciamento.',
        'Le tue liste le vedono solo le persone dei tuoi gruppi.',
        'Puoi scaricare i tuoi dati o eliminare l’account quando vuoi.',
      ],
    },
    faq: {
      title: 'Domande frequenti',
      items: [
        ['Quanto costa?', '{name} è gratis. Nessuna pubblicità.'],
        ['Devo installare qualcosa?', 'No: funziona dal browser. Se vuoi, la installi come un’app in due tocchi, senza passare dallo store.'],
        ['Chi invito deve iscriversi?', 'Per entrare in un gruppo basta l’email, senza password. Agli eventi, invece, si può rispondere da un link anche senza account: basta il nome.'],
        ['Posso usarla da solo?', 'Certo: hai sempre uno spazio personale solo tuo. Quando vuoi condividere una lista, la sposti in un gruppo.'],
        ['Funziona senza internet?', 'Sì. Le modifiche fatte senza rete vengono inviate appena torna la connessione.'],
        ['Funziona su iPhone?', 'Sì, da Safari. Per le notifiche aggiungila alla schermata Home (iOS 16.4 o successivo).'],
      ],
    },
    final: { title: 'Pronto a smettere di dimenticare il latte?', cta: 'Inizia gratis' },
    footer: { privacy: 'Privacy', terms: 'Condizioni d’uso', contact: 'Contatti', made: 'Fatto in Italia.' },
    langSwitch: 'English',
  },

  en: {
    lang: 'en',
    title: '{name} – shared lists, to-dos and events',
    description: 'Shopping lists, to-dos and events for your family, friends and team, shared in real time. Works offline, no passwords. Get started for free.',
    nav: { features: 'Features', how: 'How it works', faq: 'FAQ', open: 'Open {name}' },
    hero: {
      kicker: 'For your family, your friends, your team. And for you.',
      title: 'Everyone’s lists, <span>finally</span> in one place.',
      text: 'The groceries, the chores, Saturday’s dinner with friends: {name} keeps it all together and updates it in real time on every phone. Whoever is at the store sees what you just added.',
      cta: 'Get started free',
      cta2: 'See how it works',
      note: 'No passwords: sign in with your email. Works on phones, tablets and computers. The app is in Italian for now.',
    },
    audiences: {
      title: 'One app, three ways to use it',
      items: [
        { icon: 'home', title: 'With your family', text: 'A shopping list sorted by aisle, just like the supermarket. Chores with who’s on it and when it’s due. Recipes that scale to the number of people and go to the list in one tap.' },
        { icon: 'ball', title: 'With friends and teams', text: 'The match, the trip, the dinner: an event where everyone answers “in”, “maybe” or “out” and says how many guests they bring. Plus a “Who brings what” list, so nobody brings three cakes.' },
        { icon: 'me', title: 'Just for you', text: 'A personal space that’s only yours, for your own lists and to-dos. With you on every device — and shareable with one tap when you need it.' },
      ],
    },
    features: {
      title: 'Everything you need, nothing more',
      items: [
        ['live', 'Real time', 'Add milk and whoever is at the store sees it instantly. Check an item and it’s gone for everyone.'],
        ['offline', 'Works offline', 'In the basement, in the mountains, at a store with no signal: keep editing, it syncs later.'],
        ['overview', 'Everything on one page', 'What you need to do, what to buy and upcoming events from all your groups, without switching.'],
        ['todo', 'To-dos', 'Type “book the pitch @Luca friday” and {name} understands who, when and how urgent. Reminders before the deadline.'],
        ['event', 'Events and invites', 'Answers, guests, available seats. And a link to invite people who don’t use the app: they reply with their name, no sign-up.'],
        ['recipe', 'Recipes', 'With photos, times and steps. Choose how many people you’re cooking for and the ingredients land on the shopping list.'],
        ['bell', 'Notifications', 'A heads-up when someone assigns you something, when a deadline is close or when someone answers your event.'],
        ['receipt', 'Shopping history', 'Finish a trip with store and total: see what you bought and put it back on the list in a moment.'],
      ],
    },
    how: {
      title: 'Up and running in a minute',
      steps: [
        ['Sign in with your email', 'We send you a code: no password to remember. Your personal space is ready right away.'],
        ['Create a group and invite', 'Family, team, party. Send a link on WhatsApp: whoever opens it types their name and they’re in.'],
        ['Write, check, organize', 'Everyone from their own phone, at the same time. Several groups too, without mixing things up.'],
      ],
    },
    gallery: {
      title: 'Made for your phone. Handy on your computer too.',
      shots: ['An overview of all your groups', 'Groceries, by aisle', 'To-dos', 'An event with answers'],
    },
    install: {
      title: 'No app store needed',
      text: '{name} runs in your browser and installs like an app, with a home screen icon and notifications.',
      items: [
        ['Android', 'Open {name} in Chrome and tap “Install app”.'],
        ['iPhone and iPad', 'Open {name} in Safari, tap Share, then “Add to Home Screen”.'],
        ['Computer', 'In Chrome or Edge, click the install icon in the address bar.'],
      ],
    },
    trust: {
      title: 'Your data stays yours',
      items: [
        'No ads and no tracking.',
        'Only the people in your groups see your lists.',
        'Download your data or delete your account whenever you like.',
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        ['How much does it cost?', '{name} is free. No ads.'],
        ['Do I need to install anything?', 'No: it works in your browser. If you like, install it as an app in two taps, without an app store.'],
        ['Do the people I invite need to sign up?', 'Joining a group only takes an email, no password. To answer an event, a link is enough — just a name, no account.'],
        ['Can I use it on my own?', 'Of course: you always have a personal space. When you want to share a list, move it to a group.'],
        ['Does it work without internet?', 'Yes. Changes made offline are sent as soon as you’re back online.'],
        ['Does it work on iPhone?', 'Yes, in Safari. For notifications, add it to your Home Screen (iOS 16.4 or later).'],
        ['Is it available in English?', 'The website is; the app is in Italian for now.'],
      ],
    },
    final: { title: 'Ready to stop forgetting the milk?', cta: 'Get started free' },
    footer: { privacy: 'Privacy', terms: 'Terms', contact: 'Contact', made: 'Made in Italy.' },
    langSwitch: 'Italiano',
  },
};
