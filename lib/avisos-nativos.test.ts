// Los avisos de estreno en Android: lo que no se puede romper sin enterarse.
//
// La lógica de fecha, identificador y payload se prueba en
// `lib/recordatorios.test.ts`, que es un módulo puro. Acá van los contratos que
// viven repartidos entre el componente, el layout y el manifest, y que fallan en
// silencio: un permiso pedido al arrancar, un import estático que arrastra el
// plugin al bundle web, o una alarma exacta que reaparece en el APK.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const leer = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const BOTON = "components/RecordarButton.tsx";
const LISTENER = "components/nativo/AvisoNativo.tsx";

// ------------------------------------------------- el plugin, sólo en nativo

test("🔴 el plugin no entra al bundle web: import dinámico detrás de la bandera", () => {
  for (const f of [BOTON, LISTENER]) {
    const src = codigo(f);
    assert.doesNotMatch(src, /^import .*@capacitor\/local-notifications/m,
      `${f}: import estático — arrastra el plugin al bundle web`);
    assert.match(src, /await import\("@capacitor\/local-notifications"\)/, `${f}: falta el import dinámico`);
    assert.match(src, /ES_NATIVO/, `${f}: no consulta la bandera de build`);
  }
  // Y nadie más lo importa.
  for (const f of ["components/DetailView.tsx", "components/upcoming/UpcomingCard.tsx", "app/layout.tsx"]) {
    if (!existsSync(new URL("../" + f, import.meta.url))) continue;
    assert.doesNotMatch(codigo(f), /@capacitor\/local-notifications/, `${f} importa el plugin`);
  }
});

test("el listener sale por return en web, antes de tocar el plugin", () => {
  assert.match(codigo(LISTENER), /if \(!ES_NATIVO\) return;/);
});

// --------------------------------------------- el permiso, sólo por un toque

test("🔴 el permiso se pide DENTRO del handler del toque, nunca al arrancar", () => {
  const src = codigo(BOTON);
  const iHandler = src.indexOf("const alternarAviso");
  const iFin = src.indexOf("const cerrar = useCallback", iHandler);
  const pedido = src.indexOf("requestPermissions");
  assert.ok(iHandler >= 0 && pedido > iHandler && pedido < iFin,
    "requestPermissions quedó fuera del handler: se pediría sin que el usuario toque nada");
  // Y el efecto de montaje sólo mira pendientes; no pide ni consulta permisos.
  const efecto = src.slice(src.indexOf("useEffect(() => {"), iHandler);
  assert.match(efecto, /idsPendientes\(\)/, "el montaje tiene que leer los pendientes para saber el estado");
  assert.doesNotMatch(efecto, /requestPermissions|checkPermissions/,
    "el montaje toca permisos: eso es pedirlos al arrancar la app");
});

test("🔴 si el permiso se rechaza se OFRECE Google Calendar, no se abre solo", () => {
  const src = codigo(BOTON);
  assert.match(src, /setAviso\("denegado"\)/, "no hay estado de rechazo");
  assert.match(src, /aviso === "denegado"[\s\S]{0,400}Agendar en Google Calendar/,
    "el rechazo no ofrece el calendario");
  // Un <a> que el usuario decide tocar. Nada de window.open ni location.
  assert.doesNotMatch(src, /window\.open\(google|location\.href = google/,
    "abre el calendario solo: la decisión es del usuario");
});

// ------------------------------------------------ el estado y el doble toque

test("un segundo toque cancela, y no se puede tocar dos veces mientras trabaja", () => {
  const src = codigo(BOTON);
  assert.match(src, /if \(aviso === "listo"\) \{[\s\S]{0,200}LocalNotifications\.cancel/,
    "el segundo toque no cancela");
  assert.match(src, /if \(ocupado \|\| idAviso === null\) return;/, "no hay guard de doble toque");
  assert.match(src, /idsPendientes\(\)/, "al montar no consulta los pendientes: el estado sería adivinado");
});

test("🔴 el estreno de hoy pasadas las 10 avisa, no programa nada", () => {
  const src = codigo(BOTON);
  assert.match(src, /cuando\.estado !== "programable"/, "programa sin mirar si hay futuro");
  assert.match(src, /"hoy-tarde" \? "hoy"/, "no distingue el estreno de hoy");
  assert.match(src, /Este estreno es hoy/, "falta el texto del caso de hoy");
  // Y la decisión de la fecha va ANTES del permiso: no se pide para nada.
  assert.ok(src.indexOf("momentoDeAviso(fecha)") < src.indexOf("requestPermissions"),
    "pide el permiso antes de saber si hay algo que programar");
});

// ------------------------------------------------------ la alarma NO exacta

test("🔴 se programa como alarma INEXACTA, y el permiso sensible no se pide", () => {
  assert.match(codigo(BOTON), /isExactNotification: false/,
    "el plugin usa true por defecto: abriría la pantalla de Alarmas y recordatorios");
  const manifest = leer("android/app/src/main/AndroidManifest.xml");
  for (const p of ["SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM"]) {
    assert.match(manifest, new RegExp(p + '"\\s+tools:node="remove"'),
      `${p} no se está quitando del manifest fusionado`);
  }
  assert.doesNotMatch(codigo(BOTON), /changeExactNotificationSetting|checkExactNotificationSetting/,
    "no se toca la pantalla de alarmas exactas");
});

test("el canal es el compartido, con sonido por defecto", () => {
  const src = codigo(BOTON);
  assert.match(src, /createChannel\(CANAL_ESTRENOS\)/, "no crea el canal");
  assert.doesNotMatch(src, /sound:/, "un sonido propio habría que subirlo al APK");
});

// ---------------------------------------------------------- abrir la ficha

test("🔴 el aviso abre la ficha con la ruta interna, y valida lo que trae", () => {
  const src = codigo(LISTENER);
  assert.match(src, /localNotificationActionPerformed/, "no escucha el toque del aviso");
  assert.match(src, /leerExtraAviso\(accion\?\.notification\?\.extra\)/,
    "usa el extra sin validarlo: viene del sistema, días después");
  assert.match(src, /if \(!extra\) return;/, "un extra inválido tiene que descartarse");
  assert.match(src, /router\.push\(hrefTitulo\(extra\.tipo, extra\.id\)\)/,
    "no navega con hrefTitulo: en el artefacto nativo /titulo/... no existe");
});

test("el listener se registra UNA vez, en la raíz, y se limpia", () => {
  const src = codigo(LISTENER);
  assert.match(src, /remove\(\)/, "no se remueve: se duplicaría al remontar");
  assert.match(src, /\}, \[\]\);/, "el efecto tiene que correr una sola vez");
  const layout = codigo("app/layout.tsx");
  assert.match(layout, /<AvisoNativo \/>/, "no está montado en el layout raíz");
  // Y no desplaza a los que ya estaban.
  for (const c of ["<NavHistorial />", "<AtrasNativo />"]) {
    assert.ok(layout.includes(c), `${c} desapareció del layout`);
  }
});

// ------------------------------------------------------------- el ícono

test("el ícono chico existe en las cinco densidades y sale del generador", () => {
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    assert.ok(existsSync(new URL(`../android/app/src/main/res/drawable-${d}/ic_stat_yump.png`, import.meta.url)),
      `falta drawable-${d}/ic_stat_yump.png`);
  }
  assert.match(codigo(BOTON), /smallIcon: "ic_stat_yump"/, "el aviso no usa el ícono de la marca");
  const gen = leer("scripts/generate-android-assets.mjs");
  assert.match(gen, /ic_stat_yump\.png/, "el ícono no se genera: quedaría huérfano si cambia la marca");
  assert.match(gen, /SIMBOLO/, "no sale de la misma fuente que el resto de la marca");
});

// -------------------------------------------------------- la web no cambia

test("🔴 en la web sigue el menú de Google Calendar y el .ics", () => {
  const src = codigo(BOTON);
  assert.match(src, /googleCalendarUrl/, "se perdió Google Calendar");
  assert.match(src, /icsUrl/, "se perdió el .ics");
  assert.match(src, /!ES_NATIVO && \(/, "la fila del .ics dejó de estar gateada");
});

// ============================================================================
// LA TARJETA DE PRÓXIMAMENTE HACE LO MISMO QUE LA FICHA
// ============================================================================
// Antes el ícono de calendario de la tarjeta abría Google Calendar también en
// el contenedor: el flujo nativo estaba sólo en la rama `variant === "texto"`.
// Quedaban dos comportamientos para el mismo gesto, y un recordatorio hecho
// desde la tarjeta no existía para la ficha.

test("🔴 el control de la tarjeta existe en UN solo lugar", () => {
  // Si mañana aparece otro componente con su propio botón de calendario, esto
  // falla: la sincronización entre superficies depende de que sea el mismo.
  const card = codigo("components/upcoming/UpcomingCard.tsx");
  assert.match(card, /<RecordarButton/, "la tarjeta dejó de usar el componente compartido");
  assert.match(card, /variant="icono"/, "cambió la variante de la tarjeta");
  assert.doesNotMatch(card, /@capacitor\/local-notifications|LocalNotifications|requestPermissions/,
    "la tarjeta implementó su propio flujo: eso es la duplicación que se vino a sacar");
  // Y las dos superficies que montan la tarjeta usan la MISMA.
  for (const f of ["components/upcoming/UpcomingAllView.tsx", "components/upcoming/UpcomingSection.tsx"]) {
    assert.match(codigo(f), /<UpcomingCard /, `${f} dejó de usar UpcomingCard`);
  }
});

test("🔴 en Android la tarjeta programa el aviso, no abre el calendario", () => {
  const src = codigo(BOTON);
  assert.match(src, /if \(ES_NATIVO && variant === "icono"\)/,
    "la variante de la tarjeta no tiene rama nativa");
  // La rama nativa de la tarjeta usa el MISMO handler y el MISMO estado que la
  // ficha: no hay una segunda programación, ni otro permiso, ni otro id.
  const rama = src.slice(src.indexOf('if (ES_NATIVO && variant === "icono")'));
  assert.match(rama, /void alternarAviso\(\)/, "la tarjeta no usa el handler compartido");
  assert.match(rama, /aviso === "listo"/, "la tarjeta no refleja el estado programado");
  assert.match(rama, /aviso === "hoy"/, "la tarjeta no contempla el estreno de hoy");
  assert.match(rama, /aviso === "denegado"/, "la tarjeta no contempla el permiso rechazado");
  // Un solo lugar programa, un solo lugar pide permiso.
  assert.equal((src.match(/LocalNotifications\.schedule/g) ?? []).length, 1, "hay más de un schedule");
  assert.equal((src.match(/requestPermissions/g) ?? []).length, 1, "hay más de un pedido de permiso");
  assert.equal((src.match(/idRecordatorio\(/g) ?? []).length, 1, "el id se calcula en más de un lugar");
});

test("🔴 las dos superficies preguntan por el MISMO id pendiente", () => {
  // Es lo que hace que programar desde una tarjeta se vea en la ficha: el id
  // sale de `idRecordatorio(tipo, id)` y el estado, de los pendientes del
  // plugin. No hay estado propio de cada superficie que pueda desincronizarse.
  const src = codigo(BOTON);
  assert.match(src, /const idAviso = idRecordatorio\(tipo, id\);/,
    "el id dejó de salir del módulo puro");
  assert.match(src, /ids\.includes\(idAviso\) \? "listo" : "no"/,
    "el estado inicial dejó de salir de los pendientes del plugin");
  assert.doesNotMatch(src, /localStorage|sessionStorage/,
    "apareció estado propio: el plugin es la única fuente de verdad");
});

test("🔴 una sola consulta de pendientes por tanda, no una por tarjeta", () => {
  // La grilla monta hasta 40 tarjetas a la vez. Sin esto le preguntaría al
  // plugin cuarenta veces lo mismo en el mismo frame.
  const src = codigo(BOTON);
  assert.match(src, /let enVuelo: Promise<number\[\]> \| null = null;/, "no hay consulta compartida");
  assert.equal((src.match(/LocalNotifications\.getPending/g) ?? []).length, 1,
    "getPending se llama desde más de un lugar");
  assert.match(src, /\.finally\(\(\) => \{ enVuelo = null; \}\)/,
    "la promesa no se suelta: el estado quedaría viejo después de programar");
});

test("🔴 en la tarjeta, el permiso rechazado ofrece Calendar sin abrirlo", () => {
  const src = codigo(BOTON);
  const rama = src.slice(src.indexOf('if (ES_NATIVO && variant === "icono")'));
  assert.match(rama, /aviso === "denegado"[\s\S]{0,320}href=\{google\}/,
    "el rechazo no ofrece el calendario en la tarjeta");
  assert.doesNotMatch(rama, /window\.open|location\.href/, "lo abre solo");
});

test("🔴 en la WEB la tarjeta sigue yendo derecho a Google Calendar", () => {
  const src = codigo(BOTON);
  // Después de la rama nativa queda el return de siempre: un <a> al calendario.
  const web = src.slice(src.lastIndexOf("return ("));
  assert.match(web, /className=\{`quick-add quick-cal/, "cambió el control de la tarjeta web");
  assert.match(web, /href=\{google\}/, "la tarjeta web dejó de ir a Google Calendar");
  assert.match(web, /target="_blank"/, "la tarjeta web dejó de abrir en otra pestaña");
});

test("no se tocó la lógica de Próximamente", () => {
  // El cambio es del control, no de la sección: paginación, filtro y
  // restauración siguen donde estaban.
  const vista = codigo("components/upcoming/UpcomingAllView.tsx");
  for (const marca of ["useListaPaginada", "apiUrl(`/api/upcoming?${mt}page=${p}`)", "Cargar más"]) {
    assert.ok(vista.includes(marca), `desapareció "${marca}" de UpcomingAllView`);
  }
  const card = codigo("components/upcoming/UpcomingCard.tsx");
  assert.match(card, /item\.type !== "movie" && <RecordarButton/,
    "cambió la condición que decide cuándo se ofrece el recordatorio");
  assert.match(card, /hrefTitulo\(item\.type, item\.id\)/, "la tarjeta cambió su enlace a la ficha");
});
