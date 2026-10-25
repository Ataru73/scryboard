import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { roomIdFromPath } from "./lib/links";
import { usePathname } from "./lib/router";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

export function App() {
  const roomId = roomIdFromPath(usePathname());
  return (
    <>
      <LanguageSwitcher />
      {roomId ? <RoomPage key={roomId} roomId={roomId} /> : <HomePage />}
    </>
  );
}
