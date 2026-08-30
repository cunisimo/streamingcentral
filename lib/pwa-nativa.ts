// CP6 — ¿se monta la PWA?
//
// Adentro del contenedor nativo, NO. Y el motivo por el que esto vive en un
// módulo propio en vez de repetir `ES_NATIVO` en cada componente es que así la
// decisión se puede probar: `pwaActiva(false)` y `pwaActiva(true)` son dos
// llamadas en un solo proceso, mientras que la constante se resuelve una vez al
// evaluar el módulo y obliga a levantar un proceso por camino.
//
// 🔴 POR QUÉ IMPORTA APAGARLA ANTES DEL PRIMER ARRANQUE NATIVO. En el primer
// `cap run` el bundle ya es `production`, y el guard de `ServiceWorkerRegister`
// sólo miraba `NODE_ENV`: registraría `/sw.js` DENTRO de la app. Apagarlo en el
// build siguiente no deshace nada — ni el SW registrado, ni el controller, ni el
// Cache Storage. Por eso la defensa es en dos capas: el archivo no viaja
// (`PUBLIC_FUERA` en `scripts/build-capacitor.mjs`) y además nadie lo registra.
//
// ⚠️ UNA SOLA BANDERA, la de build. No se usa `Capacitor.isNativePlatform()` ni
// ninguna detección en runtime: daría distinto en el prerender y después de
// hidratar, que es exactamente el hydration mismatch que `lib/plataforma.ts`
// existe para evitar.
import { ES_NATIVO } from "./plataforma.ts";

/**
 * ¿Corresponde montar las piezas de PWA?
 *
 * `true` en la web —todo sigue igual— y `false` en el contenedor. El parámetro
 * existe SÓLO para las pruebas; en producción se llama sin argumentos.
 */
export function pwaActiva(nativo: boolean = ES_NATIVO): boolean {
  return !nativo;
}

/**
 * Las dos claves de metadata que son puramente de PWA.
 *
 * Se declara un tipo propio en vez de `Pick<Metadata, …>` porque el
 * `appleWebApp` de Next admite además `boolean | null`, y con esa unión no se
 * puede leer `.capable` sin estrechar en cada uso.
 */
export type MetadataPwa = {
  manifest?: string;
  appleWebApp?: {
    capable: boolean;
    title: string;
    statusBarStyle: "black-translucent";
  };
};

/**
 * La metadata de PWA que corresponde a este build.
 *
 * En el contenedor devuelve un objeto VACÍO, no las claves en `undefined`: se
 * usa con spread sobre `metadata`, y una clave presente es una clave que Next
 * puede llegar a emitir.
 *
 * - `manifest`: `pageExtensions` sin `"ts"` ya excluye `app/manifest.ts` del
 *   export, así que el link apuntaría a un 404 dentro del APK.
 * - `appleWebApp`: es metadata de "agregar a inicio" en Safari. En un APK no
 *   significa nada.
 */
export function metadataPwa(nativo: boolean = ES_NATIVO): MetadataPwa {
  if (nativo) return {};
  return {
    // Next inyecta <link rel="manifest"> apuntando a la metadata route app/manifest.ts.
    manifest: "/manifest.webmanifest",
    // iOS ignora el manifest: estas son las que hacen que se abra en standalone,
    // con la barra de estado translúcida y el título correcto bajo el ícono.
    appleWebApp: {
      capable: true,
      title: "Yump",
      statusBarStyle: "black-translucent",
    },
  };
}
