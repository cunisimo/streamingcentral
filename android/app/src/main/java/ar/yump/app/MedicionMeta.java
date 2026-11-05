package ar.yump.app;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

import com.facebook.FacebookSdk;

// La medición de campañas con Meta: ÚNICO lugar de la app que toca el SDK.
//
// Decisión del dueño (30/10/2026): activada por defecto, sin ventanas ni pedidos
// de permiso, y desactivable desde "Sobre Yump". La elección es POR DISPOSITIVO
// (no por cuenta): vive en las SharedPreferences de la app, así que cerrar
// sesión o cambiar de cuenta no la toca, y una actualización tampoco.
//
// 🔴 POR QUÉ EL SDK NO ARRANCA SOLO. facebook-core trae un ContentProvider
// (FacebookInitProvider) que llama a sdkInitialize antes que cualquier código
// nuestro, y sdkInitialize consulta a Meta (ajustes de la app, gatekeepers)
// aunque los eventos automáticos estén apagados. Por eso el manifest QUITA ese
// provider y el SDK se inicializa acá, en YumpApp.onCreate, SÓLO si la medición
// está activa. Con la medición desactivada el SDK no se inicializa en toda la
// sesión: no registra nada ni se conecta con Meta.
//
// Apagar durante el uso (el SDK ya arrancó): se apagan los eventos automáticos
// (instalación y aperturas) y la recolección del ID de publicidad. El SDK guarda
// esas dos banderas en sus propias preferencias, así que también rigen si algo
// lo inicializara. LÍMITE CONOCIDO: lo que el SDK ya había registrado ANTES de
// apagar (la apertura de esa sesión) puede salir en su próximo envío; el SDK no
// tiene una API pública para descartar esa cola. Nada nuevo se registra.
//
// No hay eventos propios: nada de la cuenta, de las reseñas ni de lo que la
// persona hace adentro de Yump sale hacia Meta. lib/meta-sdk.test.ts lo vigila.
final class MedicionMeta {
    private static final String PREFS = "yump.medicion";
    private static final String CLAVE = "meta_activa";

    private MedicionMeta() {}

    /** Activada salvo que la persona la haya desactivado: sin elección guardada, true. */
    static boolean activa(Context contexto) {
        return prefs(contexto).getBoolean(CLAVE, true);
    }

    /** Al arrancar la app, antes de cualquier Activity. */
    static void alArrancar(Application app) {
        if (activa(app)) encender(app);
    }

    /** La elección de la persona: se guarda primero y se aplica en el acto. */
    static synchronized void cambiar(Application app, boolean activar) {
        // commit y no apply: la elección tiene que estar en disco antes de
        // responder, por si la app se cierra enseguida.
        prefs(app).edit().putBoolean(CLAVE, activar).commit();
        if (activar) encender(app);
        else apagar();
    }

    private static void encender(Application app) {
        if (!FacebookSdk.isInitialized()) FacebookSdk.sdkInitialize(app);
        // Si se había apagado en otra sesión, el SDK recuerda las banderas en
        // false: se vuelven a encender. Sólo si hace falta, porque encender los
        // eventos automáticos arranca el seguimiento de aperturas.
        if (!FacebookSdk.getAdvertiserIDCollectionEnabled()) FacebookSdk.setAdvertiserIDCollectionEnabled(true);
        if (!FacebookSdk.getAutoLogAppEventsEnabled()) FacebookSdk.setAutoLogAppEventsEnabled(true);
    }

    private static void apagar() {
        // Si el SDK no arrancó en esta sesión, no hay nada que detener: no se
        // inicializa sólo para apagarlo.
        if (!FacebookSdk.isInitialized()) return;
        FacebookSdk.setAutoLogAppEventsEnabled(false);
        FacebookSdk.setAdvertiserIDCollectionEnabled(false);
    }

    private static SharedPreferences prefs(Context contexto) {
        return contexto.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
