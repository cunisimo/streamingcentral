"use client";
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { itemRefs, setItem } from "@/lib/userdata";
import type { MediaType } from "@/lib/types";

// "Mi lista" (user_items kind='list') cargada una sola vez en memoria, para que
// las cards puedan mostrar/togglear el estado sin una query por card. Fuente
// única de verdad compartida entre las cards y la ficha (ListActions).
const keyOf = (id: number, tipo: MediaType) => `${tipo}:${id}`;

interface MyListCtx {
  has: (id: number, tipo: MediaType) => boolean;
  toggle: (id: number, tipo: MediaType) => Promise<void>;
  loaded: boolean;
}

const Ctx = createContext<MyListCtx | null>(null);

export function MyListProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setIds(new Set()); setLoaded(true); return; }
    let alive = true;
    setLoaded(false);
    itemRefs("list")
      .then((refs) => { if (alive) { setIds(new Set(refs.map((r) => keyOf(r.tmdb_id, r.tipo)))); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [ready, user]);

  const has = useCallback((id: number, tipo: MediaType) => ids.has(keyOf(id, tipo)), [ids]);

  const toggle = useCallback(async (id: number, tipo: MediaType) => {
    if (!user) return; // el caller decide el redirect a login
    const k = keyOf(id, tipo);
    const on = !ids.has(k);
    setIds((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n; }); // optimista
    const { error } = await setItem(user.id, "list", { tmdb_id: id, tipo }, on);
    if (error) setIds((prev) => { const n = new Set(prev); if (on) n.delete(k); else n.add(k); return n; }); // rollback
  }, [user, ids]);

  return <Ctx.Provider value={{ has, toggle, loaded }}>{children}</Ctx.Provider>;
}

export function useMyList(): MyListCtx | null {
  return useContext(Ctx);
}
