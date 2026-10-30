package ar.yump.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// 🔴 ACÁ NO VA UN RouteProcessor, Y NO ES PORQUE NO SE HAYA INTENTADO.
//
// El 2026-09-06 se probó entero el arreglo de subrutas: `CapConfig.Builder.setHTML5mode(false)` más
// un `RouteProcessor` propio que resolvía `/ruta/` a `/ruta/index.html` contra los assets reales.
// Todo con API pública, sin parchear `node_modules` ni reflexión. NO FUNCIONA, y el motivo es
// anterior al punto de extensión: `WebViewLocalServer.handleLocalRequest` decide si responde
// ANTES de llamar al `PathHandler`, y su última rama es
//
//     int periodIndex = path.lastIndexOf(".");
//     if (periodIndex >= 0) { ...responde... }
//     return null;
//
// O sea que una ruta sin ningún punto —`/top/`, `/t/`, `/lista/ultimos/`— sale por ese
// `return null`, que para la WebView significa "resolvelo vos", y como `https://localhost` no
// existe fuera del contenedor la navegación falla. Medido: con `html5mode` apagado esas rutas dan
// `Failed to fetch`, que es PEOR que el problema original; con `html5mode` prendido el
// `RouteProcessor` ni ve la ruta, porque esa rama lo llama con `"/index.html"` fijo.
//
// Arreglarlo pediría reemplazar el servidor local (`shouldInterceptRequest`), que es justo lo que
// el dueño excluyó. El detalle está en el plan de Etapa 3.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin local de la opción de Meta en Sobre Yump (ver MedicionMeta).
        // Se registra ANTES de super.onCreate, que es cuando el bridge arranca.
        registerPlugin(MedicionMetaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
