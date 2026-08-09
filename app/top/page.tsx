import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import TopView from "@/components/TopView";

export const metadata = { title: "Top Yump" };

export default function Top() {
  return (<><TopBar /><main><TopView /></main><BottomNav /></>);
}
