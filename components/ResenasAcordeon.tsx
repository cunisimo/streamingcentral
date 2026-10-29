"use client";
import { useEffect, useState } from "react";
import { AbiertoPorTitulo, Acordeon, ResenasYump } from "./ResenasSeccion";
import { useAuth } from "@/components/AuthContext";
import { encabezadoResenas, type ResenaFicha } from "@/lib/resenas";
import type { Titulo } from "@/lib/comunidad/editor-nucleo";
import { claveEditor } from "@/lib/comunidad/editor-nucleo";
import { moduloComunidadActivo } from "@/lib/comunidad/modulo-cliente";
import ResenasComunidad from "./comunidad/ResenasComunidad";
import InvitacionRegistro from "./comunidad/InvitacionRegistro";

// Sección "RESEÑAS" de la ficha. Arranca SIEMPRE cerrada y, cerrada, no
// renderiza ni una línea de texto: puede haber spoilers (decisión del dueño,
// 5/10). Abierta, las reseñas van en una ventana con alto máximo y scroll
// propio (`.resenas-ventana`): con el puntero adentro se mueven las reseñas,
// afuera la página, y `overscroll-behavior: contain` evita que al llegar al
// final de la ventana el scroll siga en la página.
//
// E5a: una sola sección para la reseña de Yump (SIEMPRE primera) y las de la
// comunidad, que se leen SÓLO con sesión:
//   - con sesión: ResenasComunidad (por cuenta y título) trae la primera
//     página y dibuja editor, lista, Cargar más, denuncias y bloqueos;
//   - sin sesión y con el módulo encendido: la invitación a registrarse,
//     también en un título sin ninguna reseña y con el encabezado SIN número,
//     para no revelar si hay;
//   - con el módulo apagado: sólo la de Yump, como antes (y nada si no hay).
// La ficha la monta con `key` por título: ir de una ficha a otra (relacionados)
// la vuelve a montar cerrada.
export default function ResenasAcordeon({ resenas, titulo }: { resenas: ResenaFicha[]; titulo: Titulo }) {
  return <AbiertoPorTitulo><Seccion resenas={resenas} titulo={titulo} /></AbiertoPorTitulo>;
}

function Seccion({ resenas, titulo }: { resenas: ResenaFicha[]; titulo: Titulo }) {
  const { user, ready } = useAuth();
  const uid = user?.id ?? null;
  // Mientras no se sabe si hay sesión, sólo lo de Yump: ni invitación (sería
  // falsa para quien sí tiene sesión) ni pedidos.
  if (!ready) return resenas.length ? <Acordeon titulo={encabezadoResenas(resenas.length, null, true)}><ResenasYump resenas={resenas} /></Acordeon> : null;
  if (uid) return <ResenasComunidad key={claveEditor(uid, titulo)} uid={uid} titulo={titulo} yump={resenas} />;
  return <SinSesion yump={resenas} />;
}

/** Sin sesión: Yump y, si el módulo está encendido, la invitación. Nada comunitario. */
function SinSesion({ yump }: { yump: ResenaFicha[] }) {
  const [activo, setActivo] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    void moduloComunidadActivo().then((a) => { if (vivo) setActivo(a); });
    return () => { vivo = false; };
  }, []);
  if (!activo) {
    return yump.length ? <Acordeon titulo={encabezadoResenas(yump.length, null, true)}><ResenasYump resenas={yump} /></Acordeon> : null;
  }
  return (
    <Acordeon titulo={encabezadoResenas(yump.length, null, false)}>
      <ResenasYump resenas={yump} />
      <InvitacionRegistro />
    </Acordeon>
  );
}
