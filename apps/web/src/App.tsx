import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { isProjectorView, roomIdFromPath } from "./lib/links";
import { usePathname } from "./lib/router";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

export function App() {
  const roomId = roomIdFromPath(usePathname());
  // Lo schermo condiviso non mostra comandi, nemmeno la scelta della lingua.
  const projector = roomId !== null && isProjectorView(window.location.search);
  return (
    <>
      {!projector && <LanguageSwitcher />}
      {roomId ? <RoomPage key={roomId} roomId={roomId} /> : <HomePage />}
    </>
  );
}
