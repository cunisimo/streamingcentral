import DetailView from "@/components/DetailView";
import type { MediaType } from "@/lib/types";
export default function Titulo({ params }: { params: { tipo: string; id: string } }) {
  return <DetailView tipo={params.tipo as MediaType} id={params.id} />;
}
