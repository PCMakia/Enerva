import { useRef } from "react";
import { useClickThrough, EMPTY_CURSOR, type GlobalCursor } from "./hooks/useClickThrough";
import { DiaryDrawer } from "./components/DiaryDrawer";
import { Mascot } from "./components/Mascot";

function App() {
  const cursorRef = useRef<GlobalCursor>(EMPTY_CURSOR);
  useClickThrough(true, cursorRef);

  return (
    <main className="overlay-shell">
      <Mascot cursorRef={cursorRef} />
      <DiaryDrawer />
    </main>
  );
}

export default App;
