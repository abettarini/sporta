'use strict';
/* Sporta — strumenti WebMCP per gli agenti AI del browser.
   WebMCP (proposta W3C, sperimentale) permette a una pagina di esporre "strumenti" con
   navigator.modelContext.registerTool(). Qui gli strumenti usano le stesse funzioni
   dell'interfaccia: le modifiche passano dalla coda offline e arrivano in tempo reale
   agli altri membri del gruppo. Nei browser senza WebMCP questo file non fa nulla. */

(function registerWebMcp() {
  const mc = navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
  const fail = (msg) => ({ content: [{ type: 'text', text: 'Errore: ' + msg }], isError: true });
  const needGroup = () => (st.code ? null : fail('Nessun gruppo configurato su questo dispositivo: prima crea o unisciti a un gruppo.'));

  function findList(name) {
    const lists = sortedLists();
    if (!lists.length) throw new Error('Il gruppo non ha liste.');
    if (!name) return st.lists.get(lastListId()) || lists[0];
    const n = S.normName(name);
    const l = lists.find((x) => S.normName(x.name) === n) || lists.find((x) => S.normName(x.name).includes(n));
    if (!l) throw new Error(`Lista "${name}" non trovata. Liste disponibili: ${lists.map((x) => x.name).join(', ')}`);
    return l;
  }
  function findRecipe(name) {
    const n = S.normName(name);
    const rs = [...st.recipes.values()];
    const r = rs.find((x) => S.normName(x.name) === n) || rs.find((x) => S.normName(x.name).includes(n));
    if (!r) throw new Error(`Ricetta "${name}" non trovata.`);
    return r;
  }
  const itemOut = (i) => ({
    name: i.name, quantity: i.qty ?? undefined, unit: i.unit || undefined, brand: i.brand || undefined, note: i.note || undefined,
    due_date: i.due_date || undefined, priority: i.priority > 0 ? 'alta' : i.priority < 0 ? 'bassa' : undefined,
    assigned_to: i.assigned_to ? memberLabel(i.assigned_to) || undefined : undefined,
    creator: (i.data || {}).creator, rating: (i.data || {}).rating, price: (i.data || {}).price, link: (i.data || {}).link,
    department: S.deptOf(i.department).label, tags: (i.tags || []).length ? i.tags : undefined,
    checked: !!i.checked, checked_by: i.checked_by || undefined, added_by: i.created_by || undefined,
  });
  const recipeOut = (r) => ({
    name: r.name, servings: r.servings, difficulty: r.difficulty || undefined, prep_minutes: r.prep_min ?? undefined,
    cook_minutes: r.cook_min ?? undefined, description: r.description || undefined,
    ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.qty, unit: i.unit || undefined, brand: i.brand || undefined })),
    steps: stepsOf(r).map((s) => s.text),
  });

  const tools = [
    {
      name: 'sporta_get_overview',
      description: 'Panoramica di Sporta (lista della spesa condivisa): gruppo attivo, gruppi disponibili sul dispositivo e liste della spesa con il numero di articoli da prendere.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => needGroup() || ok({
        member: st.member, active_group: groupName(), groups: st.groups.map((g) => g.name),
        lists: sortedLists().map((l) => ({ name: l.name, type: typeOf(l), open: todoOf(l.id).length, done: doneOf(l.id).length })),
        recipes: st.recipes.size, saved_trips: st.trips.size,
      }),
    },
    {
      name: 'sporta_get_my_overview',
      description: 'Vista d\'insieme di TUTTI i gruppi del dispositivo, senza cambiare gruppo: cose da fare assegnate a me (con scadenza), cose da comprare in ogni lista della spesa e avvisi non letti.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        await refreshOverview(true);
        const groups = ovGroups();
        const lname = (grp, id) => (grp.lists.find((l) => l.id === id) || {}).name;
        const ltype = (grp, id) => typeOf(grp.lists.find((l) => l.id === id));
        return ok({
          todo_for_me: groups.flatMap((grp) => grp.items.filter((i) => grp.me && i.assigned_to === grp.me && ltype(grp, i.list_id) === 'todo')
            .map((i) => ({ group: grp.name, list: lname(grp, i.list_id), name: i.name, due: i.due_date || undefined, priority: i.priority > 0 ? 'alta' : undefined }))),
          to_buy: groups.flatMap((grp) => grp.lists.filter((l) => typeOf(l) === 'spesa').map((l) => ({
            group: grp.name, list: l.name, items: grp.items.filter((i) => i.list_id === l.id).map((i) => [i.name, S.fmtQty(i.qty, i.unit)].filter(Boolean).join(' ')),
          })).filter((x) => x.items.length)),
          unread_notifications: groups.flatMap((grp) => grp.inbox.items.filter((n) => !n.read).map((n) => ({ group: grp.name, text: n.title, detail: n.body || undefined }))),
        });
      },
    },
    {
      name: 'sporta_list_events',
      description: 'Eventi del gruppo attivo (cene, feste, partite…): data, ora, luogo, chi c\'è (con gli ospiti), chi forse, chi no, chi non ha risposto, e la mia risposta. past=true per includere quelli passati.',
      inputSchema: { type: 'object', properties: { past: { type: 'boolean' } } },
      annotations: { readOnlyHint: true },
      execute: ({ past } = {}) => needGroup() || ok((past ? sortedEvents() : upcomingEvents()).map((e) => {
        const t = eventTally(e, activeMembers());
        const names = (arr) => arr.map(({ m, p }) => m.alias + (p && p.guests ? ' +' + p.guests : ''));
        const mine = myRsvp(e, st.me && st.me.id);
        return {
          title: e.title, date: e.date, time: e.time || undefined, end_time: e.end_time || undefined, location: e.location || undefined, notes: e.notes || undefined,
          people_total: t.total, yes: names(t.yes), maybe: names(t.maybe), no: names(t.no), no_answer: names(t.none),
          my_answer: mine ? { yes: 'sì', maybe: 'forse', no: 'no' }[mine.rsvp] + (mine.guests ? ' +' + mine.guests : '') : 'non ancora',
          lists: eventLists(e.id).map((l) => l.name),
        };
      })),
    },
    {
      name: 'sporta_create_event',
      description: 'Crea un evento nel gruppo attivo (tutti ricevono un avviso per rispondere). Data in formato AAAA-MM-GG, ora HH:MM facoltativa. with_lists: crea anche le liste "Spesa per l\'evento" e/o "Chi porta cosa".',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-GG' }, time: { type: 'string', description: 'HH:MM' },
          end_time: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' },
          with_lists: { type: 'array', items: { type: 'string', enum: ['spesa', 'chi_porta_cosa'] } },
        },
        required: ['title', 'date'],
      },
      execute: (a) => {
        const miss = needGroup(); if (miss) return miss;
        if (!S.fromYmd(a.date)) return fail('Data non valida: usa AAAA-MM-GG');
        const id = uid();
        const valid = (x) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(x || '') ? x : '');
        enqueue({ k: 'event.put', id, data: { title: String(a.title).slice(0, 100), date: a.date, time: valid(a.time), end_time: valid(a.time) ? valid(a.end_time) : '', location: a.location || '', notes: a.notes || '', icon: 'party' } });
        const e = st.events.get(id);
        for (const w of a.with_lists || []) createEventList(e, w === 'spesa' ? 'spesa' : 'todo');
        return ok(`Evento creato: ${a.title}, ${eventWhen(e)}`);
      },
    },
    {
      name: 'sporta_rsvp_event',
      description: 'Rispondo a un evento del gruppo attivo: sì, forse o no, con il numero di ospiti che porto (0 = solo io).',
      inputSchema: {
        type: 'object',
        properties: { event: { type: 'string', description: 'Nome dell\'evento' }, answer: { type: 'string', enum: ['yes', 'maybe', 'no'] }, guests: { type: 'integer', minimum: 0, maximum: 20 } },
        required: ['event', 'answer'],
      },
      execute: ({ event, answer, guests }) => {
        const miss = needGroup(); if (miss) return miss;
        const n = S.normName(event);
        const evs = upcomingEvents();
        const e = evs.find((x) => S.normName(x.title) === n) || evs.find((x) => S.normName(x.title).includes(n));
        if (!e) return fail(`Evento "${event}" non trovato tra quelli in programma`);
        enqueue({ k: 'event.rsvp', id: e.id, data: { rsvp: answer, guests: answer === 'no' ? 0 : Math.max(0, Math.min(20, guests || 0)) } });
        return ok(`Risposta a "${e.title}": ${{ yes: 'ci sono', maybe: 'forse', no: 'non ci sono' }[answer]}${guests && answer !== 'no' ? ' +' + guests : ''}`);
      },
    },
    {
      name: 'sporta_get_members',
      description: 'Elenca le persone del gruppo attivo: nome, ruolo (amministratore o partecipante), relazione, se sono online e quale lista stanno guardando. Sola lettura: accettare o rimuovere persone si fa solo dall\'app.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => needGroup() || ok([...st.members.values()].filter((m) => m.status === 'active').map((m) => ({
        name: m.alias, role: m.role === 'admin' ? 'amministratore' : 'partecipante', relation: m.relation || undefined,
        online: !!m.online, viewing_list: m.viewing && st.lists.get(m.viewing) ? st.lists.get(m.viewing).name : undefined,
        last_seen: m.last_seen ? new Date(m.last_seen).toISOString() : undefined, is_me: !!(st.me && st.me.id === m.id),
      }))),
    },
    {
      name: 'sporta_switch_group',
      description: 'Passa a un altro gruppo (es. famiglia, amici, evento) tra quelli a cui il dispositivo partecipa.',
      inputSchema: { type: 'object', properties: { group: { type: 'string', description: 'Nome del gruppo' } }, required: ['group'] },
      execute: ({ group }) => {
        const n = S.normName(group);
        const g = st.groups.find((x) => S.normName(x.name) === n) || st.groups.find((x) => S.normName(x.name).includes(n));
        if (!g) return fail(`Gruppo "${group}" non trovato. Gruppi: ${st.groups.map((x) => x.name).join(', ')}`);
        switchGroup(g.code);
        return ok(`Gruppo attivo: ${g.name}`);
      },
    },
    {
      name: 'sporta_get_list',
      description: 'Elenca gli articoli di una lista della spesa: da prendere e già nel carrello, con quantità, marca, reparto e tag.',
      inputSchema: { type: 'object', properties: { list: { type: 'string', description: 'Nome della lista; se omesso, l\'ultima usata' } } },
      annotations: { readOnlyHint: true },
      execute: ({ list } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        try {
          const l = findList(list);
          return ok({ list: l.name, to_buy: todoOf(l.id).map(itemOut), in_cart: doneOf(l.id).map(itemOut) });
        } catch (e) { return fail(e.message); }
      },
    },
    {
      name: 'sporta_add_items',
      description: 'Aggiunge elementi a una lista. Liste della spesa: quantità, unità e marca facoltative (le quantità compatibili si sommano). Liste da fare: scadenza (AAAA-MM-GG), priorità e persona facoltative. Liste di libri/film/desideri: autore o creatore facoltativo.',
      inputSchema: {
        type: 'object',
        properties: {
          list: { type: 'string', description: 'Nome della lista; se omesso, l\'ultima usata' },
          items: {
            type: 'array', minItems: 1,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string', description: 'es. g, kg, l, ml, pz, conf' },
                brand: { type: 'string' },
                note: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                due_date: { type: 'string', description: 'Solo liste da fare: AAAA-MM-GG' },
                priority: { type: 'string', enum: ['bassa', 'normale', 'alta'], description: 'Solo liste da fare' },
                assign_to: { type: 'string', description: 'Solo liste da fare: nome di un membro del gruppo' },
                creator: { type: 'string', description: 'Solo liste di libri/film/desideri: autore, regia…' },
              },
              required: ['name'],
            },
          },
        },
        required: ['items'],
      },
      execute: ({ list, items } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        try {
          const l = findList(list);
          const added = [];
          for (const it of items || []) {
            if (!it || !String(it.name || '').trim()) continue;
            if (typeOf(l) !== 'spesa') {
              const m = it.assign_to ? findMember(it.assign_to) : null;
              enqueue({ k: 'item.put', id: uid(), data: {
                list_id: l.id, name: String(it.name).trim(), note: it.note || '', tags: Array.isArray(it.tags) ? parseTags(it.tags.join(',')) : [],
                checked: false, position: topPos(l.id), due_date: S.fromYmd(it.due_date) ? it.due_date : '',
                priority: it.priority === 'alta' ? 1 : it.priority === 'bassa' ? -1 : 0, assigned_to: m ? m.id : null,
                data: it.creator ? { creator: String(it.creator) } : {},
              } }, { silent: true });
              added.push(it.name);
              continue;
            }
            addToList(l.id, {
              name: String(it.name).trim(), qty: S.parseNum(it.quantity), unit: S.normUnit(it.unit || ''), brand: it.brand || undefined,
              note: it.note || '', tags: Array.isArray(it.tags) ? parseTags(it.tags.join(',')) : undefined,
            });
            added.push(it.name);
          }
          render();
          return ok(`Aggiunti a "${l.name}": ${added.join(', ')}`);
        } catch (e) { return fail(e.message); }
      },
    },
    {
      name: 'sporta_set_item_checked',
      description: 'Segna un articolo come preso (nel carrello) o lo rimette tra quelli da prendere.',
      inputSchema: {
        type: 'object',
        properties: { list: { type: 'string' }, name: { type: 'string' }, checked: { type: 'boolean', default: true } },
        required: ['name'],
      },
      execute: ({ list, name, checked = true } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        try {
          const l = findList(list);
          const n = S.normName(name);
          const it = itemsOf(l.id).find((i) => S.normName(i.name) === n) || itemsOf(l.id).find((i) => S.normName(i.name).includes(n));
          if (!it) return fail(`"${name}" non è nella lista "${l.name}".`);
          const data = { checked: !!checked };
          if (!checked) data.position = topPos(l.id);
          enqueue({ k: 'item.put', id: it.id, data });
          return ok(`${it.name}: ${checked ? 'preso' : 'da prendere'}`);
        } catch (e) { return fail(e.message); }
      },
    },
    {
      name: 'sporta_remove_items',
      description: 'Elimina articoli da una lista della spesa (azione visibile a tutto il gruppo).',
      inputSchema: {
        type: 'object',
        properties: { list: { type: 'string' }, names: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['names'],
      },
      annotations: { destructiveHint: true },
      execute: ({ list, names } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        try {
          const l = findList(list);
          const removed = [];
          for (const name of names || []) {
            const n = S.normName(name);
            const it = itemsOf(l.id).find((i) => S.normName(i.name) === n);
            if (it) { enqueue({ k: 'item.del', id: it.id }, { silent: true }); removed.push(it.name); }
          }
          render();
          return ok(removed.length ? `Eliminati da "${l.name}": ${removed.join(', ')}` : 'Nessun articolo corrispondente.');
        } catch (e) { return fail(e.message); }
      },
    },
    {
      name: 'sporta_get_favorites',
      description: 'Elenca i prodotti abituali del gruppo (quelli che si ricomprano spesso), con quantità e marca abituali.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => needGroup() || ok(favorites().map((p) => ({ name: p.name, quantity: p.qty, unit: p.unit || undefined, brand: p.brand || undefined, department: S.deptOf(p.department).label }))),
    },
    {
      name: 'sporta_search_recipes',
      description: 'Cerca tra le ricette del gruppo per nome o ingrediente.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Testo da cercare; vuoto per tutte' } } },
      annotations: { readOnlyHint: true },
      execute: ({ query } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        const q = S.normName(query || '');
        const rs = [...st.recipes.values()].filter((r) => !q || S.normName(r.name).includes(q) || r.ingredients.some((i) => S.normName(i.name).includes(q)));
        return ok(rs.map((r) => ({ name: r.name, servings: r.servings, difficulty: r.difficulty || undefined, total_minutes: (r.prep_min || 0) + (r.cook_min || 0) || undefined, ingredients: r.ingredients.map((i) => i.name) })));
      },
    },
    {
      name: 'sporta_get_recipe',
      description: 'Restituisce una ricetta completa: ingredienti con quantità, tempi, difficoltà e procedimento.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      annotations: { readOnlyHint: true },
      execute: ({ name } = {}) => { try { return needGroup() || ok(recipeOut(findRecipe(name))); } catch (e) { return fail(e.message); } },
    },
    {
      name: 'sporta_add_recipe_to_list',
      description: 'Aggiunge alla lista della spesa gli ingredienti di una ricetta, ricalcolando le quantità per il numero di persone.',
      inputSchema: {
        type: 'object',
        properties: {
          recipe: { type: 'string' },
          people: { type: 'integer', minimum: 1, description: 'Numero di persone; se omesso, quello della ricetta' },
          list: { type: 'string' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Ingredienti da non aggiungere (es. già in casa)' },
        },
        required: ['recipe'],
      },
      execute: ({ recipe, people, list, exclude } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        try {
          const r = findRecipe(recipe);
          const l = findList(list);
          const ex = new Set((exclude || []).map(S.normName));
          const n = Math.max(1, parseInt(people, 10) || r.servings);
          const added = [];
          for (const i of r.ingredients) {
            if (ex.has(S.normName(i.name)) || i.unit === 'q.b.') continue;
            const qty = S.scaleQty(i.qty, i.unit, r.servings, n);
            addToList(l.id, { name: i.name, qty, unit: i.unit, brand: i.brand || undefined });
            added.push(`${i.name}${qty != null ? ' ' + S.fmtQty(qty, i.unit) : ''}`);
          }
          render();
          return ok(`"${r.name}" per ${n} persone → aggiunti a "${l.name}": ${added.join(', ')}`);
        } catch (e) { return fail(e.message); }
      },
    },
    {
      name: 'sporta_create_recipe',
      description: 'Crea una nuova ricetta nel gruppo con ingredienti, passaggi del procedimento, tempi e difficoltà.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          servings: { type: 'integer', minimum: 1 },
          description: { type: 'string' },
          difficulty: { type: 'string', enum: ['facile', 'media', 'difficile'] },
          prep_minutes: { type: 'integer', minimum: 0 },
          cook_minutes: { type: 'integer', minimum: 0 },
          ingredients: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, brand: { type: 'string' } }, required: ['name'] },
          },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'ingredients'],
      },
      execute: (a = {}) => {
        const ng = needGroup(); if (ng) return ng;
        if (!String(a.name || '').trim()) return fail('Nome obbligatorio');
        const id = uid();
        enqueue({
          k: 'recipe.put', id,
          data: {
            name: String(a.name).trim(), servings: Math.max(1, parseInt(a.servings, 10) || 4), description: a.description || '',
            difficulty: ['facile', 'media', 'difficile'].includes(a.difficulty) ? a.difficulty : '',
            prep_min: a.prep_minutes ?? null, cook_min: a.cook_minutes ?? null, notes: '', photos: [],
            ingredients: (a.ingredients || []).filter((i) => i && i.name).map((i) => ({ name: String(i.name), qty: S.parseNum(i.quantity), unit: S.normUnit(i.unit || ''), brand: i.brand || '' })),
            steps: (a.steps || []).map((t) => ({ text: String(t) })).filter((s) => s.text.trim()),
          },
        });
        return ok(`Ricetta "${a.name}" creata.`);
      },
    },
    {
      name: 'sporta_get_shopping_history',
      description: 'Storico delle spese concluse: data, negozio, totale e articoli comprati.',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 } } },
      annotations: { readOnlyHint: true },
      execute: ({ limit = 10 } = {}) => needGroup() || ok(sortedTrips().slice(0, limit).map((t) => ({
        date: new Date(t.created_at).toISOString(), store: t.store || undefined, total_eur: t.total ?? undefined,
        list: t.list_name || undefined, by: t.created_by || undefined,
        items: t.items.map((i) => `${i.name}${i.qty != null ? ' ' + S.fmtQty(i.qty, i.unit) : ''}${i.brand ? ' (' + i.brand + ')' : ''}`),
      }))),
    },
    {
      name: 'sporta_create_list',
      description: 'Crea una nuova lista nel gruppo attivo: spesa, da fare (con persone e scadenze), libri/film/desideri, oppure generica.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }, icon: { type: 'string', enum: LIST_ICONS, description: 'Icona della lista' },
          type: { type: 'string', enum: Object.keys(S.LIST_TYPES), default: 'spesa' },
          variant: { type: 'string', enum: Object.keys(S.COLLECTION_KINDS), description: 'Solo per type=collezione' },
        },
        required: ['name'],
      },
      execute: ({ name, icon: ic, type, variant } = {}) => {
        const ng = needGroup(); if (ng) return ng;
        if (!String(name || '').trim()) return fail('Nome obbligatorio');
        const maxPos = Math.max(0, ...[...st.lists.values()].map((l) => l.position));
        const t = S.LIST_TYPES[type] ? type : 'spesa';
        const v = t === 'collezione' && S.COLLECTION_KINDS[variant] ? variant : t === 'collezione' ? 'libri' : '';
        enqueue({ k: 'list.put', id: uid(), data: { name: String(name).trim(), emoji: ic ? listIconId(ic) : defaultListIcon(t, v), position: maxPos + 1, type: t, variant: v } });
        return ok(`Lista "${name}" creata.`);
      },
    },
  ];

  for (const tool of tools) {
    try { mc.registerTool(tool); } catch (e) { console.warn('WebMCP: registrazione non riuscita per', tool.name, e); }
  }
})();
