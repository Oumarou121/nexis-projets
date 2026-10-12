// Faux client Supabase en mémoire, limité à ce que le serveur utilise : select / insert / update /
// delete, filtres eq, neq, in, is, not(in|is), ilike, lt, tri, limite, single / maybeSingle, comptage,
// jointure « embed!inner(...) » et suppression en cascade. Il remplace src/db.js dans les tests.
import { randomUUID } from "node:crypto";

const TABLES = [
  "projects", "tasks", "project_members", "activity_log", "task_comments", "task_attachments",
  "task_activities", "task_timesheets", "task_dependencies", "task_status_history", "notifications", "notification_prefs", "project_guests", "digest_log", "push_tokens",
];

// Valeurs par défaut posées à l'insertion (comme les « default » SQL).
const DEFAULTS = {
  projects: () => ({ status: "planned", priority: "medium", visibility: "internal", settings: { timesheets: false }, color: null, due_date: null, description: null }),
  tasks: () => ({ status: "todo", priority: "medium", assignee_id: null, due_date: null, start_date: null, labels: [], parent_id: null, is_milestone: false, description: null }),
  activity_log: () => ({ restricted: false, details: {} }),
};
const PRIMARY_KEYS = { project_members: ["project_id", "user_id"], notification_prefs: ["user_id"], digest_log: ["user_id", "organization_id", "day"], push_tokens: ["token"] };
// Clés étrangères (enfant → parent) : sert aux embeds et aux suppressions en cascade.
const FK = {
  tasks: { projects: "project_id" },
  project_members: { projects: "project_id" },
  task_comments: { tasks: "task_id" },
  task_attachments: { tasks: "task_id" },
  task_activities: { tasks: "task_id" },
  task_timesheets: { tasks: "task_id" },
  task_dependencies: { tasks: "task_id" },
  task_status_history: { tasks: "task_id" },
  notifications: { projects: "project_id", tasks: "task_id" },
  project_guests: { projects: "project_id" },
};

export function createFakeDb() {
  const store = Object.fromEntries(TABLES.map((t) => [t, []]));

  function cascade(table, removed) {
    const ids = new Set(removed.map((r) => r.id));
    for (const [child, parents] of Object.entries(FK)) {
      const col = parents[table];
      if (!col) continue;
      const gone = store[child].filter((r) => ids.has(r[col]));
      store[child] = store[child].filter((r) => !ids.has(r[col]));
      if (gone.length) cascade(child, gone);
    }
  }

  const ilike = (value, pattern) => {
    const re = new RegExp(`^${String(pattern).replace(/\\(.)/g, "$1").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    return re.test(String(value ?? ""));
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.filters = [];
      this.sorts = [];
      this.max = null;
      this.cols = "*";
      this.wantsRows = true;
      this.count = null;
      this.head = false;
      this.mode = "many";
    }

    select(cols = "*", opts = {}) {
      this.cols = cols;
      this.wantsRows = true;
      if (opts.count) this.count = opts.count;
      if (opts.head) this.head = true;
      return this;
    }
    insert(payload) { this.op = "insert"; this.payload = payload; this.wantsRows = false; return this; }
    update(patch) { this.op = "update"; this.payload = patch; this.wantsRows = false; return this; }
    delete() { this.op = "delete"; this.wantsRows = false; return this; }

    eq(col, v) { this.filters.push((r) => get(r, col) === v); return this; }
    neq(col, v) { this.filters.push((r) => get(r, col) !== v); return this; }
    in(col, list) { this.filters.push((r) => list.includes(get(r, col))); return this; }
    is(col, v) { this.filters.push((r) => (get(r, col) ?? null) === v); return this; }
    lte(col, v) { this.filters.push((r) => get(r, col) <= v); return this; }
    gte(col, v) { this.filters.push((r) => get(r, col) >= v); return this; }
    lt(col, v) { this.filters.push((r) => get(r, col) < v); return this; }
    ilike(col, pattern) { this.filters.push((r) => ilike(get(r, col), pattern)); return this; }
    not(col, op, v) {
      if (op === "in") {
        const list = String(v).replace(/^\(|\)$/g, "").split(",").filter(Boolean);
        this.filters.push((r) => !list.includes(get(r, col)));
      } else if (op === "is") {
        this.filters.push((r) => (get(r, col) ?? null) !== v);
      } else throw new Error(`fakeDb: not(${op}) non géré`);
      return this;
    }
    order(col, { ascending = true } = {}) { this.sorts.push({ col, ascending }); return this; }
    limit(n) { this.max = n; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }

    then(resolve, reject) {
      try {
        resolve(this.run());
      } catch (e) {
        reject?.(e);
      }
    }

    // Embeds « alias!inner(col, col) » : { alias, cols } ; le reste = colonnes de la table.
    parseCols() {
      const embeds = [];
      const rest = String(this.cols).replace(/(\w+)!inner\(([^)]*)\)/g, (_m, alias, inner) => {
        embeds.push({ alias, cols: inner.split(",").map((c) => c.trim()) });
        return "";
      });
      const own = rest.split(",").map((c) => c.trim()).filter(Boolean);
      return { embeds, own };
    }

    withEmbeds(rows) {
      const { embeds } = this.parseCols();
      if (embeds.length === 0) return rows;
      return rows
        .map((r) => {
          const copy = { ...r };
          for (const e of embeds) {
            const col = FK[this.table]?.[e.alias];
            copy[e.alias] = store[e.alias].find((p) => p.id === r[col]) ?? null;
          }
          return copy;
        })
        .filter((r) => embeds.every((e) => r[e.alias] !== null)); // « !inner »
    }

    shape(row) {
      const { embeds, own } = this.parseCols();
      const out = own.length === 0 || own.includes("*") ? { ...row } : Object.fromEntries(own.map((c) => [c, row[c]]));
      for (const e of embeds) {
        out[e.alias] = Object.fromEntries(e.cols.map((c) => [c, row[e.alias]?.[c]]));
      }
      // Les colonnes d'embed ne doivent pas fuiter dans les lignes « plates ».
      for (const k of Object.keys(out)) if (k in store && !embeds.some((e) => e.alias === k)) delete out[k];
      return out;
    }

    // Lignes (avec leurs embeds) qui passent tous les filtres.
    matching() {
      return this.withEmbeds(store[this.table]).filter((r) => this.filters.every((f) => f(r)));
    }

    // Les lignes d'origine (pas des copies) correspondantes : pour update / delete.
    originals() {
      return store[this.table].filter((r) => this.filters.every((f) => f(r)));
    }

    finish(rows) {
      let list = rows;
      for (const { col, ascending } of [...this.sorts].reverse()) {
        list = [...list].sort((a, b) => {
          const x = a[col] ?? null;
          const y = b[col] ?? null;
          if (x === y) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (this.max !== null) list = list.slice(0, this.max);
      list = list.map((r) => this.shape(r));
      if (this.mode === "single") {
        if (list.length !== 1) return { data: null, error: { code: "PGRST116", message: "Aucune ligne ou plusieurs" } };
        return { data: list[0], error: null };
      }
      if (this.mode === "maybe") {
        if (list.length > 1) return { data: null, error: { code: "PGRST116", message: "Plusieurs lignes" } };
        return { data: list[0] ?? null, error: null };
      }
      return { data: list, error: null };
    }

    run() {
      const t = this.table;
      if (!store[t]) return { data: null, error: { message: `fakeDb: table inconnue ${t}` } };

      if (this.op === "select") {
        const rows = this.matching();
        if (this.head) return { data: null, count: rows.length, error: null };
        return { ...this.finish(rows), ...(this.count ? { count: rows.length } : {}) };
      }

      if (this.op === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p) => ({
          id: randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(DEFAULTS[t]?.() ?? {}),
          ...p,
        }));
        const pk = PRIMARY_KEYS[t];
        for (const it of items) {
          if (pk && store[t].some((r) => pk.every((k) => r[k] === it[k]))) {
            return { data: null, error: { code: "23505", message: "doublon" } };
          }
        }
        store[t].push(...items);
        return this.finish(items);
      }

      if (this.op === "update") {
        const rows = this.originals();
        for (const r of rows) Object.assign(r, this.payload);
        return this.finish(rows);
      }

      // delete
      const rows = this.originals();
      store[t] = store[t].filter((r) => !rows.includes(r));
      cascade(t, rows);
      return this.finish(rows);
    }
  }

  const get = (row, col) => (col.includes(".") ? col.split(".").reduce((o, k) => o?.[k], row) : row[col]);

  const noop = { error: null };
  const db = {
    from: (table) => new Query(table),
    storage: {
      from: () => ({
        upload: async () => noop,
        download: async () => ({ data: new Blob(["contenu"]), error: null }),
        remove: async () => noop,
      }),
    },
  };

  return { db, store };
}
