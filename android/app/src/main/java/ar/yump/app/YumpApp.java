package ar.yump.app;

import android.app.Application;

// Existe sólo para decidir la medición de Meta ANTES de que se cree cualquier
// Activity: el manifest quita el inicializador automático del SDK, y acá se lo
// arranca únicamente si la persona no lo desactivó. Ver MedicionMeta.
public class YumpApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        MedicionMeta.alArrancar(this);
    }
}
