package ar.yump.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// El puente con la opción "Medición de campañas con Meta" de Sobre Yump
// (lib/medicion-meta.ts). Es un plugin LOCAL de la app, no un paquete: no suma
// dependencias. Sólo lee y cambia la elección; la lógica está en MedicionMeta.
@CapacitorPlugin(name = "MedicionMeta")
public class MedicionMetaPlugin extends Plugin {

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("activa", MedicionMeta.activa(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void cambiar(PluginCall call) {
        Boolean activar = call.getBoolean("activa");
        if (activar == null) {
            call.reject("falta activa");
            return;
        }
        // En el hilo principal, como el inicializador del SDK que reemplaza.
        getActivity().runOnUiThread(() -> {
            MedicionMeta.cambiar(getActivity().getApplication(), activar);
            JSObject r = new JSObject();
            r.put("activa", MedicionMeta.activa(getContext()));
            call.resolve(r);
        });
    }
}
