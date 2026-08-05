import { useRef, useState } from "react";
import { useClickThrough, EMPTY_CURSOR, type GlobalCursor } from "./hooks/useClickThrough";
import { DiaryDrawer } from "./components/DiaryDrawer";
import { Mascot } from "./components/Mascot";
import { RadialMenu, type RadialMenuMode, type RadialMenuSelection } from "./components/RadialMenu";
import { WatchWidget } from "./components/WatchWidget";

function App() {
  const cursorRef = useRef<GlobalCursor>(EMPTY_CURSOR);
  useClickThrough(true, cursorRef);

  const [radialMenu, setRadialMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    wheel: RadialMenuMode;
  }>({
    open: false,
    x: 0,
    y: 0,
    wheel: "main",
  });
  const [watchVisible, setWatchVisible] = useState(false);
  const [watchMode, setWatchMode] = useState<RadialMenuSelection>("pomodoro");

  const closeRadial = () =>
    setRadialMenu((prev) => ({ ...prev, open: false, wheel: "main" }));

  return (
    <main className="overlay-shell">
      <Mascot
        cursorRef={cursorRef}
        onContextMenuRequest={(x, y) => {
          setRadialMenu({ open: true, x, y, wheel: "main" });
        }}
      />
      <DiaryDrawer />
      <RadialMenu
        open={radialMenu.open}
        x={radialMenu.x}
        y={radialMenu.y}
        mode={radialMenu.wheel}
        onClose={closeRadial}
        onWheelModeChange={(wheel) => setRadialMenu((prev) => ({ ...prev, wheel }))}
        onSelectTimer={(mode) => {
          setWatchMode(mode);
          setWatchVisible(true);
          closeRadial();
        }}
        onOpenTasks={closeRadial}
        onOpenRoutines={closeRadial}
      />
      <WatchWidget
        visible={watchVisible}
        mode={watchMode}
        onClose={() => setWatchVisible(false)}
      />
    </main>
  );
}

export default App;
