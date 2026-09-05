# CP8 #14 — POST autenticado desde el contenedor Android

Fecha: 2026-09-05 · Rama `spike/capacitor-android` · APK de depuración sobre
`ar.yump.app.dev` · Preview `streamingcentral-cd2tr86cd-….vercel.app`

## Cómo se produjo

Con la sesión iniciada **por el dueño**, en una cuenta de QA creada por él
mediante el flujo normal de la app. **No se leyeron, copiaron ni conservaron sus
credenciales**, y el token no se extrajo: lo que sigue está redactado en origen.

El POST no se fabricó con `curl` ni se disparó a mano. Sale del riel *"Elegidas
para vos"* (`components/TeVaAGustar.tsx`), que sólo pide si la cuenta tiene
señales — así que primero se generaron con dos acciones reales dentro de la app:
marcar "Ya la vi" y votar "Ta buena" sobre una ficha.

## Lo observado en Network

```
POST https://streamingcentral-cd2tr86cd-….vercel.app/api/te-va-a-gustar

  pedido:
    authorization: Bearer <REDACTADO 972 chars>
    origin:        https://localhost
    content-type:  application/json
    referer:       https://localhost/

  respuesta:  200
    access-control-allow-origin: https://localhost
    content-type:                application/json
    vary:  RSC, Next-Router-State-Tree, Next-Router-Prefetch, Origin
```

## Contra los criterios

| Criterio | Resultado |
|---|---|
| Usuario conectado | ✅ sesión activa, cuenta de QA |
| `Bearer` enviado por la aplicación | ✅ (redactado) |
| Respuesta `2xx` | ✅ **200** — un `401` no habría aprobado este punto |
| `Access-Control-Allow-Origin: https://localhost` | ✅ el origen exacto, no un comodín |
| `Vary: Origin` | ✅ |
| Sin `Access-Control-Allow-Origin: *` | ✅ ausente |
| Sin `Access-Control-Allow-Credentials` | ✅ ausente — la sesión va por `Bearer`, no por cookie |
| Sesión conservada al cerrar y reabrir | ✅ `am force-stop` + relanzar: sigue activa y el riel vuelve a renderizar |

## Lo que este documento NO afirma

Que el contenedor haga POST autenticados a **otras** rutas: se probó ésta, que es
la que CP4 dejó designada. Y no dice nada sobre Producción — todo corrió contra
una Preview con el Redis aislado (`/api/health`: `503`, `cache: "memoria"`,
credenciales ausentes).
