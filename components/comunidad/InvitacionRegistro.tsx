"use client";
import Link from "next/link";

// Sin sesión, en lugar de la lista de la comunidad (E5a). Sale IGUAL en
// cualquier ficha, tenga o no reseñas: no revela si las hay. Leer, escribir y
// evaluar reseñas de la comunidad exige una cuenta.
export default function InvitacionRegistro() {
  return (
    <div className="cm-invita" role="note">
      <p className="cm-invita-t">Reseñas de la comunidad</p>
      <p className="cm-sub">Para leer y escribir reseñas de la comunidad, creá una cuenta o ingresá con la tuya.</p>
      <Link className="btn" href="/cuenta">Crear cuenta o ingresar</Link>
    </div>
  );
}
