"use client";

// "Buscala como…": qué escribir en el buscador de la plataforma.
//
// ESTE COMPONENTE NO DECIDE NADA. Todo se resuelve en el servidor
// (lib/consultas-verificadas.ts, llamado desde `detail()`): qué plataformas
// tienen consulta verificada, si la consulta es redundante con el título que ya
// se muestra, y si corresponde el respaldo al título original. Acá solo se
// pinta lo que llegó. Por eso no importa el mapa ni lee variables de entorno.
//
// Por qué existe: el nombre que la app muestra no siempre encuentra la película
// en la plataforma. Caso testigo, movie:12535 en Disney+: ni el título es-ES, ni
// el es-MX, ni el alternativo argentino de TMDB, NI SIQUIERA el nombre que
// Disney+ publica devuelven nada. Lo único que la encuentra es "High Anxiety".
import { useState } from "react";
import { PLATFORMS } from "@/lib/providers-ar";
import type { AyudaBusqueda } from "@/lib/types";

const NOMBRE = new Map(PLATFORMS.map((p) => [p.code, p.name]));

function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="ayuda-copiar"
      aria-label={`Copiar «${texto}»`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1600);
        } catch {
          // Sin permiso de portapapeles no hay nada que hacer: el texto está a
          // la vista y se puede copiar a mano. No vale romper la ficha por esto.
        }
      }}
    >
      {copiado ? "copiado" : "copiar"}
    </button>
  );
}

export default function AyudasBusqueda(
  { ayudas, ayudaOriginal }: { ayudas?: AyudaBusqueda[]; ayudaOriginal?: string },
) {
  if (!ayudas?.length && !ayudaOriginal) return null;

  return (
    <div className="ayudas">
      {ayudas?.map((a) => (
        <p className="ayuda" key={`${a.plataforma}:${a.consulta}`}>
          En <b>{NOMBRE.get(a.plataforma) ?? a.plataforma}</b>, buscala como{" "}
          <q>{a.consulta}</q> <Copiar texto={a.consulta} />
        </p>
      ))}
      {/* Una sola vez para toda la ficha, nunca por plataforma: el título
          original es de la obra, no de dónde se la mira. */}
      {ayudaOriginal && (
        <p className="ayuda">
          Si no aparece, probá con el título original: <q>{ayudaOriginal}</q>{" "}
          <Copiar texto={ayudaOriginal} />
        </p>
      )}
    </div>
  );
}
