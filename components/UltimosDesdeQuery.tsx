"use client";
import { useSearchParams } from "next/navigation";
import UltimosView from "./UltimosView";
import { tipoDeParametro } from "@/lib/tipo-lista";

/**
 * Lee el `?tipo=` y se lo da a `UltimosView` como estado inicial.
 *
 * ============================================================================
 * POR QUÉ ESTO EXISTE EN VEZ DE LEERLO EN EL SERVIDOR
 * ============================================================================
 * El Server Component lo leía de `searchParams`. Con `output: export` —el build
 * del contenedor— eso aborta el export ENTERO:
 *
 *     Route /lista/ultimos/ with `dynamic = "error"` couldn't be rendered
 *     statically because it used `searchParams.tipo`
 *
 * El primer parche escondió la lectura detrás de `ES_NATIVO`. Salvaba el export
 * y dejaba el bug: dentro del APK un enlace con `?tipo=tv` abría en Películas,
 * verificado en un Android físico.
 *
 * 🔴 Y NO SE LEE EN UN `useEffect`, que es la tentación obvia. Un efecto corre
 * DESPUÉS del primer render, así que `UltimosView` ya habría arrancado pidiendo
 * películas y recién después cambiaría a series: dos pedidos, y el primero mal.
 * `useSearchParams` devuelve el valor en el PRIMER render del cliente.
 *
 * El precio es el `<Suspense>` que Next exige para poder prerenderizar la
 * página, y por eso el fallback de `app/lista/[key]/page.tsx` es visible y no
 * `null`: en el export estático ese fallback ES lo que se sirve en el HTML.
 */
export default function UltimosDesdeQuery() {
  const params = useSearchParams();
  return <UltimosView tipoInicial={tipoDeParametro(params.get("tipo"))} />;
}
