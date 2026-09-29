"use client";
import { PieResultado } from "./ResultadoMatch";
import { useVenceEn } from "@/hooks/useVenceEn";
import type { EstadoSala } from "@/lib/sala/estado";

// "Esta vez no hubo match" (plan de salas, Tarea 4.1; texto y forma definitivos
// del dueño, 23/09).
//
// Arriba una carita triste, debajo el título y la bajada. Reemplazó a las cards
// de la tanda separándose: el dueño describió la pantalla entera y las cards no
// están en ella. Ver una tras otra las que NO coincidieron no le servía a nadie
// —y para el invitado eran lo único que había, porque las acciones son del
// organizador—.
//
// La línea de "Otra tanda" SÓLO la ve quien organiza, porque es lo único que
// puede hacer; al invitado no se le ofrece una acción que no tiene.
// `puede_otra_tanda` lo decide la base (ver PieResultado): acá no se deduce.
export default function ResultadoSinCoincidencias({ estado, roomId, desfase, releer }: {
  estado: EstadoSala; roomId: string; desfase: number; releer: () => Promise<void>;
}) {
  const seg = useVenceEn(estado, desfase);
  return (
    <div className="sala-resultado sala-sin">
      <p className="sala-carita" aria-hidden>🙁</p>
      <h1 className="sala-h1 sala-titular">Esta vez no hubo match</h1>
      <p className="sala-hint sala-sin-bajada">Ninguna película tuvo coincidencias. Suele pasar.</p>
      {estado.resultado?.puede_otra_tanda === true && (
        <p className="sala-hint sala-sin-bajada">Si elegís Otra tanda pueden ver otras.</p>
      )}
      <PieResultado estado={estado} roomId={roomId} seg={seg} releer={releer} sinCoincidencias />
    </div>
  );
}
