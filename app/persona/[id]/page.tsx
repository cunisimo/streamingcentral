import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import PersonView from "@/components/PersonView";
export default function Persona({ params }: { params: { id: string } }) {
  return (<><TopBar /><main><PersonView id={params.id} /></main><BottomNav /></>);
}
