"use client";
import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { itemRefs, olvidarDescarte, setItem } from "@/lib/userdata";
import { crearListaEnMemoria } from "@/lib/mi-lista-memoria";
import type { MediaType } from "@/lib/types";

// "Mi lista" (user_items kind='list') cargada una sola vez en memoria, para que
// las cards puedan mostrar/togglear el estado sin una query por card. Fuente
// única de verdad compartida entre las cards y la ficha (ListActions).
//
// La escritura (optimista, con rollback si falla) vive en
// lib/mi-lista-memoria.ts, que además sabe cuándo no queda ninguna en vuelo.
const keyOf = (id: number, tipo: MediaType) => `${tipo}:${id}`;

interface MyListCtx {
  has: (id: number, tipo: MediaType) => boolean;
  toggle: (id: number, tipo: MediaType) => Promise<void>;
  loaded: boolean;
  // Las claves `tipo:id` de lo que hay en la lista. Sólo lectura.
  claves: ReadonlySet<string>;
  // Resuelve cuando no queda ninguna escritura en vuelo (confirmada o
  // revertida) y devuelve las claves resultantes. La usa la vista completa de
  // Mi lista para reconciliar su snapshot al volver de una ficha.
  asentado: () => Promise<ReadonlySet<string>>;
}

const Ctx = createContext<MyListCtx | null>(null);

export function MyListProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const userId = user?.id ?? null;

  // Una lista en memoria por usuario: cambiar de sesión no hereda escrituras.
  const memoria = useMemo(() => crearListaEnMemoria(
    async (clave, on) => {
      if (!userId) return { error: "sin sesión" };
      const [tipo, id] = clave.split(":");
      return setItem(userId, "list", { tmdb_id: Number(id), tipo: tipo as MediaType }, on);
    },
    setIds,
  ), [userId]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { memoria.reemplazar([]); setLoaded(true); return; }
    let alive = true;
    setLoaded(false);
    itemRefs("list")
      .then((refs) => { if (alive) { memoria.reemplazar(refs.map((r) => keyOf(r.tmdb_id, r.tipo))); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [ready, user, memoria]);

  const has = useCallback((id: number, tipo: MediaType) => ids.has(keyOf(id, tipo)), [ids]);

  const toggle = useCallback(async (id: number, tipo: MediaType) => {
    if (!user) return; // el caller decide el redirect a login
    const { on, error } = await memoria.toggle(keyOf(id, tipo));
    // Agregarlo a Mi lista PISA un "No es para mí" anterior. No devuelve la
    // tarjeta al riel ni cambia lo que recomienda —eso ya pasa por estar en Mi
    // lista—: evita el estado contradictorio y que el descarte viejo siga
    // actuando si algún día lo sacás de la lista. Ver `olvidarDescarte`.
    // Sacarlo de la lista no lo vuelve a descartar: eso es neutro, no un "no".
    if (!error && on) void olvidarDescarte(user.id, { tmdb_id: id, tipo });
  }, [user, memoria]);

  return <Ctx.Provider value={{ has, toggle, loaded, claves: ids, asentado: memoria.asentado }}>{children}</Ctx.Provider>;
}

export function useMyList(): MyListCtx | null {
  return useContext(Ctx);
}
